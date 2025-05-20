// DOM elements and initial state setup for login, board selection, and editor UI
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

let currentTool = 'pencil';
let brushColor = '#000';
let brushSize = 5;

document.getElementById('brush-size').value = brushSize;

let isWritingText = false;

// Tool selection event listeners for drawing, erasing, highlighting, shapes, and text
document.getElementById('pencil-tool').addEventListener('click', () => {
    currentTool = 'pencil';
    canvas.style.cursor = 'crosshair';
});

document.getElementById('eraser-tool').addEventListener('click', () => {
    currentTool = 'eraser';
    canvas.style.cursor = 'crosshair';
});

document.getElementById('text-tool').addEventListener('click', () => {
    currentTool = 'text';
    canvas.style.cursor = 'text';
    painting = false;
});

document.getElementById('highlight-tool').addEventListener('click', () => {
    currentTool = 'highlight';
    canvas.style.cursor = 'crosshair';
});

document.getElementById('shape-tool').addEventListener('click', () => {
    currentTool = 'shape';
    canvas.style.cursor = 'crosshair';
});

// Color and brush size picker event listeners
document.getElementById('color-picker').addEventListener('input', (event) => {
    brushColor = event.target.value;
});

document.getElementById('brush-size').addEventListener('input', (event) => {
    brushSize = event.target.value;
});

// WebSocket connection for real-time collaboration
const socket = new WebSocket('ws://localhost:3000');

let currentUser = null;
let currentBoard = null;

// Check for required DOM elements before proceeding
if (
    !userSection ||
    !boardSection ||
    !editorSection ||
    !usernameInput ||
    !loginButton ||
    !userDisplay ||
    !newBoardNameInput ||
    !createBoardButton ||
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
        backButton,
        canvas,
        ctx,
    });
    throw new Error('Error crítico: elementos del DOM faltantes.');
}

// WebSocket event handlers for connection and incoming messages
socket.onopen = () => {
    console.log('Conectado al servidor.');
};

socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    // Handle canvas updates from other users
    if (data.type === 'update-canvas') {
        const img = new Image();
        img.src = data.canvasData;
        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
    // Handle board list updates
    } else if (data.type === 'board-list') {
        updateBoardList(data.boards);
    // Handle error messages
    } else if (data.type === 'error') {
        alert(`Error: ${data.message}`);
    // Handle remote pointer display for collaborative editing
    } else if (data.type === 'pointer' && data.username !== currentUser) {
        const pointer = document.getElementById('remote-pointer');
        const pointerName = document.getElementById('remote-pointer-name');
        pointer.style.display = 'block';
        pointer.style.left = (canvas.offsetLeft + data.x) + 'px';
        pointer.style.top = (canvas.offsetTop + data.y) + 'px';
        pointerName.textContent = data.username;
        clearTimeout(window.pointerTimeout);
        window.pointerTimeout = setTimeout(() => {
            pointer.style.display = 'none';
        }, 1000);
    }
};

// Helper to send messages through WebSocket if connection is open
function sendMessage(data) {
    if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify(data));
    } else {
        console.error('WebSocket no está abierto. Estado actual:', socket.readyState);
    }
}

// Fetch the list of available boards from the server
function fetchBoards() {
    fetch('/get-boards')
        .then((response) => {
            if (!response.ok) {
                throw new Error('Error al obtener las pizarras.');
            }
            return response.json();
        })
        .then((data) => {
            updateBoardList(data.boards);
        })
        .catch((error) => {
            console.error('Error al obtener las pizarras:', error);
        });
}

// Initial fetch of boards when the page loads
window.onload = () => {
    fetchBoards();
};

// Login functionality: set current user and show board selection
loginButton.addEventListener('click', () => {
    const username = usernameInput.value.trim();

    if (!username) {
        alert('Por favor, ingresa un nombre de usuario.');
        return;
    }

    currentUser = username;
    userDisplay.innerText = username;
    userSection.style.display = 'none';
    boardSection.style.display = 'block';

    fetchBoards();
});

// Create a new board and refresh the board list
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
                fetchBoards();
            })
            .catch((error) => {
                alert(`Error: ${error.message}`);
            });
        newBoardNameInput.value = '';
    } else {
        alert('Por favor, ingresa un nombre para la nueva pizarra.');
    }
});

// Board selection: join a board and switch to the editor view
if (boardList) {
    boardList.addEventListener('click', (event) => {
        const target = event.target.closest('li');
        if (target) {
            const boardNameSpan = target.querySelector('.board-name');
            if (boardNameSpan) {
                currentBoard = boardNameSpan.innerText;
                boardTitle.innerText = `Pizarra: ${currentBoard}`;
                boardSection.style.display = 'none';
                editorSection.style.display = 'block';
                sendMessage({ type: 'join-board', boardName: currentBoard });
            }
        }
    });
}

// Return to board selection from the editor
backButton.addEventListener('click', () => {
    currentBoard = null;
    editorSection.style.display = 'none';
    boardSection.style.display = 'block';
    sendMessage({ type: 'leave-board' });
});

