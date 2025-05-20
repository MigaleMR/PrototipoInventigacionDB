// Obtener elementos del DOM
const userSection = document.getElementById('login-section');
const boardSection = document.getElementById('board-section');
const editorSection = document.getElementById('editor-section');

const usernameInput = document.getElementById('login-username');
const loginButton = document.getElementById('login-button');
const userDisplay = document.getElementById('user-display');

const boardList = document.getElementById('boards');
const newBoardNameInput = document.getElementById('new-board-name');
const createBoardButton = document.getElementById('create-board-button');

const boardTitle = document.getElementById('board-title');

const status = document.getElementById('status');
const clearButton = document.getElementById('clear-button');
const backButton = document.getElementById('back-button');

const canvas = document.getElementById('canvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let painting = false;
let lastX = 0;
let lastY = 0;

let currentTool = 'pencil'; // Herramienta actual
let brushColor = '#000';
let brushSize = 5; // Tamaño predeterminado más grande

document.getElementById('brush-size').value = brushSize; // Sincroniza el control deslizante

let isWritingText = false; // Indica si el modo de texto está activo

// Cambiar a la herramienta lápiz
document.getElementById('pencil-tool').addEventListener('click', () => {
    currentTool = 'pencil';
    canvas.style.cursor = 'crosshair'; // Cursor para dibujo
});

// Cambiar a la herramienta borrador
document.getElementById('eraser-tool').addEventListener('click', () => {
    currentTool = 'eraser';
    canvas.style.cursor = 'crosshair'; // Cursor para borrar
});

// Cambiar a la herramienta texto
document.getElementById('text-tool').addEventListener('click', () => {
    currentTool = 'text';
    canvas.style.cursor = 'text'; // Cursor para texto
    painting = false; // Detener cualquier dibujo activo
});

// Cambiar a la herramienta subrayado
document.getElementById('highlight-tool').addEventListener('click', () => {
    currentTool = 'highlight';
    canvas.style.cursor = 'crosshair'; // Usa el mismo cursor que el lápiz
});

// Cambiar a la herramienta figuras geométricas
document.getElementById('shape-tool').addEventListener('click', () => {
    currentTool = 'shape';
    canvas.style.cursor = 'crosshair'; // Cursor para figuras
});

document.getElementById('color-picker').addEventListener('input', (event) => {
    brushColor = event.target.value;
});

document.getElementById('brush-size').addEventListener('input', (event) => {
    brushSize = event.target.value;
});

const socket = new WebSocket('ws://localhost:3000');

let currentUser = null;
let currentBoard = null;

// Validar que los elementos existan
if (
    !userSection ||
    !boardSection ||
    !editorSection ||
    !usernameInput ||
    !loginButton ||
    !userDisplay ||
    !newBoardNameInput ||
    !createBoardButton ||
    !clearButton ||
    !backButton ||
    !canvas ||
    !ctx
) {
    console.error('Elementos faltantes:', {
        userSection,
        boardSection,
        editorSection,
        usernameInput,
        loginButton,
        userDisplay,
        newBoardNameInput,
        createBoardButton,
        clearButton,
        backButton,
        canvas,
        ctx,
    });
    throw new Error('Error crítico: elementos del DOM faltantes.');
}

// Conexión al servidor WebSocket
socket.onopen = () => {
    console.log('Conectado al servidor.');
};

// Maneja mensajes del servidor
socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'update-canvas') {
        const img = new Image();
        img.src = data.canvasData;
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height); // Limpia el canvas
            ctx.drawImage(img, 0, 0); // Dibuja la imagen recibida
        };
    } else if (data.type === 'board-list') {
        updateBoardList(data.boards);
    } else if (data.type === 'error') {
        alert(`Error: ${data.message}`);
    }
};

// Verifica el estado del WebSocket antes de enviar mensajes
function sendMessage(data) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    } else {
        console.error('WebSocket no está abierto. Estado actual:', socket.readyState);
    }
}

// Solicitar la lista de pizarras al servidor
function fetchBoards() {
    fetch('/get-boards')
        .then((response) => {
            if (!response.ok) {
                throw new Error('Error al obtener las pizarras.');
            }
            return response.json();
        })
        .then((data) => {
            updateBoardList(data.boards); // Actualiza la lista de pizarras en el DOM
        })
        .catch((error) => {
            console.error('Error al obtener las pizarras:', error);
        });
}

