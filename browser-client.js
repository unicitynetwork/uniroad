// Import required libraries 
const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const { UniroadDB } = require('./uniroad-db');
const TXF = require('@unicitylabs/tx-flow-engine');

// DOM elements
const elements = {
    statusIndicator: document.getElementById('status-indicator'),
    statusText: document.getElementById('status-text'),
    usernameDisplay: document.getElementById('username-display'),
    pubkeyDisplay: document.getElementById('pubkey-display'),
    balanceDisplay: document.getElementById('balance-display'),
    marketplaceList: document.getElementById('marketplace-list'),
    inventoryList: document.getElementById('inventory-list'),
    logContainer: document.getElementById('log-container'),
    
    // Form inputs
    serverUrlInput: document.getElementById('server-url'),
    roomNameInput: document.getElementById('room-name'),
    usernameInput: document.getElementById('username'),
    secretInput: document.getElementById('secret'),
    newItemNameInput: document.getElementById('new-item-name'),
    newItemDescInput: document.getElementById('new-item-desc'),
    
    // Buttons
    connectBtn: document.getElementById('connect-btn'),
    disconnectBtn: document.getElementById('disconnect-btn'),
    addCoinBtn: document.getElementById('add-coin-btn'),
    addItemBtn: document.getElementById('add-item-btn'),
    
    // Modal elements
    modal: document.getElementById('modal'),
    modalTitle: document.getElementById('modal-title'),
    modalMessage: document.getElementById('modal-message'),
    modalConfirmBtn: document.getElementById('modal-confirm'),
    modalCancelBtn: document.getElementById('modal-cancel'),
    modalCloseBtn: document.querySelector('.close-btn')
};

// Application state
let appState = {
    connected: false,
    uniroadDb: null,
    provider: null,
    ydoc: null,
    pendingAction: null
};

// Initialize the application
function initApp() {
    // Set up event listeners
    setupEventListeners();
    
    // Disable action buttons initially
    updateUIState(false);
    
    // Check if we're on HTTPS and update the default server URL if needed
    if (window.location.protocol === 'https:') {
        const serverInput = elements.serverUrlInput;
        if (serverInput && serverInput.value.startsWith('ws:')) {
            const wssUrl = serverInput.value.replace('ws:', 'wss:');
            serverInput.value = wssUrl;
            logMessage('Note: Default server URL changed to WSS (secure WebSocket) because you\'re on an HTTPS page.');
        }
    }
    
    // Log startup message
    logMessage('Uniroad GUI initialized. Please connect to the network.');
}

// Set up event listeners for UI interactions
function setupEventListeners() {
    // Connection buttons
    elements.connectBtn.addEventListener('click', handleConnect);
    elements.disconnectBtn.addEventListener('click', handleDisconnect);
    
    // Action buttons
    elements.addCoinBtn.addEventListener('click', handleAddCoin);
    elements.addItemBtn.addEventListener('click', handleAddItem);
    
    // Modal buttons
    elements.modalConfirmBtn.addEventListener('click', handleModalConfirm);
    elements.modalCancelBtn.addEventListener('click', closeModal);
    elements.modalCloseBtn.addEventListener('click', closeModal);
}

// Update UI elements based on connection state
function updateUIState(isConnected) {
    const disableState = !isConnected;
    
    elements.addCoinBtn.disabled = disableState;
    elements.addItemBtn.disabled = disableState;
    elements.newItemNameInput.disabled = disableState;
    elements.newItemDescInput.disabled = disableState;
    
    elements.connectBtn.disabled = isConnected;
    elements.disconnectBtn.disabled = !isConnected;
    
    elements.serverUrlInput.disabled = isConnected;
    elements.roomNameInput.disabled = isConnected;
    elements.usernameInput.disabled = isConnected;
    elements.secretInput.disabled = isConnected;
    
    // Update connection indicator
    elements.statusIndicator.className = isConnected ? 'connected' : '';
    elements.statusText.textContent = isConnected ? 'Connected' : 'Disconnected';
    
    // Empty lists if disconnected
    if (!isConnected) {
        elements.marketplaceList.innerHTML = '<div class="empty-message">Not connected</div>';
        elements.inventoryList.innerHTML = '<div class="empty-message">Not connected</div>';
        elements.usernameDisplay.textContent = 'Not connected';
        elements.pubkeyDisplay.textContent = '-';
        elements.balanceDisplay.textContent = '0';
    }
}

