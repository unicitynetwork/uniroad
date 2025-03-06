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
const https = require('https');
const Y = require('yjs');
const fs = require('fs');
const path = require('path');
const { setupWSConnection } = require('y-websocket/bin/utils');
const cors = require('cors');

// Parse arguments
const port = process.argv[2] || process.env.PORT || 1234;
const persistenceDir = process.argv[3] || process.env.PERSISTENCE_DIR || './data';

// Ensure the persistence directory exists
if (!fs.existsSync(persistenceDir)) {
    fs.mkdirSync(persistenceDir, { recursive: true });
}

// Parse SSL options from environment variables
const useSSL = process.env.USE_SSL === 'true';
const sslOptions = useSSL ? {
    key: fs.readFileSync(process.env.SSL_KEY || './ssl/key.pem'),
    cert: fs.readFileSync(process.env.SSL_CERT || './ssl/cert.pem')
} : null;

// Create HTTP or HTTPS server based on configuration
const createServer = (handler) => {
    if (useSSL) {
        console.log('Using secure HTTPS/WSS server');
        return https.createServer(sslOptions, handler);
    } else {
        console.log('Using HTTP/WS server (consider using HTTPS for production)');
        return http.createServer(handler);
    }
};

// Create HTTP & WebSocket servers
const server = createServer((req, res) => {
    // Set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }
    
    // Basic HTTP endpoint to check server status
    if (req.url === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const status = {
            status: 'running',
            service: 'y-websocket-server',
            clients: wss.clients.size,
            uptime: process.uptime(),
            version: '1.0.0',
            secure: useSSL,
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
                <p>Server is running on port ${port} (${useSSL ? 'secure WSS' : 'WS'})</p>
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
    const url = new URL(req.url, `http${useSSL ? 's' : ''}://localhost`);
    const roomName = url.searchParams.get('room') || 'default-room';
    
    // Extract origin for logging
    const origin = req.headers.origin || 'unknown';
    
    // Get or create the document for this room
    const doc = getYDoc(roomName);
    
    // Set up the connection
    setupWSConnection(conn, req, { 
        docName: roomName,
        gc: true
    });
    
    // Log connection
    console.log(`New connection to room: ${roomName}, origin: ${origin}, client IP: ${req.socket.remoteAddress}`);
    console.log(`Total clients: ${wss.clients.size}`);
});

// Start the server
server.listen(port, () => {
    const protocol = useSSL ? 'wss' : 'ws';
    console.log(`Y-Websocket server is running on ${protocol}://localhost:${port}`);
    console.log(`Persistence directory: ${persistenceDir}`);
    console.log(`CORS enabled: Access-Control-Allow-Origin set to '*'`);
    
    if (!useSSL) {
        console.log(`
IMPORTANT NOTE FOR HTTPS CLIENTS:
If you're accessing this WebSocket server from a website served over HTTPS (like GitHub Pages),
you will need to run this server with SSL enabled to avoid mixed-content errors.

To enable SSL, you need to:
1. Generate SSL certificates (or use your existing ones)
2. Set the following environment variables:
   USE_SSL=true
   SSL_KEY=/path/to/your/key.pem
   SSL_CERT=/path/to/your/cert.pem

Example:
   USE_SSL=true SSL_KEY=./ssl/key.pem SSL_CERT=./ssl/cert.pem node y-websocket-server.js

If you need to quickly generate self-signed certificates for testing:
   mkdir -p ssl
   openssl req -newkey rsa:2048 -new -nodes -x509 -days 3650 -keyout ssl/key.pem -out ssl/cert.pem

Note: For self-signed certificates, you'll need to add a security exception in your browser.
`);
    }
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