// Llama a fetchBoards al cargar la página
window.onload = () => {
    fetchBoards();
};

// Evento para iniciar sesión
loginButton.addEventListener('click', () => {
    const username = usernameInput.value.trim();

    if (!username) {
        alert('Por favor, ingresa un nombre de usuario.');
        return;
    }

    // Permitir el acceso al sistema con cualquier nombre de usuario
    currentUser = username;
    userDisplay.innerText = username;
    userSection.style.display = 'none';
    boardSection.style.display = 'block';

    // Solicitar la lista de pizarras al servidor inmediatamente
    fetchBoards();
});

createBoardButton.addEventListener('click', () => {
    const boardName = newBoardNameInput.value.trim();
    if (boardName) {
        fetch('/create-board', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ boardName }),
        })
            .then((response) => {
                if (!response.ok) {
                    return response.json().then((data) => {
                        throw new Error(data.error || 'Error desconocido');
                    });
                }
                return response.json();
            })
            .then(() => {
                fetchBoards(); // Actualiza la lista de pizarras
            })
            .catch((error) => {
                alert(`Error: ${error.message}`);
            });
        newBoardNameInput.value = '';
    } else {
        alert('Por favor, ingresa un nombre para la nueva pizarra.');
    }
});

// Evento para seleccionar una pizarra
if (boardList) {
    boardList.addEventListener('click', (event) => {
        // Verifica si el clic fue en un elemento <li> o en su hijo <span>
        const target = event.target.closest('li');
        if (target) {
            const boardNameSpan = target.querySelector('.board-name'); // Obtén el <span> con el nombre
            if (boardNameSpan) {
                currentBoard = boardNameSpan.innerText; // Usa solo el texto del <span>
                boardTitle.innerText = `Pizarra: ${currentBoard}`;
                boardSection.style.display = 'none';
                editorSection.style.display = 'block';
                sendMessage({ type: 'join-board', boardName: currentBoard });
            }
        }
    });
}

// Evento para volver a la lista de pizarras
backButton.addEventListener('click', () => {
    currentBoard = null;
    editorSection.style.display = 'none';
    boardSection.style.display = 'block';
    sendMessage({ type: 'leave-board' });
});

// Actualiza la lista de pizarras
function updateBoardList(boards) {
    if (!boardList) {
        console.error('El elemento boardList no está definido.');
        return;
    }

    boardList.innerHTML = ''; // Limpia la lista actual
    boards.forEach((board) => {
        const li = document.createElement('li');
        li.classList.add('board-item'); // Agrega una clase para estilos si es necesario

        // Crear un span para el nombre de la pizarra
        const boardNameSpan = document.createElement('span');
        boardNameSpan.innerText = board; // Solo el nombre de la pizarra
        boardNameSpan.classList.add('board-name'); // Clase opcional para estilos

        // Botón de eliminar
        const deleteButton = document.createElement('button');
        deleteButton.innerText = 'Eliminar';
        deleteButton.classList.add('delete-button');
        deleteButton.addEventListener('click', (event) => {
            event.stopPropagation(); // Evita que el clic en el botón seleccione la pizarra
            deleteBoard(board);
        });

        // Agregar el nombre y el botón al elemento de la lista
        li.appendChild(boardNameSpan);
        li.appendChild(deleteButton);

        // Agregar el elemento de la lista al contenedor
        boardList.appendChild(li);
    });

    console.log('Lista de pizarras actualizada en el DOM:', boards);
}

// Función para eliminar una pizarra
function deleteBoard(boardName) {
    if (!confirm(`¿Estás seguro de que deseas eliminar la pizarra "${boardName}"?`)) return;

    fetch('/delete-board', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ boardName }), // Envía el nombre de la pizarra al servidor
    })
        .then((response) => {
            if (!response.ok) {
                return response.json().then((data) => {
                    throw new Error(data.error || 'Error desconocido');
                });
            }
            return response.json();
        })
        .then(() => {
            fetchBoards(); // Actualiza la lista de pizarras
        })
        .catch((error) => {
            alert(`Error al eliminar la pizarra: ${error.message}`);
        });
}

// Eventos para pintar en el canvas

let selectedShape = 'rectangle';

document.getElementById('shape-selector').addEventListener('change', (event) => {
    selectedShape = event.target.value;
});