// Handle connect button click
async function handleConnect() {
    const serverUrl = elements.serverUrlInput.value.trim();
    const roomName = elements.roomNameInput.value.trim();
    const username = elements.usernameInput.value.trim();
    const secret = elements.secretInput.value.trim();
    
    if (!serverUrl || !roomName || !username || !secret) {
        showModal('Connection Error', 'All connection fields are required.', 'error');
        return;
    }
    
    try {
        logMessage(`Connecting to ${serverUrl} in room ${roomName}...`);
        
        // Create Y.js document
        const ydoc = new Y.Doc();
        
        // Handle HTTPS to WSS protocol conversion
        let wsServerUrl = serverUrl;
        
        // If we're on HTTPS and the server URL is WS (not WSS), show a warning
        if (window.location.protocol === 'https:' && serverUrl.startsWith('ws:')) {
            logMessage('Warning: Using insecure WebSocket (ws://) from a secure (https://) page may be blocked by the browser.');
            logMessage('Consider using a secure WebSocket server (wss://) or hosting this page on HTTP.');
            
            // Optional: Ask user if they want to try with secure WebSocket
            const useWss = confirm(
                "You're connecting from a secure HTTPS page to an insecure WebSocket (ws://).\n\n" +
                "This connection will likely be blocked by your browser.\n\n" +
                "Would you like to try using a secure WebSocket connection (wss://) instead?\n\n" +
                "Click OK to use wss:// or Cancel to try with the original ws:// URL."
            );
            
            if (useWss) {
                wsServerUrl = serverUrl.replace('ws:', 'wss:');
                logMessage(`Attempting connection with secure WebSocket: ${wsServerUrl}`);
            }
        }
        
        // Create WebSocket provider with the potentially modified URL
        const provider = new WebsocketProvider(wsServerUrl, roomName, ydoc);
        
        // Create environment handlers for browser
        const environmentHandlers = {
            log: (msg, ...args) => {
                const timestamp = new Date().toISOString();
                logMessage(`[${timestamp}] [${username}] ${msg}`);
                console.log(`[${timestamp}] [${username}] ${msg}`, ...args);
            },
            registerCleanup: (cleanup) => {
                window.addEventListener('beforeunload', cleanup);
            }
        };
        
        // Wait for connection to establish
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Connection timeout'));
            }, 5000);
            
            provider.on('status', ({ status }) => {
                if (status === 'connected') {
                    clearTimeout(timeout);
                    resolve();
                }
            });
            
            provider.on('connection-error', (error) => {
                clearTimeout(timeout);
                reject(error);
            });
        });
        
        // Create UniroadDB instance
        const uniroadDb = new UniroadDB(
            provider,
            ydoc,
            TXF,
            secret,
            username,
            { environmentHandlers }
        );
        
        // Update application state
        appState.connected = true;
        appState.uniroadDb = uniroadDb;
        appState.provider = provider;
        appState.ydoc = ydoc;
        
        // Update UI state
        updateUIState(true);
        
        // Update user info
        elements.usernameDisplay.textContent = username;
        elements.pubkeyDisplay.textContent = uniroadDb.pubkey;
        
        // Set up data observers
        setupDataObservers(uniroadDb);
        
        logMessage('Connected successfully!');
    } catch (error) {
        console.error('Connection error:', error);
        logMessage(`Connection failed: ${error.message}`);
        showModal('Connection Error', `Failed to connect: ${error.message}`, 'error');
    }
}

