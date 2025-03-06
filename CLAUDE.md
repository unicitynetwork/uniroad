# CLAUDE.md - Uniroad Project Guide

## Build & Run Commands
- **Install dependencies**: `npm install`
- **Build client**: `npm run build` (production) or `npm run dev` (development with watch)
- **Build for GitHub Pages**: `npm run build:gh-pages` (outputs to 'docs' folder)
- **Start WebSocket server**: 
  - Regular: `npm run start-server` or `node y-websocket-server.js [port] [persistence-dir]`
  - Secure (for HTTPS clients): `USE_SSL=true SSL_KEY=./ssl/key.pem SSL_CERT=./ssl/cert.pem npm run start-server`
- **Run node client**: `npm run start-node-client` or `node node-client.js [serverUrl] [roomName] [username] [secret]`
- **Default WebSocket server**: 
  - HTTP pages: `ws://gateway-test1.unicity.network:7787` 
  - HTTPS pages: `wss://gateway-test1.unicity.network:7787` (requires SSL on server)
- **Check server status**: HTTP GET `http://[server-host]:[port]/status`
- **Tests**: None implemented (add with `npm test`)
- **Lint**: None configured (add ESLint: `npm install --save-dev eslint && npx eslint --init`)
- **Debug mode**: Set `DEBUG=y-websocket* npm run start-server` for detailed server logs

## Code Style Guidelines
- **Imports**: CommonJS with `require()`, external packages first, then internal modules
- **Formatting**: 4-space indentation, clean spacing around operators
- **Module System**: CommonJS (package.json: "type": "commonjs")
- **Naming Conventions**:
  - Functions/variables: camelCase (e.g., `getMarketList`)
  - Classes: PascalCase (e.g., `UniroadDB`)
  - Constants: snake_case (e.g., `coin_token_type`)
  - Private methods: Prefix with underscore (e.g., `_setupObservers`)
- **Error Handling**: try/catch blocks with specific error messages, async/await pattern
- **Documentation**: Inline comments for complex logic, section headers for organization
- **Async Code**: Use async/await, avoid callback chains
- **Browser Compatibility**: Babel preset-env targets "> 0.25%, not dead"

## Project Architecture
- **Y.js documents**: Shared state and real-time collaboration (CRDT)
- **WebSocket provider**: Network synchronization (y-websocket)
- **Transaction flow engine**: Token operations (@unicitylabs/tx-flow-engine)
- **Web client**: Browser-based UI using webpack for bundling
- **Node client**: CLI interface for marketplace interaction