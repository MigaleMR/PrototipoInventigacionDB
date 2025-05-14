const express = require('express');
const zookeeperClient = require('./zookeeperClient');
const WebSocket = require('ws');
const path = require('path');
const {
    saveUser,
    authenticateUser,
    saveBoard,
    getBoardContent,
    updateBoardContent,
} = require('./zookeeperClient');
const { createCanvas } = require('canvas'); // Para generar imágenes de las pizarras

const app = express();
const port = 3000;

// Sirve archivos estáticos desde el directorio raíz
app.use(express.static(path.join(__dirname, '../')));
app.use(express.json()); // Necesario para manejar JSON en el cuerpo de las solicitudes

// Registro de usuario
app.post('/register', express.json(), async (req, res) => {
    const { username, password } = req.body;
    try {
        await saveUser(username, password);
        res.status(201).send('Usuario registrado con éxito.');
    } catch (error) {
        res.status(400).send(error.message);
    }
});

// Autenticación de usuario
app.post('/login', express.json(), async (req, res) => {
    const { username, password } = req.body;
    try {
        const authenticated = await authenticateUser(username, password);
        if (authenticated) {
            res.status(200).send('Autenticación exitosa.');
        } else {
            res.status(401).send('Credenciales incorrectas.');
        }
    } catch (error) {
        res.status(400).send(error.message);
    }
});

// Descarga de pizarra como imagen
app.get('/download/:boardName', async (req, res) => {
    const { boardName } = req.params;
    try {
        const content = await getBoardContent(boardName);
        const canvas = createCanvas(800, 600);
        const ctx = canvas.getContext('2d');

        // Dibujar el contenido de la pizarra en el canvas
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000000';
        ctx.font = '16px Arial';
        ctx.fillText(content, 50, 50);

        // Enviar la imagen como respuesta
        res.setHeader('Content-Type', 'image/png');
        canvas.createPNGStream().pipe(res);
    } catch (error) {
        res.status(400).send(error.message);
    }
});

app.post('/save-board', express.json(), async (req, res) => {
    const { boardName, content } = req.body;
    try {
        await updateBoardContent(boardName, content);
        res.status(200).send('Pizarra guardada.');
    } catch (error) {
        res.status(400).send(error.message);
    }
});

app.get('/load-board/:boardName', async (req, res) => {
    const { boardName } = req.params;
    try {
        const content = await getBoardContent(boardName);
        res.status(200).json({ content });
    } catch (error) {
        res.status(400).send(error.message);
    }
});

// Cargar la lista de pizarras desde ZooKeeper
app.get('/get-boards', async (req, res) => {
    try {
        const boards = await zookeeperClient.getChildren('/boards'); // Obtiene las pizarras desde ZooKeeper
        res.json({ boards });
    } catch (error) {
        console.error('Error al obtener las pizarras:', error);
        res.status(500).json({ error: 'Error al obtener las pizarras' });
    }
});

// Crear una nueva pizarra en ZooKeeper
app.post('/create-board', express.json(), async (req, res) => {
    const { boardName } = req.body;
    try {
        const existingBoards = await zookeeperClient.getChildren('/boards');
        if (existingBoards.includes(boardName)) {
            return res.status(400).json({ error: 'La pizarra ya existe.' });
        }

        await zookeeperClient.createNode(`/boards/${boardName}`, '');
        res.json({ success: true });
    } catch (error) {
        console.error('Error al crear la pizarra:', error);
        res.status(500).json({ error: 'Error al crear la pizarra' });
    }
});

app.delete('/delete-board', async (req, res) => {
    const { boardName } = req.body;

    if (!boardName) {
        return res.status(400).json({ error: 'El nombre de la pizarra es obligatorio.' });
    }

    try {
        // Llama a la función deleteBoard para eliminar la pizarra
        await zookeeperClient.deleteBoard(boardName);
        console.log(`Pizarra "${boardName}" eliminada.`);
        res.status(200).json({ message: 'Pizarra eliminada correctamente.' });
    } catch (error) {
        console.error('Error al eliminar la pizarra:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Configura WebSocket
const wss = new WebSocket.Server({ noServer: true });
const boards = {}; // Almacena el contenido de las pizarras en memoria
let currentEditor = null; // Usuario que tiene el control de edición
let editorQueue = []; // Cola de usuarios esperando el control

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'join-board') {
            if (!boards[data.boardName]) {
                // Inicializa la pizarra si no existe
                boards[data.boardName] = { content: '' };
            }

            // Envía el contenido actual de la pizarra al usuario que se une
            ws.send(JSON.stringify({ type: 'update', message: boards[data.boardName].content }));
        } else if (data.type === 'update-canvas') {
            // Actualiza el contenido de la pizarra
            boards[data.boardName].content = data.canvasData;

            // Transmite los cambios a todos los usuarios
            broadcast(data, ws);
        } else if (data.type === 'get-boards') {
            // Enviar la lista de pizarras al cliente que lo solicita
            ws.send(JSON.stringify({ type: 'board-list', boards: Object.keys(boards) }));
        } else if (data.type === 'create-board') {
            const { boardName, user } = data;

            // Verifica si el nombre de la pizarra ya existe
            if (!boards[boardName]) {
                boards[boardName] = { content: '', owner: user };

                // Enviar la lista actualizada de pizarras a todos los clientes
                broadcast({ type: 'board-list', boards: Object.keys(boards) });
                console.log(`Pizarra creada: ${boardName}`);
            } else {
                ws.send(JSON.stringify({ type: 'error', message: 'La pizarra ya existe.' }));
            }
        } else if (data.type === 'update') {
            boards[data.boardName].content = data.message;
            broadcast({ type: 'update', message: data.message, boardName: data.boardName });
        } else if (data.type === 'lock') {
            if (data.request) {
                handleLockRequest(ws, data.boardName);
            } else {
                releaseLock(ws);
            }
        }
    });

    ws.on('close', () => {
        if (currentEditor === ws) {
            releaseLock(ws);
        }
        editorQueue = editorQueue.filter((client) => client !== ws); // Elimina al usuario de la cola
    });
});

function handleLockRequest(ws, boardName) {
    if (!currentEditor) {
        // Si no hay un editor actual, asigna el control al usuario
        currentEditor = ws;
        ws.send(JSON.stringify({ type: 'lock', isLocked: true, username: ws.username }));
        broadcast({ type: 'lock', isLocked: false, username: ws.username }, ws);
    } else {
        // Si ya hay un editor, añade al usuario a la cola
        editorQueue.push(ws);
        ws.send(JSON.stringify({ type: 'lock', isLocked: false, username: currentEditor.username }));
    }
}

function releaseLock(ws) {
    if (currentEditor === ws) {
        currentEditor = null;

        // Si hay usuarios en la cola, asigna el control al siguiente
        if (editorQueue.length > 0) {
            const nextEditor = editorQueue.shift();
            currentEditor = nextEditor;
            nextEditor.send(JSON.stringify({ type: 'lock', isLocked: true, username: nextEditor.username }));
            broadcast({ type: 'lock', isLocked: false, username: nextEditor.username }, nextEditor);
        } else {
            // Notifica que no hay ningún editor actual
            broadcast({ type: 'lock', isLocked: false, username: null });
        }
    }
}

function broadcast(data, exclude) {
    wss.clients.forEach((client) => {
        if (client !== exclude && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Inicia el servidor HTTP y WebSocket
const server = app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});