// Handle disconnect button click
function handleDisconnect() {
    if (!appState.connected) return;
    
    try {
        // Clean up resources
        if (appState.uniroadDb) {
            appState.uniroadDb.destroy();
        }
        
        if (appState.provider) {
            appState.provider.destroy();
        }
        
        // Reset application state
        appState.connected = false;
        appState.uniroadDb = null;
        appState.provider = null;
        appState.ydoc = null;
        
        // Update UI state
        updateUIState(false);
        
        logMessage('Disconnected from server.');
    } catch (error) {
        console.error('Disconnect error:', error);
        logMessage(`Disconnect error: ${error.message}`);
    }
}

// Set up data observers for real-time updates
function setupDataObservers(uniroadDb) {
    // Register market viewer to update marketplace UI
    uniroadDb.registerMarketViewer((getMarketList) => {
        const items = getMarketList();
        updateMarketplaceUI(items);
    });
    
    // Register inventory viewer to update inventory UI
    uniroadDb.registerInventoryViewer(async (getInventoryList) => {
        const inventory = await getInventoryList();
        updateInventoryUI(inventory);
    });
}

// Update marketplace UI with latest items
function updateMarketplaceUI(items) {
    if (!items || items.length === 0) {
        elements.marketplaceList.innerHTML = '<div class="empty-message">No items in marketplace</div>';
        return;
    }
    
    elements.marketplaceList.innerHTML = '';
    
    items.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'item-card';
        
        // Parse item data if it's a string
        let itemData = item;
        if (typeof item === 'string') {
            try {
                itemData = JSON.parse(item);
            } catch (e) {
                console.error('Error parsing item data', e);
            }
        }
        
        const name = itemData.name || 'Unnamed Item';
        const description = itemData.description || 'No description';
        
        itemElement.innerHTML = `
            <h4>${name}</h4>
            <p>${description}</p>
            <div class="item-actions">
                <button class="action-btn buy-btn" data-item="${name}">Buy</button>
            </div>
        `;
        
        // Add event listener to buy button
        const buyBtn = itemElement.querySelector('.buy-btn');
        buyBtn.addEventListener('click', () => handleBuyItem(name));
        
        elements.marketplaceList.appendChild(itemElement);
    });
}

// Update inventory UI with latest items and balance
function updateInventoryUI(inventory) {
    // Update balance display
    elements.balanceDisplay.textContent = inventory.balance.toString();
    
    if (!inventory.items || inventory.items.length === 0) {
        elements.inventoryList.innerHTML = '<div class="empty-message">No items in inventory</div>';
        return;
    }
    
    elements.inventoryList.innerHTML = '';
    
    inventory.items.forEach(item => {
        const itemData = item.tokenData || {};
        let parsedData = itemData;
        
        // Parse token data if it's a string
        if (typeof itemData === 'string') {
            try {
                parsedData = JSON.parse(itemData);
            } catch (e) {
                console.error('Error parsing item token data', e);
            }
        }
        
        const name = parsedData.name || 'Unnamed Item';
        const description = parsedData.description || 'No description';
        
        const itemElement = document.createElement('div');
        itemElement.className = 'item-card';
        itemElement.innerHTML = `
            <h4>${name}</h4>
            <p>${description}</p>
            <div class="item-actions">
                <button class="action-btn list-btn" data-item="${name}">List for Sale</button>
            </div>
        `;
        
        // Add event listener to list button
        const listBtn = itemElement.querySelector('.list-btn');
        listBtn.addEventListener('click', () => handleListItem(name));
        
        elements.inventoryList.appendChild(itemElement);
    });
}

// Handle adding a new coin
async function handleAddCoin() {
    if (!appState.connected || !appState.uniroadDb) return;
    
    try {
        logMessage('Adding coin to inventory...');
        await appState.uniroadDb.addCoin();
        logMessage('Coin added to inventory');
    } catch (error) {
        console.error('Error adding coin:', error);
        logMessage(`Failed to add coin: ${error.message}`);
        showModal('Error', `Failed to add coin: ${error.message}`, 'error');
    }
}