// Update the board list in the DOM
function updateBoardList(boards) {
    if (!boardList) {
        console.error('El elemento boardList no está definido.');
        return;
    }

    boardList.innerHTML = '';
    boards.forEach((board) => {
        const li = document.createElement('li');
        li.classList.add('board-item');

        const boardNameSpan = document.createElement('span');
        boardNameSpan.innerText = board;
        boardNameSpan.classList.add('board-name');

        const deleteButton = document.createElement('button');
        deleteButton.innerText = 'Eliminar';
        deleteButton.classList.add('delete-button');
        deleteButton.addEventListener('click', (event) => {
            event.stopPropagation();
            deleteBoard(board);
        });

        li.appendChild(boardNameSpan);
        li.appendChild(deleteButton);

        boardList.appendChild(li);
    });

    console.log('Lista de pizarras actualizada en el DOM:', boards);
}

// Delete a board after user confirmation
function deleteBoard(boardName) {
    if (!confirm(`¿Estás seguro de que deseas eliminar la pizarra "${boardName}"?`)) return;

    fetch('/delete-board', {
        method: 'DELETE',
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
            fetchBoards();
        })
        .catch((error) => {
            alert(`Error al eliminar la pizarra: ${error.message}`);
        });
}

// Shape selection for drawing polygons and other shapes
let selectedShape = 'rectangle';

document.getElementById('shape-selector').addEventListener('change', (event) => {
    selectedShape = event.target.value;
});

let startX = 0;
let startY = 0;
let isDrawingShape = false;
let canvasState = null;

// Mouse events for drawing shapes and freehand lines
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

// Shape preview while dragging the mouse
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

// Drawing logic for pencil, eraser, and highlighter tools
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
        ctx.strokeStyle = hexToRgba(brushColor, 0.4);
        ctx.lineWidth = brushSize * 2;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
    } else if (currentTool === 'pencil') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = brushColor;
        ctx.lineWidth = brushSize;
        ctx.lineCap = 'round';

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(x, y);
        ctx.stroke();
    }

    lastX = x;
    lastY = y;

    // Send pointer position and canvas update to server for collaboration
    if (painting && currentUser && currentBoard) {
        sendMessage({
            type: 'pointer',
            boardName: currentBoard,
            username: currentUser,
            x,
            y
        });
    }

    const canvasData = canvas.toDataURL();
    sendMessage({ type: 'update-canvas', boardName: currentBoard, canvasData });
});

// Mouse up event to finish drawing and send canvas update
canvas.addEventListener('mouseup', () => {
    painting = false;
    ctx.beginPath();

    const canvasData = canvas.toDataURL();
    sendMessage({ type: 'update-canvas', boardName: currentBoard, canvasData });
});

// Mouse up event for shapes to finalize the drawing and send update
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

        const canvasData = canvas.toDataURL();
        sendMessage({ type: 'update-canvas', boardName: currentBoard, canvasData });
    } else {
        painting = false;
        ctx.beginPath();

        const canvasData = canvas.toDataURL();
        sendMessage({ type: 'update-canvas', boardName: currentBoard, canvasData });
    }
});

// Stop drawing when mouse leaves the canvas
canvas.addEventListener('mouseleave', () => {
    painting = false;
    ctx.beginPath();
});

// Text tool: create a temporary editable div for text input, then draw it on the canvas
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

        const canvasData = canvas.toDataURL();
        sendMessage({ type: 'update-canvas', boardName: currentBoard, canvasData });

        document.body.removeChild(textBox);
    });
});

// Download the current board as a PNG image
document.getElementById('download-button').addEventListener('click', () => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = canvas.width;
    tempCanvas.height = canvas.height;
    const tempCtx = tempCanvas.getContext('2d');

    tempCtx.fillStyle = '#fff';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    tempCtx.drawImage(canvas, 0, 0);

    const link = document.createElement('a');
    link.download = `${currentBoard}.png`;
    link.href = tempCanvas.toDataURL();
    link.click();
});

// Clear the canvas and notify other users
document.getElementById('clear-canvas').addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const canvasData = canvas.toDataURL();
    sendMessage({ type: 'update-canvas', boardName: currentBoard, canvasData });
});

// WebSocket server-side logic for broadcasting canvas updates (for Node.js server)
wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'update-canvas') {
            broadcast(data, ws);
        }
    });
});

// Broadcast helper for sending data to all connected clients except the sender
function broadcast(data, exclude) {
    wss.clients.forEach((client) => {
        if (client !== exclude && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

// Utility to convert hex color to rgba for highlight tool
function hexToRgba(hex, alpha) {
    let r = 0, g = 0, b = 0;
    if (hex.length === 7) {
        r = parseInt(hex.slice(1, 3), 16);
        g = parseInt(hex.slice(3, 5), 16);
        b = parseInt(hex.slice(5, 7), 16);
    }
    return `rgba(${r},${g},${b},${alpha})`;
}