let startX = 0; // Coordenada inicial X
let startY = 0; // Coordenada inicial Y
let isDrawingShape = false; // Indica si se está dibujando una figura
let canvasState = null; // Variable para guardar el estado del canvas

// Evento para iniciar el dibujo de figuras
canvas.addEventListener('mousedown', (event) => {
    if (currentTool === 'shape') {
        isDrawingShape = true;
        const rect = canvas.getBoundingClientRect();
        startX = event.clientX - rect.left;
        startY = event.clientY - rect.top;
        canvasState = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } else {
        painting = true;
        const rect = canvas.getBoundingClientRect();
        lastX = event.clientX - rect.left;
        lastY = event.clientY - rect.top;
    }
});

// Evento para dibujar dinámicamente la figura
canvas.addEventListener('mousemove', (event) => {
    if (currentTool === 'shape' && isDrawingShape) {
        const rect = canvas.getBoundingClientRect();
        const currentX = event.clientX - rect.left;
        const currentY = event.clientY - rect.top;

        ctx.putImageData(canvasState, 0, 0);

        ctx.beginPath();
        ctx.strokeStyle = brushColor;
        ctx.lineWidth = brushSize;

        if (selectedShape === 'rectangle') {
            ctx.rect(startX, startY, currentX - startX, currentY - startY);
        } else if (selectedShape === 'square') {
            const side = Math.min(Math.abs(currentX - startX), Math.abs(currentY - startY));
            ctx.rect(startX, startY, side, side);
        } else if (selectedShape === 'line') {
            ctx.moveTo(startX, startY);
            ctx.lineTo(currentX, currentY);
        } else if (selectedShape === 'triangle') {
            ctx.moveTo(startX, startY);
            ctx.lineTo(currentX, currentY);
            ctx.lineTo(startX, currentY);
            ctx.closePath();
        } else if (selectedShape === 'pentagon' || selectedShape === 'hexagon') {
            const sides = selectedShape === 'pentagon' ? 5 : 6;
            const dx = currentX - startX;
            const dy = currentY - startY;
            const radius = Math.sqrt(dx * dx + dy * dy);
            // Calcula el ángulo de rotación basado en el movimiento del mouse
            const rotation = Math.atan2(dy, dx);

            ctx.moveTo(
                startX + radius * Math.cos(rotation),
                startY + radius * Math.sin(rotation)
            );
            for (let i = 1; i <= sides; i++) {
                ctx.lineTo(
                    startX + radius * Math.cos(rotation + i * 2 * Math.PI / sides),
                    startY + radius * Math.sin(rotation + i * 2 * Math.PI / sides)
                );
            }
            ctx.closePath();
        }

        ctx.stroke();
    }
});

// Evento para dibujar en el canvas
canvas.addEventListener('mousemove', (event) => {
    if (!painting || (currentTool !== 'pencil' && currentTool !== 'eraser' && currentTool !== 'highlight')) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (currentTool === 'eraser') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.beginPath();
        ctx.arc(x, y, brushSize, 0, Math.PI * 2);
        ctx.fill();
        ctx.closePath();
    } else if (currentTool === 'highlight') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = hexToRgba(brushColor, 0.4); // 40% opacidad
        ctx.lineWidth = brushSize * 2;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
        // NO uses ctx.closePath() aquí, para evitar artefactos de puntos
    } else if (currentTool === 'pencil') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = brushColor;
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
        // NO uses ctx.closePath() aquí, para evitar artefactos de puntos
    }

    lastX = x;
    lastY = y;

    // Sincroniza el contenido del canvas con el servidor
    const canvasData = canvas.toDataURL();
    sendMessage({ type: 'update-canvas', boardName: currentBoard, canvasData });
});

// Evento para finalizar el dibujo
canvas.addEventListener('mouseup', () => {
    painting = false;
    ctx.beginPath(); // Reinicia el camino para evitar líneas conectadas

    // Sincroniza el contenido del canvas con el servidor
    const canvasData = canvas.toDataURL();
    sendMessage({ type: 'update-canvas', boardName: currentBoard, canvasData });
});