// Handle adding a new item to the marketplace
async function handleAddItem() {
    if (!appState.connected || !appState.uniroadDb) return;
    
    const itemName = elements.newItemNameInput.value.trim();
    const itemDesc = elements.newItemDescInput.value.trim();
    
    if (!itemName) {
        showModal('Error', 'Item name is required', 'error');
        return;
    }
    
    try {
        logMessage(`Adding item "${itemName}" to marketplace...`);
        
        await appState.uniroadDb.addMarketItem(itemName, JSON.stringify({
            name: itemName,
            description: itemDesc || 'No description',
            createdAt: new Date().toISOString()
        }));
        
        logMessage(`Item "${itemName}" added to marketplace`);
        
        // Clear input fields
        elements.newItemNameInput.value = '';
        elements.newItemDescInput.value = '';
    } catch (error) {
        console.error('Error adding item:', error);
        logMessage(`Failed to add item: ${error.message}`);
        showModal('Error', `Failed to add item: ${error.message}`, 'error');
    }
}

// Handle buying an item
function handleBuyItem(itemName) {
    if (!appState.connected || !appState.uniroadDb) return;
    
    // Store the pending action for modal confirmation
    appState.pendingAction = {
        type: 'buy',
        itemName: itemName
    };
    
    showModal('Confirm Purchase', `Are you sure you want to buy "${itemName}"?`, 'confirm');
}

// Handle listing an item for sale
function handleListItem(itemName) {
    if (!appState.connected || !appState.uniroadDb) return;
    
    // Store the pending action for modal confirmation
    appState.pendingAction = {
        type: 'list',
        itemName: itemName
    };
    
    showModal('Confirm Listing', `Are you sure you want to list "${itemName}" for sale?`, 'confirm');
}

// Handle modal confirmation
async function handleModalConfirm() {
    if (!appState.pendingAction) {
        closeModal();
        return;
    }
    
    const { type, itemName } = appState.pendingAction;
    
    try {
        if (type === 'buy') {
            logMessage(`Purchasing item "${itemName}"...`);
            await appState.uniroadDb.purchase(itemName);
            logMessage(`Purchased item "${itemName}"`);
        } else if (type === 'list') {
            logMessage(`Listing item "${itemName}" for sale...`);
            await appState.uniroadDb.listItem(itemName);
            logMessage(`Listed item "${itemName}" for sale`);
        }
    } catch (error) {
        console.error(`Error ${type === 'buy' ? 'purchasing' : 'listing'} item:`, error);
        logMessage(`Failed to ${type === 'buy' ? 'purchase' : 'list'} item: ${error.message}`);
        showModal('Error', `Failed to ${type === 'buy' ? 'purchase' : 'list'} item: ${error.message}`, 'error');
    } finally {
        appState.pendingAction = null;
        closeModal();
    }
}

// Show modal dialog
function showModal(title, message, type = 'info') {
    elements.modalTitle.textContent = title;
    elements.modalMessage.textContent = message;
    
    // Configure modal based on type
    if (type === 'error') {
        elements.modalConfirmBtn.style.display = 'none';
        elements.modalCancelBtn.textContent = 'Close';
    } else if (type === 'confirm') {
        elements.modalConfirmBtn.style.display = 'inline-block';
        elements.modalCancelBtn.textContent = 'Cancel';
    } else { // info
        elements.modalConfirmBtn.style.display = 'none';
        elements.modalCancelBtn.textContent = 'OK';
    }
    
    elements.modal.style.display = 'block';
}

// Close modal dialog
function closeModal() {
    elements.modal.style.display = 'none';
    
    // If closing modal cancels a pending action
    if (appState.pendingAction) {
        appState.pendingAction = null;
    }
}

// Add log message to log container
function logMessage(message) {
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    
    logEntry.innerHTML = `<span class="log-time">[${timeString}]</span> ${message}`;
    elements.logContainer.appendChild(logEntry);
    
    // Scroll to bottom
    elements.logContainer.scrollTop = elements.logContainer.scrollHeight;
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);

// Export functions for potential external use
module.exports = {
    initApp,
    handleConnect,
    handleDisconnect,
    handleAddCoin,
    handleAddItem
};