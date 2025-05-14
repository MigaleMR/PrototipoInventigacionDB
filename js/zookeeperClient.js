const zookeeper = require('node-zookeeper-client');

const client = zookeeper.createClient('localhost:2181');
const messagePath = '/shared-message';
const usersPath = '/users';
const boardsPath = '/boards';

client.once('connected', () => {
    console.log('Conectado a ZooKeeper.');

    // Crea el nodo si no existe
    client.exists(messagePath, (error, stat) => {
        if (error) {
            console.error('Error verificando el nodo:', error);
        } else if (!stat) {
            client.create(messagePath, Buffer.from(''), (err) => {
                if (err) console.error('Error creando el nodo:', err);
            });
        }
    });

    // Crea nodos raíz si no existen
    [usersPath, boardsPath].forEach((path) => {
        client.exists(path, (error, stat) => {
            if (error) {
                console.error(`Error verificando el nodo ${path}:`, error);
            } else if (!stat) {
                client.create(path, (err) => {
                    if (err) console.error(`Error creando el nodo ${path}:`, err);
                });
            }
        });
    });
});

client.connect();

async function setMessage(message) {
    return new Promise((resolve, reject) => {
        client.setData(messagePath, Buffer.from(message), (error) => {
            if (error) return reject(error);
            resolve();
        });
    });
}

async function getMessage() {
    return new Promise((resolve, reject) => {
        client.getData(messagePath, (error, data) => {
            if (error) return reject(error);
            resolve(data.toString('utf8'));
        });
    });
}

// Función para guardar un usuario
async function saveUser(username, password) {
    const userPath = `${usersPath}/${username}`;
    return new Promise((resolve, reject) => {
        client.exists(userPath, (error, stat) => {
            if (error) {
                return reject(new Error('Error al verificar el usuario.'));
            }
            if (stat) {
                return reject(new Error('El usuario ya existe.'));
            }
            client.create(userPath, Buffer.from(password), (error) => {
                if (error) {
                    return reject(new Error('Error al guardar el usuario.'));
                }
                resolve();
            });
        });
    });
}

// Función para autenticar un usuario
async function authenticateUser(username, password) {
    const userPath = `${usersPath}/${username}`;
    return new Promise((resolve, reject) => {
        client.getData(userPath, (error, data) => {
            if (error) return reject(error);
            if (data.toString() === password) {
                resolve(true);
            } else {
                resolve(false);
            }
        });
    });
}

// Función para guardar una pizarra
async function saveBoard(boardName, content = '') {
    const boardPath = `${boardsPath}/${boardName}`;
    return new Promise((resolve, reject) => {
        client.exists(boardPath, (error, stat) => {
            if (error) return reject(error);
            if (stat) return reject(new Error('La pizarra ya existe.'));
            client.create(boardPath, Buffer.from(content), (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    });
}

// Función para obtener el contenido de una pizarra
async function getBoardContent(boardName) {
    const boardPath = `${boardsPath}/${boardName}`;
    return new Promise((resolve, reject) => {
        client.getData(boardPath, (error, data) => {
            if (error) return reject(error);
            resolve(data.toString());
        });
    });
}

async function deleteBoard(boardName) {
    const boardPath = `${boardsPath}/${boardName}`;
    return new Promise((resolve, reject) => {
        client.exists(boardPath, (error, stat) => {
            if (error) {
                return reject(new Error('Error al verificar la existencia de la pizarra.'));
            }
            if (!stat) {
                return reject(new Error('La pizarra no existe.'));
            }
            client.remove(boardPath, (err) => {
                if (err) {
                    return reject(new Error('Error al eliminar la pizarra.'));
                }
                console.log(`Pizarra "${boardName}" eliminada de ZooKeeper.`);
                resolve();
            });
        });
    });
}

// Función para actualizar el contenido de una pizarra
async function updateBoardContent(boardName, content) {
    const boardPath = `${boardsPath}/${boardName}`;
    return new Promise((resolve, reject) => {
        client.setData(boardPath, Buffer.from(content), (error) => {
            if (error) return reject(error);
            resolve();
        });
    });
}

// Obtener los hijos de un nodo
async function getChildren(path) {
    return new Promise((resolve, reject) => {
        client.getChildren(path, (error, children) => {
            if (error) {
                return reject(error);
            }
            resolve(children);
        });
    });
}

// Crear un nodo en ZooKeeper
async function createNode(path, data) {
    return new Promise((resolve, reject) => {
        client.create(path, Buffer.from(data), (error) => {
            if (error) {
                return reject(error);
            }
            resolve();
        });
    });
}

module.exports = {
    setMessage,
    getMessage,
    saveUser,
    authenticateUser,
    saveBoard,
    getBoardContent,
    updateBoardContent,
    getChildren,
    createNode,
    deleteBoard, // Exporta la función para que pueda ser utilizada en el servidor
};