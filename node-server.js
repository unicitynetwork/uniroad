// node-server.js
const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const http = require('http');
const { UniroadDB } = require('./uniroad-db');
const TXF = require('@unicitylabs/tx-flow-engine'); // Replace with your actual import

/**
 * Creates a Node.js server with Y-websocket
 * 
 * @param {Object} options - Server configuration options
 * @param {number} options.port - Port to run the server on
 * @param {string} options.roomName - Y.js room name
 * @param {string} options.username - Username for this node
 * @param {string} options.secret - Secret key for cryptographic operations
 * @returns {Object} - Server instance and UniroadDB instance
 */
function createNodeServer(options = {}) {
    const port = options.port || 1234;
    const roomName = options.roomName || 'uniroad';
    const username = options.username || 'node-server';
    const secret = options.secret;
    
    if (!secret) {
        throw new Error('Secret key is required');
    }
    
    // Create HTTP server
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'running', 
            service: 'uniroad-sync-server',
            room: roomName,
            peers: db ? db.getOnlinePeers().length : 0
        }));
    });
    
    // Create Y.js document
    const ydoc = new Y.Doc();
    
    // Initialize the websocket server
    const wsServer = setupWebsocketServer(server, ydoc, roomName);
    
    // Create UniroadDB instance using the websocket provider
    const db = new UniroadDB(
        wsServer.provider, 
        ydoc, 
        TXF, 
        secret, 
        username,
        {
            environmentHandlers: {
                log: (msg, ...args) => {
                    const timestamp = new Date().toISOString();
                    console.log(`[${timestamp}] [${username}] ${msg}`, ...args);
                },
                registerCleanup: (cleanup) => {
                    process.on('SIGINT', () => {
                        console.log('\nShutting down server...');
                        cleanup();
                        server.close(() => {
                            console.log('Server closed');
                            process.exit(0);
                        });
                    });
                    
                    process.on('SIGTERM', cleanup);
                }
            }
        }
    );
    
    // Start the server
    server.listen(port, () => {
        console.log(`UniroadDB server running on port ${port}`);
        console.log(`Y.js room: ${roomName}`);
        console.log(`Username: ${username}`);
        console.log('Press Ctrl+C to stop');
    });
    
    // Register marketplace handler for logging
    db.registerMarketViewer((getMarketList) => {
        const items = getMarketList();
        console.log(`Market updated, current items: ${items.length}`);
    });
    
    // Register inventory handler for logging
    db.registerInventoryViewer(async (getInventoryList) => {
        const inventory = await getInventoryList();
        console.log(`Inventory updated, balance: ${inventory.balance.toString()}`);
    });
    
    // Return both the server and db instances
    return { server, db, wsServer };
}

/**
 * Sets up the Y-websocket server
 */
function setupWebsocketServer(server, ydoc, roomName) {
    // Create the WebSocket provider
    const provider = new WebsocketProvider(
        `ws://localhost:${server.address()?.port || 1234}`,
        roomName,
        ydoc,
        { awareness: new Y.Awareness(ydoc) }
    );
    
    // Create an awareness instance
    provider.awareness = provider.awareness || new Y.Awareness(ydoc);
    
    return { 
        server,
        provider,
        roomName
    };
}

// If this file is run directly (not imported)
if (require.main === module) {
    // Allow command line arguments
    const args = process.argv.slice(2);
    const port = parseInt(args[0]) || 1234;
    const roomName = args[1] || 'uniroad';
    const username = args[2] || 'node-server';
    const secret = args[3] || 'test-secret-key';
    
    createNodeServer({
        port,
        roomName,
        username,
        secret
    });
}

module.exports = { createNodeServer };
