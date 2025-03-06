// node-client.js
const Y = require('yjs');
const WebSocket = require('ws');
const { WebsocketProvider } = require('y-websocket');
const { UniroadDB } = require('./uniroad-db');
const TXF = require('@unicitylabs/tx-flow-engine'); // Replace with your actual import

function createNodeClient(options = {}) {
    const serverUrl = options.serverUrl || 'ws://gateway-test1.unicity.network:7787';
    const roomName = options.roomName || 'uniroad';
    const username = options.username || `node-client-${Math.floor(Math.random() * 10000)}`;
    const secret = options.secret;
    
    if (!secret) {
        throw new Error('Secret key is required');
    }
    
    // Create Yjs document
    const ydoc = new Y.Doc();
    
    // Create WebSocket provider for Node.js
    const provider = new WebsocketProvider(serverUrl, roomName, ydoc, {
        WebSocketPolyfill: WebSocket
    });
    
    // Create custom environment handlers
    const environmentHandlers = {
        log: (msg, ...args) => {
            const timestamp = new Date().toISOString();
            console.log(`[${timestamp}] [${username}] ${msg}`, ...args);
        },
        registerCleanup: (cleanup) => {
            process.on('SIGINT', () => {
                console.log('\nShutting down client...');
                cleanup();
                process.exit(0);
            });
            
            process.on('SIGTERM', cleanup);
        }
    };
    
    // Create UniroadDB instance with the configured provider
    const db = new UniroadDB(
        provider, 
        ydoc, 
        TXF, 
        secret, 
        username,
        { environmentHandlers }
    );
    
    // Set up connection status handling
    provider.on('status', ({ status }) => {
        console.log(`Connection status: ${status}`);
    });
    
    provider.on('connection-close', () => {
        console.log('Disconnected from server, attempting to reconnect...');
    });
    
    provider.on('connection-error', (error) => {
        console.error('Connection error:', error);
    });
    
    // Register market and inventory viewers for logging
    db.registerMarketViewer((getMarketList) => {
        const items = getMarketList();
        console.log(`Market updated, ${items.length} items available`);
        
        if (items.length > 0) {
            console.log('Items:');
            items.forEach(item => {
                console.log(`- ${item.name || 'Unnamed'}: ${item.description || 'No description'}`);
            });
        }
    });
    
    db.registerInventoryViewer(async (getInventoryList) => {
        const inventory = await getInventoryList();
        console.log(`Inventory updated, balance: ${inventory.balance.toString()}`);
        console.log(`${inventory.coins.length} coins, ${inventory.items.length} items`);
    });
    
    // Setup CLI commands if requested
    if (options.enableCli) {
        setupCli(db);
    }
    
    return db;
}

function setupCli(db) {
    const readline = require('readline');
    
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: 'uniroad> '
    });
    
    console.log('UniroadDB CLI');
    console.log('Available commands:');
    console.log('  help                - Show this help message');
    console.log('  status              - Show connection status and peer count');
    console.log('  market              - List marketplace items');
    console.log('  inventory           - List your inventory');
    console.log('  addcoin             - Add a new coin to your inventory');
    console.log('  additem <name> <desc> - Add a new item to the marketplace');
    console.log('  buy <item>          - Buy an item from the marketplace');
    console.log('  list <item>         - List an owned item on the marketplace');
    console.log('  exit                - Exit the application');
    console.log('');
    
    rl.prompt();
    
    rl.on('line', async (line) => {
        const args = line.trim().split(' ');
        const command = args[0].toLowerCase();
        
        try {
            switch (command) {
                case 'help':
                    console.log('Available commands:');
                    console.log('  help                - Show this help message');
                    console.log('  status              - Show connection status and peer count');
                    console.log('  market              - List marketplace items');
                    console.log('  inventory           - List your inventory');
                    console.log('  addcoin             - Add a new coin to your inventory');
                    console.log('  additem <name> <desc> - Add a new item to the marketplace');
                    console.log('  buy <item>          - Buy an item from the marketplace');
                    console.log('  list <item>         - List an owned item on the marketplace');
                    console.log('  exit                - Exit the application');
                    break;
                    
                case 'status':
                    console.log(`Connected: ${db.provider.wsconnected}`);
                    console.log(`Room: ${db.provider.roomname}`);
                    console.log(`User: ${db.name} (${db.pubkey})`);
                    break;
                    
                case 'market':
                    const items = db.getMarketList();
                    console.log(`Marketplace has ${items.length} items:`);
                    items.forEach((item, index) => {
                        console.log(`${index + 1}. ${item.name || 'Unnamed'}: ${item.description || 'No description'}`);
                    });
                    break;
                    
                case 'inventory':
                    const inventory = await db.getInventoryList();
                    console.log(`Balance: ${inventory.balance.toString()}`);
                    console.log(`Coins: ${inventory.coins.length}`);
                    console.log(`Items: ${inventory.items.length}`);
                    inventory.items.forEach((item, index) => {
                        const data = item.tokenData || {};
                        console.log(`${index + 1}. ${data.name || 'Unnamed'}: ${data.description || 'No description'}`);
                    });
                    break;
                    
                case 'addcoin':
                    await db.addCoin();
                    console.log('Coin added to inventory');
                    break;
                    
                case 'additem':
                    if (args.length < 3) {
                        console.log('Usage: additem <name> <description>');
                        break;
                    }
                    const itemName = args[1];
                    const itemDesc = args.slice(2).join(' ');
			console.log("itemDesc: "+itemDesc);
                    await db.addMarketItem(itemName, JSON.stringify({
                        name: itemName,
                        description: itemDesc,
                        createdAt: new Date().toISOString()
                    }));
                    console.log(`Item "${itemName}" added to marketplace`);
                    break;
                    
                case 'buy':
                    if (args.length < 2) {
                        console.log('Usage: buy <item_name>');
                        break;
                    }
                    await db.purchase(args[1]);
                    console.log(`Purchased item "${args[1]}"`);
                    break;
                    
                case 'list':
                    if (args.length < 2) {
                        console.log('Usage: list <item_name>');
                        break;
                    }
                    await db.listItem(args[1]);
                    console.log(`Listed item "${args[1]}" for sale`);
                    break;
                    
                case 'exit':
                    console.log('Exiting...');
                    rl.close();
                    db.destroy();
                    process.exit(0);
                    break;
                    
                default:
                    console.log(`Unknown command: ${command}`);
                    console.log('Type "help" for available commands');
            }
        } catch (error) {
            console.error(`Error executing command: ${error.message}`);
        }
        
        rl.prompt();
    });
}

// If this file is run directly (not imported)
if (require.main === module) {
    // Allow command line arguments
    const args = process.argv.slice(2);
    const serverUrl = args[0] || 'ws://gateway-test1.unicity.network:7787';
    const roomName = args[1] || 'uniroad';
    const username = args[2] || `node-client-${Math.floor(Math.random() * 10000)}`;
    const secret = args[3] || 'test-secret-key';
    
    createNodeClient({
        serverUrl,
        roomName,
        username,
        secret,
        enableCli: true
    });
}

module.exports = { createNodeClient };
