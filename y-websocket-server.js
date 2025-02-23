#!/usr/bin/env node

/**
 * Standalone Y-Websocket server for Uniroad
 * This server can be run independently to provide Y.js synchronization.
 * 
 * Usage:
 *   node y-websocket-server.js [port] [persistence-directory]
 * 
 * Example:
 *   node y-websocket-server.js 1234 ./data
 */

const WebSocket = require('ws');
const http = require('http');
const Y = require('yjs');
const fs = require('fs');
const path = require('path');
const { setupWSConnection } = require('y-websocket/bin/utils');

// Parse arguments
const port = process.argv[2] || process.env.PORT || 1234;
const persistenceDir = process.argv[3] || process.env.PERSISTENCE_DIR || './data';

// Ensure the persistence directory exists
if (!fs.existsSync(persistenceDir)) {
    fs.mkdirSync(persistenceDir, { recursive: true });
}

// Create HTTP & WebSocket servers
const server = http.createServer((req, res) => {
    // Basic HTTP endpoint to check server status
    if (req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const status = {
            status: 'running',
            service: 'y-websocket-server',
            clients: wss.clients.size,
            uptime: process.uptime(),
            version: '1.0.0',
            persistence: {
                enabled: true,
                directory: persistenceDir
            }
        };
        res.end(JSON.stringify(status));
        return;
    }
    
    // Provide a simple status page
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Y-Websocket Server</title>
            <style>
                body { font-family: sans-serif; margin: 2em; line-height: 1.5; }
                h1 { color: #333; }
                .status { padding: 1em; background: #f5f5f5; border-radius: 5px; }
                .clients { font-weight: bold; }
            </style>
        </head>
        <body>
            <h1>Y-Websocket Server</h1>
            <div class="status">
                <p>Server is running on port ${port}</p>
                <p>Current clients: <span class="clients">${wss.clients.size}</span></p>
                <p>Persistence directory: ${persistenceDir}</p>
                <p>Uptime: ${Math.floor(process.uptime())} seconds</p>
            </div>
            <p>For more information, check the <a href="/status">status endpoint</a>.</p>
        </body>
        </html>
    `);
});

const wss = new WebSocket.Server({ server });

// Map to store documents by room name
const docs = new Map();

// Load a document from disk
const getYDoc = (docName) => {
    // Create a new YDoc instance
    const doc = new Y.Doc();
    
    // Try to load existing data from disk
    const persistedDataPath = path.join(persistenceDir, `${docName}.bin`);
    
    if (fs.existsSync(persistedDataPath)) {
        try {
            const persistedData = fs.readFileSync(persistedDataPath);
            Y.applyUpdate(doc, persistedData);
            console.log(`Loaded document ${docName} from persistence`);
        } catch (err) {
            console.error(`Failed to load document ${docName}:`, err);
        }
    }
    
    // Add update handler to save the document when it changes
    doc.on('update', (update, origin) => {
        // Skip if this update originated from loading
        if (origin === 'load') return;
        
        try {
            // Make sure persistence directory exists
            if (!fs.existsSync(persistenceDir)) {
                fs.mkdirSync(persistenceDir, { recursive: true });
            }
            
            // Save the document state
            const persistedData = Y.encodeStateAsUpdate(doc);
            fs.writeFileSync(persistedDataPath, persistedData);
        } catch (err) {
            console.error(`Failed to save document ${docName}:`, err);
        }
    });
    
    docs.set(docName, doc);
    return doc;
};

wss.on('connection', (conn, req) => {
    // Extract room name from URL, default to 'default-room'
    const url = new URL(req.url, 'http://localhost');
    const roomName = url.searchParams.get('room') || 'default-room';
    
    // Get or create the document for this room
    const doc = getYDoc(roomName);
    
    // Set up the connection
    setupWSConnection(conn, req, { 
        docName: roomName,
        gc: true
    });
    
    // Log connection
    console.log(`New connection to room: ${roomName}, client IP: ${req.socket.remoteAddress}`);
    console.log(`Total clients: ${wss.clients.size}`);
});

// Start the server
server.listen(port, () => {
    console.log(`Y-Websocket server is running on port ${port}`);
    console.log(`Persistence directory: ${persistenceDir}`);
});

// Handle server shutdown
process.on('SIGINT', () => {
    console.log('Shutting down server...');
    
    // Close all connections
    wss.clients.forEach(client => {
        client.close();
    });
    
    // Close the server
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
