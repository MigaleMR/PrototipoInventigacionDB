// Import ZooKeeper client library and set up connection paths
const zookeeper = require('node-zookeeper-client');

const client = zookeeper.createClient('localhost:2181');
const messagePath = '/shared-message';
const usersPath = '/users';
const boardsPath = '/boards';

// On connection, ensure root nodes for messages, users, and boards exist in ZooKeeper
client.once('connected', () => {
    console.log('Connected to ZooKeeper.');

    // Ensure the shared message node exists
    client.exists(messagePath, (error, stat) => {
        if (error) {
            console.error('Error checking node:', error);
        } else if (!stat) {
            client.create(messagePath, Buffer.from(''), (err) => {
                if (err) console.error('Error creating node:', err);
            });
        }
    });

    // Ensure root nodes for users and boards exist
    [usersPath, boardsPath].forEach((path) => {
        client.exists(path, (error, stat) => {
            if (error) {
                console.error(`Error checking node ${path}:`, error);
            } else if (!stat) {
                client.create(path, (err) => {
                    if (err) console.error(`Error creating node ${path}:`, err);
                });
            }
        });
    });
});

client.connect();

// Set a shared message in ZooKeeper
async function setMessage(message) {
    return new Promise((resolve, reject) => {
        client.setData(messagePath, Buffer.from(message), (error) => {
            if (error) return reject(error);
            resolve();
        });
    });
}

// Get the shared message from ZooKeeper
async function getMessage() {
    return new Promise((resolve, reject) => {
        client.getData(messagePath, (error, data) => {
            if (error) return reject(error);
            resolve(data.toString('utf8'));
        });
    });
}

// Save a new user in ZooKeeper, checking if the user already exists
async function saveUser(username, password) {
    const userPath = `${usersPath}/${username}`;
    return new Promise((resolve, reject) => {
        client.exists(userPath, (error, stat) => {
            if (error) {
                return reject(new Error('Error checking user.'));
            }
            if (stat) {
                return reject(new Error('User already exists.'));
            }
            client.create(userPath, Buffer.from(password), (error) => {
                if (error) {
                    return reject(new Error('Error saving user.'));
                }
                resolve();
            });
        });
    });
}

// Authenticate a user by comparing the stored password in ZooKeeper
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

// Save a new board in ZooKeeper, checking if the board already exists
async function saveBoard(boardName, content = '') {
    const boardPath = `${boardsPath}/${boardName}`;
    return new Promise((resolve, reject) => {
        client.exists(boardPath, (error, stat) => {
            if (error) return reject(error);
            if (stat) return reject(new Error('Board already exists.'));
            client.create(boardPath, Buffer.from(content), (err) => {
                if (err) return reject(err);
                resolve();
            });
        });
    });
}

// Retrieve the content of a board from ZooKeeper
async function getBoardContent(boardName) {
    const boardPath = `${boardsPath}/${boardName}`;
    return new Promise((resolve, reject) => {
        client.getData(boardPath, (error, data) => {
            if (error) return reject(error);
            resolve(data.toString());
        });
    });
}

// Delete a board node from ZooKeeper
async function deleteBoard(boardName) {
    const boardPath = `${boardsPath}/${boardName}`;
    return new Promise((resolve, reject) => {
        client.exists(boardPath, (error, stat) => {
            if (error) {
                return reject(new Error('Error checking board existence.'));
            }
            if (!stat) {
                return reject(new Error('Board does not exist.'));
            }
            client.remove(boardPath, (err) => {
                if (err) {
                    return reject(new Error('Error deleting board.'));
                }
                console.log(`Board "${boardName}" deleted from ZooKeeper.`);
                resolve();
            });
        });
    });
}

// Update the content of an existing board in ZooKeeper
async function updateBoardContent(boardName, content) {
    const boardPath = `${boardsPath}/${boardName}`;
    return new Promise((resolve, reject) => {
        client.setData(boardPath, Buffer.from(content), (error) => {
            if (error) return reject(error);
            resolve();
        });
    });
}

// Get the children (nodes) of a given ZooKeeper path
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

// Create a new node in ZooKeeper with provided data
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

// Export all utility functions for use in other modules
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
    deleteBoard, 
};