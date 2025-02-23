// browser-client.js
import * as Y from 'yjs';
import { WebrtcProvider } from 'y-webrtc';
import { UniroadDB } from './uniroad-db';
import TXF from '@unicitylabs/tx-flow-engine'; // Replace with your actual import

// Create document and provider for browser environment
function createBrowserClient(username, secret) {
    // Create a Yjs document
    const ydoc = new Y.Doc();
    
    // Create the WebRTC provider for browser
    const provider = new WebrtcProvider('uniroad', ydoc, {
        signaling: ['wss://signaling.yjs.dev', 'wss://y-webrtc-signaling-eu.herokuapp.com'],
        awareness: ydoc.awareness
    });
    
    // Create the UniroadDB instance
    const db = new UniroadDB(
        provider, 
        ydoc, 
        TXF, 
        secret, 
        username
    );
    
    // Optional: Add connection status indicators
    provider.on('status', event => {
        console.log('Connection status changed:', event.status);
        
        // Update UI based on connection status
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.textContent = event.status;
            statusElement.className = event.status;
        }
    });
    
    // Register UI viewers (implement these functions based on your UI needs)
    db.registerMarketViewer((getMarketList, data, key) => {
        updateMarketplaceUI(getMarketList());
    });
    
    db.registerInventoryViewer((getInventoryList, data, key) => {
        getInventoryList().then(inventory => {
            updateInventoryUI(inventory);
        });
    });
    
    return db;
}

// Example UI update functions
function updateMarketplaceUI(items) {
    const container = document.getElementById('marketplace');
    if (!container) return;
    
    container.innerHTML = '';
    
    items.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'market-item';
        itemElement.innerHTML = `
            <h3>${item.name || 'Unnamed Item'}</h3>
            <p>${item.description || 'No description'}</p>
            <button class="buy-button" data-item="${item.name}">Buy</button>
        `;
        container.appendChild(itemElement);
    });
    
    // Add event listeners to buy buttons
    document.querySelectorAll('.buy-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const itemName = e.target.getAttribute('data-item');
            window.uniroadDB.purchase(itemName)
                .then(() => console.log(`Purchased ${itemName}`))
                .catch(err => console.error(`Error purchasing ${itemName}:`, err));
        });
    });
}

function updateInventoryUI({ coins, items, balance }) {
    const container = document.getElementById('inventory');
    if (!container) return;
    
    container.innerHTML = '';
    
    // Display balance
    const balanceElement = document.createElement('div');
    balanceElement.className = 'balance';
    balanceElement.innerHTML = `<h2>Balance: ${balance.toString()}</h2>`;
    container.appendChild(balanceElement);
    
    // Display items
    const itemsContainer = document.createElement('div');
    itemsContainer.className = 'items-container';
    
    items.forEach(item => {
        const itemElement = document.createElement('div');
        itemElement.className = 'inventory-item';
        itemElement.innerHTML = `
            <h3>${item.state?.data?.name || 'Unnamed Item'}</h3>
            <p>${item.state?.data?.description || 'No description'}</p>
            <button class="list-button" data-item="${item.state?.data?.name}">List for Sale</button>
        `;
        itemsContainer.appendChild(itemElement);
    });
    
    container.appendChild(itemsContainer);
    
    // Add event listeners to list buttons
    document.querySelectorAll('.list-button').forEach(button => {
        button.addEventListener('click', (e) => {
            const itemName = e.target.getAttribute('data-item');
            window.uniroadDB.listItem(itemName)
                .then(() => console.log(`Listed ${itemName}`))
                .catch(err => console.error(`Error listing ${itemName}:`, err));
        });
    });
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value;
            const secret = document.getElementById('secret').value;
            
            if (!username || !secret) {
                alert('Please provide both username and secret');
                return;
            }
            
            // Create client and store in window for global access
            window.uniroadDB = createBrowserClient(username, secret);
            
            // Show the application UI
            document.getElementById('login-container').style.display = 'none';
            document.getElementById('app-container').style.display = 'block';
        });
    }
    
    // Add coin button
    const addCoinButton = document.getElementById('add-coin');
    if (addCoinButton) {
        addCoinButton.addEventListener('click', () => {
            if (window.uniroadDB) {
                window.uniroadDB.addCoin()
                    .then(() => console.log('Coin added to inventory'))
                    .catch(err => console.error('Error adding coin:', err));
            }
        });
    }
    
    // Add item button
    const addItemButton = document.getElementById('add-item');
    if (addItemButton) {
        addItemButton.addEventListener('click', () => {
            if (window.uniroadDB) {
                const itemName = prompt('Enter item name:');
                const itemDescription = prompt('Enter item description:');
                
                if (itemName) {
                    window.uniroadDB.addMarketItem(itemName, {
                        name: itemName,
                        description: itemDescription || 'No description',
                        createdAt: new Date().toISOString()
                    })
                    .then(() => console.log('Item added to marketplace'))
                    .catch(err => console.error('Error adding item:', err));
                }
            }
        });
    }
});

export { createBrowserClient };
