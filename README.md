# Uniroad - P2P Marketplace

A peer-to-peer serverless marketplace based on the Unicity blockchain platform. This application allows users to create and list items for trading, purchase items from other users, and mint coins for payments.

## Features

- Create and list items in a shared marketplace
- Purchase items using crypto coins
- Mint new coins to your inventory
- Real-time synchronization between users
- Secure transactions with cryptographic verification

## Architecture

- **Uniroad DB**: Core marketplace logic (platform-agnostic)
- **Y.js**: CRDT for distributed data synchronization
- **WebSocket Provider**: Network communication layer
- **Unicity TX Flow Engine**: Transaction and verification logic

## Setup Instructions

### Prerequisites

- Node.js (v14 or later)
- NPM (v6 or later)

### Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd uniroad
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Build the browser client:
   ```
   npm run build
   ```

### Running the Application

#### Start the WebSocket Server

For local development (HTTP/WS):
```
npm run start-server
```

For secure connections (HTTPS/WSS) - required when accessed from HTTPS sites like GitHub Pages:
```
USE_SSL=true SSL_KEY=./ssl/key.pem SSL_CERT=./ssl/cert.pem npm run start-server
```

You can specify custom parameters:
```
node y-websocket-server.js [port] [persistence-dir]
```

Example with custom port and data directory:
```
node y-websocket-server.js 1234 ./data
```

#### Generating Self-Signed SSL Certificates for Development

If you need to connect from an HTTPS site to your local server, generate self-signed certificates:
```
mkdir -p ssl
openssl req -newkey rsa:2048 -new -nodes -x509 -days 3650 -keyout ssl/key.pem -out ssl/cert.pem
```

Note: You'll need to accept the self-signed certificate in your browser.

#### Using the Web Client

1. After building, open `index.html` in your web browser.
2. Enter connection details (server URL, room name, username, secret key).
3. Click "Connect" to join the marketplace.

#### Using the Node.js Client (CLI)

```
npm run start-node-client
```

Or with custom parameters:

```
node node-client.js [serverUrl] [roomName] [username] [secret]
```

Example:
```
node node-client.js ws://gateway-test1.unicity.network:7787 uniroad user1 my-secret-key
```

## Development

Run in development mode with automatic rebuilding:

```
npm run dev
```

## File Structure

- `index.html` - Web GUI interface
- `styles.css` - Styling for the web interface
- `browser-client.js` - Browser client implementation
- `uniroad-db.js` - Core marketplace logic
- `node-client.js` - CLI client implementation
- `y-websocket-server.js` - WebSocket server for synchronization
- `webpack.config.js` - Webpack configuration for bundling

## License

ISC