# CLAUDE.md - Uniroad Project Guide

## Build & Run Commands
- **Install dependencies**: `npm install`
- **Start WebSocket server**: `node y-websocket-server.js [port] [persistence-dir]`
  - Example: `node y-websocket-server.js 1234 ./data`
- **Run node client**: `node node-client.js [serverUrl] [roomName] [username] [secret]`
  - Example: `node node-client.js ws://localhost:1234 uniroad user1 secret-key`
- **Check server status**: HTTP endpoint at `http://localhost:[port]/status`

## Code Style Guidelines
- **Imports**: CommonJS style with `require()`, grouped by external/internal
- **Formatting**: 4-space indentation, camelCase variables
- **Error Handling**: Try/catch blocks with specific error messages
- **Naming Conventions**:
  - Functions/variables: camelCase (e.g., `getMarketList`)
  - Classes: PascalCase (e.g., `UniroadDB`)
  - Constants: SNAKE_CASE or camelCase (e.g., `coin_token_type`)
  - Private methods: Prefix with underscore (e.g., `_setupObservers`)
- **Classes**: Arrow functions for methods that need `this` binding
- **Comments**: JSDoc-style for function documentation
- **Helper Functions**: Pure utility functions defined outside classes
- **Async/Await**: Preferred over callbacks and promise chains

## Project Architecture
- **Y.js documents**: Shared state and real-time collaboration
- **WebSocket provider**: Network synchronization (y-websocket)
- **Transaction flow engine**: Token operations (@unicitylabs/tx-flow-engine)
- **Observer pattern**: For state changes and UI updates
- **CLI interface**: Interactive command handling in node-client.js