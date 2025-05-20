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
const { createCanvas } = require('canvas'); // Used for generating board images

const app = express();
const port = 3000;

// Serve static files and enable JSON parsing for requests
app.use(express.static(path.join(__dirname, '../')));
app.use(express.json());

// User registration endpoint
app.post('/register', express.json(), async (req, res) => {
    const { username, password } = req.body;
    try {
        await saveUser(username, password);
        res.status(201).send('Usuario registrado con éxito.');
    } catch (error) {
        res.status(400).send(error.message);
    }
});

// User authentication endpoint
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

// Endpoint to download a board as an image (PNG)
app.get('/download/:boardName', async (req, res) => {
    const { boardName } = req.params;
    try {
        const content = await getBoardContent(boardName);
        const canvas = createCanvas(800, 600);
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#000000';
        ctx.font = '16px Arial';
        ctx.fillText(content, 50, 50);

        res.setHeader('Content-Type', 'image/png');
        canvas.createPNGStream().pipe(res);
    } catch (error) {
        res.status(400).send(error.message);
    }
});

// Endpoint to save a board's content
app.post('/save-board', express.json(), async (req, res) => {
    const { boardName, content } = req.body;
    try {
        await updateBoardContent(boardName, content);
        res.status(200).send('Pizarra guardada.');
    } catch (error) {
        res.status(400).send(error.message);
    }
});

// Endpoint to load a board's content
app.get('/load-board/:boardName', async (req, res) => {
    const { boardName } = req.params;
    try {
        const content = await getBoardContent(boardName);
        res.status(200).json({ content });
    } catch (error) {
        res.status(400).send(error.message);
    }
});

// Endpoint to get the list of boards from ZooKeeper
app.get('/get-boards', async (req, res) => {
    try {
        const boards = await zookeeperClient.getChildren('/boards');
        res.json({ boards });
    } catch (error) {
        console.error('Error al obtener las pizarras:', error);
        res.status(500).json({ error: 'Error al obtener las pizarras' });
    }
});

// Endpoint to create a new board in ZooKeeper
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

// Endpoint to delete a board from ZooKeeper
app.delete('/delete-board', async (req, res) => {
    const { boardName } = req.body;

    if (!boardName) {
        return res.status(400).json({ error: 'El nombre de la pizarra es obligatorio.' });
    }

    try {
        await zookeeperClient.deleteBoard(boardName);
        console.log(`Pizarra "${boardName}" eliminada.`);
        res.status(200).json({ message: 'Pizarra eliminada correctamente.' });
    } catch (error) {
        console.error('Error al eliminar la pizarra:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// WebSocket server setup for real-time board collaboration
const wss = new WebSocket.Server({ noServer: true });
const boards = {}; // In-memory storage for board contents
let currentEditor = null; // Tracks the current editor (user with edit lock)
let editorQueue = []; // Queue for users waiting for edit control

wss.on('connection', (ws) => {
    ws.on('message', async (message) => {
        const data = JSON.parse(message);

        // Handle user joining a board: load content from ZooKeeper and send to user
        if (data.type === 'join-board') {
            let canvasData = '';
            try {
                canvasData = await getBoardContent(data.boardName);
                boards[data.boardName] = { content: canvasData };
            } catch (err) {
                boards[data.boardName] = { content: '' };
                canvasData = '';
            }
            ws.send(JSON.stringify({ type: 'update-canvas', canvasData }));

        // Handle canvas updates: save to memory and ZooKeeper, then broadcast
        } else if (data.type === 'update-canvas') {
            boards[data.boardName].content = data.canvasData;
            try {
                await updateBoardContent(data.boardName, data.canvasData);
            } catch (err) {
                console.error('Error al guardar el contenido en ZooKeeper:', err);
            }
            broadcast(data, ws);

        // Handle board list requests
        } else if (data.type === 'get-boards') {
            ws.send(JSON.stringify({ type: 'board-list', boards: Object.keys(boards) }));

        // Handle board creation and notify all clients
        } else if (data.type === 'create-board') {
            const { boardName, user } = data;
            if (!boards[boardName]) {
                boards[boardName] = { content: '', owner: user };
                broadcast({ type: 'board-list', boards: Object.keys(boards) });
                console.log(`Pizarra creada: ${boardName}`);
            } else {
                ws.send(JSON.stringify({ type: 'error', message: 'La pizarra ya existe.' }));
            }

        // Handle generic content update and broadcast
        } else if (data.type === 'update') {
            boards[data.boardName].content = data.message;
            broadcast({ type: 'update', message: data.message, boardName: data.boardName });

        // Handle lock requests for collaborative editing
        } else if (data.type === 'lock') {
            if (data.request) {
                handleLockRequest(ws, data.boardName);
            } else {
                releaseLock(ws);
            }

        // Handle pointer position updates for collaborative cursors
        } else if (data.type === 'pointer') {
            broadcast(data, ws);
        }
    });

    // Handle user disconnect: release lock and update queue
    ws.on('close', () => {
        if (currentEditor === ws) {
            releaseLock(ws);
        }
        editorQueue = editorQueue.filter((client) => client !== ws);
    });
});

// Handles lock requests for collaborative editing
function handleLockRequest(ws, boardName) {
    if (!currentEditor) {
        currentEditor = ws;
        ws.send(JSON.stringify({ type: 'lock', isLocked: true, username: ws.username }));
        broadcast({ type: 'lock', isLocked: false, username: ws.username }, ws);
    } else {
        editorQueue.push(ws);
        ws.send(JSON.stringify({ type: 'lock', isLocked: false, username: currentEditor.username }));
    }
}

// Releases the edit lock and assigns it to the next user in the queue if available
function releaseLock(ws) {
    if (currentEditor === ws) {
        currentEditor = null;
        if (editorQueue.length > 0) {
            const nextEditor = editorQueue.shift();
            currentEditor = nextEditor;
            nextEditor.send(JSON.stringify({ type: 'lock', isLocked: true, username: nextEditor.username }));
            broadcast({ type: 'lock', isLocked: false, username: nextEditor.username }, nextEditor);
        } else {
            broadcast({ type: 'lock', isLocked: false, username: null });
        }
    }
}

// Broadcasts a message to all connected WebSocket clients except the sender
function broadcast(data, exclude) {
    wss.clients.forEach((client) => {
        if (client !== exclude && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Start HTTP and WebSocket server
const server = app.listen(port, () => {
    console.log(`Servidor corriendo en http://localhost:${port}`);
});

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});