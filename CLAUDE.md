# CLAUDE.md - Uniroad Project Guide

## Build & Run Commands
- **Install dependencies**: `npm install`
- **Build client**: `npm run build` (production) or `npm run dev` (development with watch)
- **Start WebSocket server**: `npm run start-server` or `node y-websocket-server.js [port] [persistence-dir]`
- **Run node client**: `npm run start-node-client` or `node node-client.js [serverUrl] [roomName] [username] [secret]`
- **Check server status**: HTTP endpoint at `http://localhost:[port]/status`
- **Tests**: None currently implemented (once added, use `npm test` to run all tests)
- **Lint**: No linter configured (consider adding ESLint with `npm install --save-dev eslint`)

## Code Style Guidelines
- **Imports**: CommonJS style with `require()`, grouped by external/internal
- **Module System**: CommonJS (package.json: "type": "commonjs")
- **Formatting**: 4-space indentation, camelCase for variables
- **Browser Compatibility**: Babel with preset-env targeting "> 0.25%, not dead"
- **Naming Conventions**:
  - Functions/variables: camelCase (e.g., `getMarketList`)
  - Classes: PascalCase (e.g., `UniroadDB`)
  - Constants: SNAKE_CASE or camelCase (e.g., `coin_token_type`)
  - Private methods: Prefix with underscore (e.g., `_setupObservers`)
- **Error Handling**: Try/catch blocks with specific error messages
- **Classes**: Arrow functions for methods that need `this` binding
- **Comments**: JSDoc-style for function documentation
- **Asynchronous Code**: Prefer async/await over callbacks and promise chains

## Project Architecture
- **Y.js documents**: Shared state and real-time collaboration (CRDT)
- **WebSocket provider**: Network synchronization (y-websocket)
- **Transaction flow engine**: Token operations (@unicitylabs/tx-flow-engine)
- **Web client**: Browser-based UI with webpack bundling
- **Node client**: CLI interface for marketplace interaction