// Evento para finalizar el dibujo de figuras
canvas.addEventListener('mouseup', (event) => {
    if (currentTool === 'shape' && isDrawingShape) {
        isDrawingShape = false;
        const rect = canvas.getBoundingClientRect();
        const endX = event.clientX - rect.left;
        const endY = event.clientY - rect.top;

        ctx.beginPath();
        ctx.strokeStyle = brushColor;
        ctx.lineWidth = brushSize;

        if (selectedShape === 'rectangle') {
            ctx.rect(startX, startY, endX - startX, endY - startY);
        } else if (selectedShape === 'square') {
            const side = Math.min(Math.abs(endX - startX), Math.abs(endY - startY));
            ctx.rect(startX, startY, side, side);
        } else if (selectedShape === 'line') {
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
        } else if (selectedShape === 'triangle') {
            ctx.moveTo(startX, startY);
            ctx.lineTo(endX, endY);
            ctx.lineTo(startX, endY);
            ctx.closePath();
        } else if (selectedShape === 'pentagon' || selectedShape === 'hexagon') {
            const sides = selectedShape === 'pentagon' ? 5 : 6;
            const dx = endX - startX;
            const dy = endY - startY;
            const radius = Math.sqrt(dx * dx + dy * dy);
            // Calcula el ángulo de rotación basado en el movimiento del mouse
            const rotation = Math.atan2(dy, dx);

            ctx.moveTo(
                startX + radius * Math.cos(rotation),
                startY + radius * Math.sin(rotation)
            );
            for (let i = 1; i <= sides; i++) {
                ctx.lineTo(
                    startX + radius * Math.cos(rotation + i * 2 * Math.PI / sides),
                    startY + radius * Math.sin(rotation + i * 2 * Math.PI / sides)
                );
            }
            ctx.closePath();
        }

        ctx.stroke();

        // Sincroniza el contenido del canvas con el servidor
        const canvasData = canvas.toDataURL();
        sendMessage({ type: 'update-canvas', boardName: currentBoard, canvasData });
    } else {
        painting = false;
        ctx.beginPath(); // Reinicia el camino para evitar líneas conectadas

        // Sincroniza el contenido del canvas con el servidor
        const canvasData = canvas.toDataURL();
        sendMessage({ type: 'update-canvas', boardName: currentBoard, canvasData });
    }
});

// Detener el dibujo si el cursor sale del canvas
canvas.addEventListener('mouseleave', () => {
    painting = false;
    ctx.beginPath(); // Reinicia el camino para evitar líneas conectadas
});

// Capturar clics en el canvas para escribir texto
canvas.addEventListener('click', (event) => {
    if (currentTool !== 'text') return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const textBox = document.createElement('div');
    textBox.contentEditable = true;
    textBox.style.position = 'absolute';
    textBox.style.left = `${event.clientX}px`;
    textBox.style.top = `${event.clientY}px`;
    textBox.style.border = '1px solid #ccc';
    textBox.style.padding = '5px';
    textBox.style.backgroundColor = 'white';
    textBox.style.fontSize = `${brushSize * 2}px`;
    textBox.style.color = brushColor;
    document.body.appendChild(textBox);

    textBox.focus();

    textBox.addEventListener('blur', () => {
        ctx.font = `${brushSize * 2}px Arial`;
        ctx.fillStyle = brushColor;
        ctx.fillText(textBox.innerText, x, y);

        // Sincronizar el texto con el servidor
        const canvasData = canvas.toDataURL();
        sendMessage({ type: 'update-canvas', boardName: currentBoard, canvasData });

        document.body.removeChild(textBox);
    });
});

// Descargar pizarra como imagen
document.getElementById('download-button').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `${currentBoard}.png`;
    link.href = canvas.toDataURL();
    link.click();
});

document.getElementById('clear-canvas').addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Sincroniza el canvas vacío con el servidor
    const canvasData = canvas.toDataURL();
    sendMessage({ type: 'update-canvas', boardName: currentBoard, canvasData });
});

// WebSocket Server para manejar conexiones
wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'update-canvas') {
            // Transmite los cambios a todos los usuarios excepto al remitente
            broadcast(data, ws);
        }
    });
});

function broadcast(data, exclude) {
    wss.clients.forEach((client) => {
        if (client !== exclude && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Utilidad para convertir HEX a RGBA
function hexToRgba(hex, alpha) {
    let r = 0, g = 0, b = 0;
    if (hex.length === 7) {
        r = parseInt(hex.slice(1, 3), 16);
        g = parseInt(hex.slice(3, 5), 16);
        b = parseInt(hex.slice(5, 7), 16);
    }
    return `rgba(${r},${g},${b},${alpha})`;
}
