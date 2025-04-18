// Import required libraries 
const Y = require('yjs');
const { WebsocketProvider } = require('y-websocket');
const { UnitelDB } = require('./unitel-db');
const TXF = require('@unicitylabs/tx-flow-engine');
const SimplePeer = require('simple-peer');

// DOM elements
const elements = {
    statusIndicator: document.getElementById('status-indicator'),
    statusText: document.getElementById('status-text'),
    usernameDisplay: document.getElementById('username-display'),
    pubkeyDisplay: document.getElementById('pubkey-display'),
    privacyDisplay: document.getElementById('privacy-display'),
    tokenCountDisplay: document.getElementById('token-count-display'),
    contactsList: document.getElementById('contacts-list'),
    chatHeader: document.getElementById('chat-header'),
    chatMessages: document.getElementById('chat-messages'),
    messageInput: document.getElementById('message-input'),
    
    // Media elements
    remoteVideo: document.getElementById('remote-video'),
    localVideo: document.getElementById('local-video'),
    
    // Call state elements
    noCallState: document.getElementById('no-call-state'),
    incomingCallState: document.getElementById('incoming-call-state'),
    ongoingCallState: document.getElementById('ongoing-call-state'),
    incomingCallText: document.getElementById('incoming-call-text'),
    
    // Forms and inputs
    serverUrlInput: document.getElementById('server-url'),
    roomNameInput: document.getElementById('room-name'),
    usernameInput: document.getElementById('username'),
    secretInput: document.getElementById('secret'),
    contactSearchInput: document.getElementById('contact-search'),
    newContactNameInput: document.getElementById('new-contact-name'),
    privacySetting: document.getElementById('privacy-setting'),
    messageInput: document.getElementById('message-input'),
    audioInput: document.getElementById('audio-input'),
    videoInput: document.getElementById('video-input'),
    fileInput: document.getElementById('file-input'),
    
    // Buttons
    connectBtn: document.getElementById('connect-btn'),
    disconnectBtn: document.getElementById('disconnect-btn'),
    addContactBtn: document.getElementById('add-contact-btn'),
    sendMessageBtn: document.getElementById('send-message-btn'),
    startCallBtn: document.getElementById('start-call-btn'),
    answerCallBtn: document.getElementById('answer-call-btn'),
    rejectCallBtn: document.getElementById('reject-call-btn'),
    endCallBtn: document.getElementById('end-call-btn'),
    toggleAudioBtn: document.getElementById('toggle-audio-btn'),
    toggleVideoBtn: document.getElementById('toggle-video-btn'),
    testMediaBtn: document.getElementById('test-media-btn'),
    emojiBtn: document.getElementById('emoji-btn'),
    fileBtn: document.getElementById('file-btn'),
    tokenBtn: document.getElementById('token-btn'),
    
    // Modal elements
    modal: document.getElementById('modal'),
    modalTitle: document.getElementById('modal-title'),
    modalMessage: document.getElementById('modal-message'),
    modalContent: document.getElementById('modal-content'),
    emojiPicker: document.getElementById('emoji-picker'),
    tokenPicker: document.getElementById('token-picker'),
    imageViewer: document.getElementById('image-viewer'),
    fullImage: document.getElementById('full-image'),
    saveImageBtn: document.getElementById('save-image-btn'),
    modalConfirmBtn: document.getElementById('modal-confirm'),
    modalCancelBtn: document.getElementById('modal-cancel'),
    modalCloseBtn: document.querySelector('.close-btn')
};

// Application state
let appState = {
    connected: false,
    unitelDb: null,
    provider: null,
    ydoc: null,
    currentContact: null,
    pendingAction: null,
    callState: {
        inCall: false,
        localStream: null,
        peer: null,
        remoteStream: null,
        callDirection: null,
        currentCallContact: null,
        pendingCandidates: [],
        pendingCallId: null
    },
    mediaDevices: {
        audioInput: [],
        videoInput: []
    }
};

// Common emojis for the emoji picker
const commonEmojis = [
    '😀', '😂', '🙂', '😍', '👍', '👎', '👏', '🙏',
    '❤️', '🔥', '🎉', '🚀', '👋', '😭', '🤔', '🤗',
    '😴', '😎', '🤓', '🧐', '👨‍💻', '👩‍💻', '📱', '💻',
    '📊', '📈', '📉', '📝', '🔒', '⏰', '🏆', '💯'
];

// Track initialization to prevent double init
let appInitialized = false;

// Initialize the application
function initApp() {
    // Prevent multiple initializations
    if (window.__UNITEL_INITIALIZED === true) {
        console.log('Unitel already initialized, skipping duplicate initialization');
        return;
    }
    window.__UNITEL_INITIALIZED = true;
    console.log('Unitel initialization - first and only time');
    
    // Prevent duplicate initialization
    if (appInitialized) {
        console.log('Application already initialized, skipping');
        return;
    }
    
    console.log('Initializing Unitel application...');
    appInitialized = true;
    
    // Validate critical DOM elements exist
    console.log('Checking DOM elements...');
    const criticalElements = [
        'new-contact-name', 
        'add-contact-btn',
        'connect-btn', 
        'username', 
        'secret'
    ];
    
    let missingElements = false;
    criticalElements.forEach(id => {
        const element = document.getElementById(id);
        console.log(`Element #${id} exists:`, !!element);
        if (!element) {
            console.error(`Critical element #${id} is missing!`);
            missingElements = true;
        }
    });
    
    if (missingElements) {
        console.error('Missing critical elements - app may not function correctly');
    }
    
    // Double check the contact input directly
    const contactInput = document.getElementById('new-contact-name');
    console.log('Contact input element:', contactInput);
    console.log('Contact input properties:', contactInput ? {
        id: contactInput.id,
        type: contactInput.type,
        value: contactInput.value,
        placeholder: contactInput.placeholder
    } : 'NULL');
    
    // Set up event listeners
    setupEventListeners();
    
    // Disable action buttons initially
    updateUIState(false);
    
    // Initialize emoji picker
    initEmojiPicker();
    
    // Check if we're on HTTPS and update the default server URL if needed
    if (window.location.protocol === 'https:') {
        const serverInput = elements.serverUrlInput;
        if (serverInput && serverInput.value.startsWith('ws:')) {
            const wssUrl = serverInput.value.replace('ws:', 'wss:');
            serverInput.value = wssUrl;
            console.log('Note: Default server URL changed to WSS (secure WebSocket) because you\'re on an HTTPS page.');
        }
    }
    
    // Check for media devices support
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        loadMediaDevices();
    }
    
    // Add message to chat area
    addSystemMessage('Unitel initialized. Please connect to the network.');
}

// Set up event listeners for UI interactions
function setupEventListeners() {
    // Connection buttons
    elements.connectBtn.addEventListener('click', handleConnect);
    elements.disconnectBtn.addEventListener('click', handleDisconnect);
    
    // Contact management
    elements.addContactBtn.addEventListener('click', handleAddContact);
    elements.contactSearchInput.addEventListener('input', handleContactSearch);
    
    // Privacy settings
    if (elements.privacySetting) {
        elements.privacySetting.addEventListener('change', handlePrivacyChange);
    }
    
    // Chat controls
    elements.sendMessageBtn.addEventListener('click', handleSendMessage);
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    });
    
    // Media controls
    elements.emojiBtn.addEventListener('click', showEmojiPicker);
    elements.fileBtn.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', handleFileSelected);
    elements.tokenBtn.addEventListener('click', showTokenPicker);
    
    // Call controls
    elements.startCallBtn.addEventListener('click', handleStartCall);
    elements.answerCallBtn.addEventListener('click', handleAnswerCall);
    elements.rejectCallBtn.addEventListener('click', handleRejectCall);
    elements.endCallBtn.addEventListener('click', handleEndCall);
    elements.toggleAudioBtn.addEventListener('click', handleToggleAudio);
    elements.toggleVideoBtn.addEventListener('click', handleToggleVideo);
    elements.testMediaBtn.addEventListener('click', handleTestMedia);
    
    // Media device selection
    elements.audioInput.addEventListener('change', handleAudioDeviceChange);
    elements.videoInput.addEventListener('change', handleVideoDeviceChange);
    
    // Modal controls
    elements.modalConfirmBtn.addEventListener('click', handleModalConfirm);
    elements.modalCancelBtn.addEventListener('click', closeModal);
    elements.modalCloseBtn.addEventListener('click', closeModal);
    elements.saveImageBtn.addEventListener('click', handleSaveImage);
}

// Update UI elements based on connection state
function updateUIState(isConnected) {
    const disableState = !isConnected;
    
    // Basic connection UI
    elements.statusIndicator.className = isConnected ? 'connected' : '';
    elements.statusText.textContent = isConnected ? 'Connected' : 'Disconnected';
    
    // Connection controls
    elements.connectBtn.disabled = isConnected;
    elements.disconnectBtn.disabled = !isConnected;
    elements.serverUrlInput.disabled = isConnected;
    elements.roomNameInput.disabled = isConnected;
    elements.usernameInput.disabled = isConnected;
    elements.secretInput.disabled = isConnected;
    
    // Contact management
    elements.contactSearchInput.disabled = disableState;
    elements.newContactNameInput.disabled = disableState;
    elements.addContactBtn.disabled = disableState;
    
    // Chat UI
    elements.messageInput.disabled = disableState || !appState.currentContact;
    elements.sendMessageBtn.disabled = disableState || !appState.currentContact;
    elements.emojiBtn.disabled = disableState || !appState.currentContact;
    elements.fileBtn.disabled = disableState || !appState.currentContact;
    elements.tokenBtn.disabled = disableState || !appState.currentContact;
    
    // Call controls
    elements.startCallBtn.disabled = disableState || 
                                   !appState.currentContact || 
                                   appState.callState.inCall;
    
    elements.testMediaBtn.disabled = disableState;
    
    // Privacy settings
    if (elements.privacySetting) {
        elements.privacySetting.disabled = disableState;
    }
    
    // Reset state if disconnected
    if (!isConnected) {
        elements.usernameDisplay.textContent = 'Not connected';
        elements.pubkeyDisplay.textContent = '-';
        elements.privacyDisplay.textContent = 'Contacts Only';
        elements.tokenCountDisplay.textContent = '0';
        elements.contactsList.innerHTML = '<div class="empty-message">No contacts</div>';
        elements.chatMessages.innerHTML = '<div class="empty-message">Select a contact to start chatting</div>';
        elements.chatHeader.textContent = 'Select a contact';
        
        // Reset call state UI
        resetCallUI();
    }
}

// Track connection state to prevent duplicate connections
let connectionInProgress = false;

// Handle connect button click
async function handleConnect() {
    // Prevent multiple concurrent connection attempts
    if (connectionInProgress) {
        console.log('Connection already in progress, ignoring request');
        return;
    }
    
    // Get fresh DOM references
    const serverUrlInput = document.getElementById('server-url');
    const roomNameInput = document.getElementById('room-name');
    const usernameInput = document.getElementById('username');
    const secretInput = document.getElementById('secret');
    const connectBtn = document.getElementById('connect-btn');
    
    if (!serverUrlInput || !roomNameInput || !usernameInput || !secretInput) {
        showModal('Error', 'UI elements not found. Please refresh the page.');
        return;
    }
    
    const serverUrl = serverUrlInput.value.trim();
    const roomName = roomNameInput.value.trim();
    const username = usernameInput.value.trim();
    const secret = secretInput.value.trim();
    
    if (!serverUrl || !roomName || !username || !secret) {
        showModal('Connection Error', 'All connection fields are required.');
        return;
    }
    
    // Disable connect button and show connecting state
    if (connectBtn) {
        connectBtn.disabled = true;
        connectBtn.textContent = 'Connecting...';
    }
    
    connectionInProgress = true;
    
    try {
        addSystemMessage(`Connecting to ${serverUrl} in room ${roomName}...`);
        
        // Create Y.js document
        const ydoc = new Y.Doc();
        
        // Create WebSocket provider
        const provider = new WebsocketProvider(serverUrl, roomName, ydoc);
        
        // Create environment handlers for browser
        const environmentHandlers = {
            log: (msg, ...args) => {
                console.log(`[${username}] ${msg}`, ...args);
                // Only log critical messages to UI
                if (typeof msg === 'string' && (
                    msg.includes('Error') || 
                    msg.includes('Connected') || 
                    msg.includes('initialized') ||
                    msg.includes('received')
                )) {
                    addSystemMessage(msg);
                }
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
        
        // Create UnitelDB instance
        const unitelDb = new UnitelDB(
            provider,
            ydoc,
            TXF,
            secret,
            username,
            { environmentHandlers }
        );
        
        // Update application state
        appState.connected = true;
        appState.unitelDb = unitelDb;
        appState.provider = provider;
        appState.ydoc = ydoc;
        
        // Update UI state
        updateUIState(true);
        
        // Update user info
        elements.usernameDisplay.textContent = username;
        elements.pubkeyDisplay.textContent = unitelDb.pubkey;
        
        // Initialize privacy display
        const privacySetting = unitelDb.awareness.getLocalState().user.showStatusTo;
        elements.privacyDisplay.textContent = privacySetting === 'everyone' ? 'Everyone' : 'Contacts Only';
        
        // Set privacy dropdown to match
        if (elements.privacySetting) {
            elements.privacySetting.value = privacySetting || 'contacts_only';
        }
        
        // Set up data observers
        setupDataObservers(unitelDb);
        
        // Register handlers
        registerHandlers(unitelDb);
        
        addSystemMessage('Connected successfully!');
    } catch (error) {
        console.error('Connection error:', error);
        addSystemMessage(`Connection failed: ${error.message}`);
        showModal('Connection Error', `Failed to connect: ${error.message}`);
        
        // Reset UI on error
        updateUIState(false);
    } finally {
        connectionInProgress = false;
        
        // Reset connect button
        if (connectBtn) {
            connectBtn.disabled = false;
            connectBtn.textContent = 'Connect';
        }
    }
}

// Handle privacy setting change
function handlePrivacyChange() {
    if (!appState.connected || !appState.unitelDb || !appState.unitelDb.awareness) {
        console.log('Cannot change privacy settings while disconnected');
        return;
    }
    
    const privacySetting = elements.privacySetting.value;
    console.log(`Changing privacy setting to: ${privacySetting}`);
    
    try {
        // Get current user state
        const currentState = appState.unitelDb.awareness.getLocalState();
        
        // Update the privacy setting
        appState.unitelDb.awareness.setLocalState({
            user: {
                ...currentState.user,
                showStatusTo: privacySetting
            }
        });
        
        // Update the UI
        elements.privacyDisplay.textContent = privacySetting === 'everyone' ? 'Everyone' : 'Contacts Only';
        
        addSystemMessage(`Privacy setting updated: ${privacySetting === 'everyone' ? 'Everyone' : 'Contacts Only'}`);
    } catch (error) {
        console.error('Error changing privacy setting:', error);
        showModal('Error', `Failed to update privacy setting: ${error.message}`);
    }
}

// Handle disconnect button click
function handleDisconnect() {
    if (!appState.connected) return;
    
    try {
        // Clean up resources
        if (appState.unitelDb) {
            appState.unitelDb.destroy();
        }
        
        if (appState.provider) {
            appState.provider.destroy();
        }
        
        // Clean up call resources
        cleanupCallState();
        
        // Reset application state
        appState.connected = false;
        appState.unitelDb = null;
        appState.provider = null;
        appState.ydoc = null;
        appState.currentContact = null;
        
        // Update UI state
        updateUIState(false);
        
        addSystemMessage('Disconnected from server.');
    } catch (error) {
        console.error('Disconnect error:', error);
        addSystemMessage(`Disconnect error: ${error.message}`);
    }
}

// Set up data observers for real-time updates
function setupDataObservers(unitelDb) {
    // Load initial data
    updateContactsList(unitelDb.getContactsList());
    updateInventory(unitelDb.getInventoryList());
}

// Register handlers for real-time updates
function registerHandlers(unitelDb) {
    // Register contacts viewer
    unitelDb.registerContactsViewer((getContactsList) => {
        const contacts = getContactsList();
        updateContactsList(contacts);
    });
    
    // Register inventory viewer
    unitelDb.registerInventoryViewer(async (getInventoryList) => {
        const inventory = await getInventoryList();
        updateInventory(inventory);
    });
    
    // Register chat viewer
    unitelDb.registerChatViewer((getChat) => {
        getChat().then(messages => {
            updateChatUI(messages);
        });
    });
    
    // Register call handler
    unitelDb.registerCallHandler(handleCallStateChange);
    
    // Register WebRTC handler
    unitelDb.registerWebRTCHandler(handleWebRTCSignaling);
}

// Update contacts list UI
function updateContactsList(contacts) {
    // Get the DOM element directly to ensure we have the latest reference
    const contactsListElement = document.getElementById('contacts-list');
    if (!contactsListElement) {
        console.error('Contacts list element not found in DOM');
        return;
    }
    
    console.log('Updating contacts list with:', contacts);
    
    // Handle empty contacts list
    if (!contacts || !Array.isArray(contacts) || contacts.length === 0) {
        contactsListElement.innerHTML = '<div class="empty-message">No contacts</div>';
        return;
    }
    
    // Clear the current list
    contactsListElement.innerHTML = '';
    
    // Add contacts to the list
    contacts.forEach(contact => {
        if (!contact || !contact.username) {
            console.warn('Invalid contact object:', contact);
            return; // Skip invalid contacts
        }
        
        const contactElement = document.createElement('div');
        contactElement.className = 'contact-item';
        contactElement.setAttribute('data-username', contact.username);
        
        if (appState.currentContact === contact.username) {
            contactElement.classList.add('active');
        }
        
        if (appState.callState.inCall && appState.callState.currentCallContact === contact.username) {
            contactElement.classList.add('calling');
        }
        
        // Default to offline if status is not set
        const status = contact.status || 'offline';
        const statusClass = `status-${status}`;
        
        // Format last seen or provide default
        const lastSeen = contact.lastSeen ? formatLastSeen(contact.lastSeen) : 'Unknown';
        
        contactElement.innerHTML = `
            <span class="contact-status ${statusClass}"></span>
            <div class="contact-info">
                <div class="contact-name">${contact.username}</div>
                <div class="contact-last-seen">Last seen: ${lastSeen}</div>
            </div>
        `;
        
        // Add click event handler
        contactElement.addEventListener('click', () => {
            console.log(`Contact ${contact.username} clicked`);
            handleContactSelect(contact.username);
        });
        
        // Add to DOM
        contactsListElement.appendChild(contactElement);
    });
    
    // Update call button state based on selected contact's status
    if (appState.currentContact) {
        const selectedContact = contacts.find(c => c.username === appState.currentContact);
        
        // Get the button directly from DOM
        const startCallBtn = document.getElementById('start-call-btn');
        if (startCallBtn) {
            const isOnline = selectedContact && selectedContact.status === 'online';
            startCallBtn.disabled = !isOnline || appState.callState.inCall;
            
            // Add visual feedback about why the button is disabled
            if (startCallBtn.disabled && selectedContact) {
                startCallBtn.title = appState.callState.inCall 
                    ? "Already in a call" 
                    : `Cannot call ${selectedContact.username} (${selectedContact.status})`;
            } else if (startCallBtn.disabled) {
                startCallBtn.title = "No contact selected";
            } else {
                startCallBtn.title = `Call ${selectedContact.username}`;
            }
        }
    }
}

// Format last seen timestamp
function formatLastSeen(timestamp) {
    if (!timestamp) return 'Unknown';
    
    const lastSeen = new Date(timestamp);
    const now = new Date();
    const diffMs = now - lastSeen;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return lastSeen.toLocaleDateString();
}

// Update inventory UI
async function updateInventory(tokens) {
    elements.inventoryList.innerHTML = '';
    
    if (!tokens || tokens.length === 0) {
        elements.tokenCountDisplay.textContent = '0';
        return;
    }
    
    elements.tokenCountDisplay.textContent = tokens.length.toString();
    
    // Only display tokens (not nametags)
    const tokensToDisplay = tokens.filter(token => 
        token.tokenClass !== appState.unitelDb?.tokenNametagClass
    );
    
    tokensToDisplay.forEach(token => {
        const tokenData = token.tokenData || {};
        
        // Create token element
        const tokenElement = document.createElement('div');
        tokenElement.className = 'token-item';
        tokenElement.textContent = tokenData.name || token.tokenId.substring(0, 8);
        
        // Add click handler to select token for sharing
        tokenElement.addEventListener('click', () => handleTokenSelect(token));
        
        elements.inventoryList.appendChild(tokenElement);
    });
}

// Update chat UI with messages
function updateChatUI(messages) {
    if (!messages || messages.length === 0) {
        elements.chatMessages.innerHTML = '<div class="empty-message">No messages</div>';
        return;
    }
    
    elements.chatMessages.innerHTML = '';
    
    messages.forEach(message => {
        const messageElement = createMessageElement(message);
        elements.chatMessages.appendChild(messageElement);
    });
    
    // Scroll to bottom
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// Create a message element based on message type
function createMessageElement(message) {
    const isCurrentUser = message.sender === elements.usernameDisplay.textContent;
    const messageClass = isCurrentUser ? 'message-sent' : 'message-received';
    
    const messageElement = document.createElement('div');
    messageElement.className = `chat-message ${messageClass}`;
    
    // Handle different message types
    switch (message.type) {
        case 'text':
            messageElement.innerHTML = `
                <div class="message-content">${escapeHtml(message.content)}</div>
                <div class="message-meta">${formatTimestamp(message.timestamp)}</div>
            `;
            break;
            
        case 'image':
            messageElement.innerHTML = `
                <div class="message-content">
                    <img src="${message.content.data}" class="message-image" alt="Image" 
                         onclick="showFullImage('${message.content.data}', '${message.content.name}')">
                </div>
                <div class="message-meta">${formatTimestamp(message.timestamp)}</div>
            `;
            break;
            
        case 'file':
            messageElement.innerHTML = `
                <div class="message-content">
                    <div class="message-file" onclick="downloadFile('${message.content.data}', '${message.content.name}')">
                        <span>📄</span>
                        <span>${message.content.name}</span>
                    </div>
                </div>
                <div class="message-meta">${formatTimestamp(message.timestamp)}</div>
            `;
            break;
            
        case 'token':
            messageElement.innerHTML = `
                <div class="message-content">
                    <div class="message-token">
                        <div>🪙 Token: ${message.content.tokenName}</div>
                        <div>Value: ${message.content.tokenValue || 'N/A'}</div>
                    </div>
                </div>
                <div class="message-meta">${formatTimestamp(message.timestamp)}</div>
            `;
            break;
            
        case 'system':
            // Convert to div.system-message instead of chat-message
            messageElement.className = 'system-message';
            
            // Handle different system message types
            if (message.content.type && message.content.type.startsWith('call_')) {
                const callType = message.content.type.replace('call_', '');
                const status = message.content.status;
                
                if (callType === 'outgoing') {
                    if (status === 'initiated') {
                        messageElement.textContent = 'Call initiated';
                    } else if (status === 'ended') {
                        messageElement.textContent = 'Call ended';
                    }
                } else if (callType === 'incoming') {
                    if (status === 'accepted') {
                        messageElement.textContent = 'Call accepted';
                    } else if (status === 'rejected') {
                        messageElement.textContent = 'Call rejected';
                    } else if (status === 'ended') {
                        messageElement.textContent = 'Call ended';
                    }
                }
            } else {
                messageElement.textContent = message.content;
            }
            break;
            
        default:
            messageElement.innerHTML = `
                <div class="message-content">${escapeHtml(JSON.stringify(message.content))}</div>
                <div class="message-meta">${formatTimestamp(message.timestamp)}</div>
            `;
    }
    
    return messageElement;
}

// Format message timestamp
function formatTimestamp(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    if (isToday) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
        return date.toLocaleDateString([], { 
            month: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }
}

// Add a system message to the chat area
function addSystemMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.className = 'system-message';
    messageElement.textContent = message;
    
    elements.chatMessages.appendChild(messageElement);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

// Handle contact selection
function handleContactSelect(username) {
    if (!appState.connected || !appState.unitelDb) return;
    
    // Update UI
    appState.currentContact = username;
    elements.chatHeader.textContent = username;
    
    // Update contacts list UI
    updateContactsList(appState.unitelDb.getContactsList());
    
    // Load chat history
    appState.unitelDb.setCurrentChatContact(username);
    
    // Enable/disable chat controls
    elements.messageInput.disabled = false;
    elements.sendMessageBtn.disabled = false;
    elements.emojiBtn.disabled = false;
    elements.fileBtn.disabled = false;
    elements.tokenBtn.disabled = false;
    
    // Update call button state
    const contacts = appState.unitelDb.getContactsList();
    const selectedContact = contacts.find(c => c.username === username);
    elements.startCallBtn.disabled = !selectedContact || 
                                  selectedContact.status !== 'online' || 
                                  appState.callState.inCall;
}

// Handle adding a new contact
function handleAddContact() {
    // Get the contact name from the input field - always get fresh reference
    const contactNameElement = document.getElementById('new-contact-name');
    if (!contactNameElement) {
        console.error('Contact input element not found in DOM');
        showModal('Error', 'UI error: Contact input element not found');
        return;
    }
    
    const contactName = contactNameElement.value.trim();
    
    console.log('Add contact button clicked:', {
        inputElement: contactNameElement,
        elementId: contactNameElement.id,
        rawValue: contactNameElement.value,
        trimmedValue: contactName,
        isEmpty: !contactName
    });
    
    // Validate the contact name
    if (!contactName) {
        console.error('Contact name is empty after trimming');
        showModal('Error', 'Contact name is required');
        return;
    }
    
    // Make sure we're connected and DB is initialized
    if (!appState.connected || !appState.unitelDb) {
        console.error('Not connected or DB not initialized');
        showModal('Error', 'Please connect first');
        return;
    }
    
    // Disable the button and show loading state
    const addContactBtn = document.getElementById('add-contact-btn');
    if (addContactBtn) {
        addContactBtn.disabled = true;
        addContactBtn.textContent = 'Adding...';
    }
    
    try {
        // Log before adding
        console.log(`Attempting to add contact: "${contactName}"`);
        
        // Add the contact - this returns true if successful
        const result = appState.unitelDb.addContact(contactName);
        console.log(`Contact add result:`, result);
        
        if (result) {
            // Only clear input and show success if we actually succeeded
            contactNameElement.value = '';
            
            // Show success notification
            addSystemMessage(`Contact ${contactName} added successfully`);
            console.log(`Contact ${contactName} added successfully`);
            
            // Show visual confirmation for the user
            showModal('Success', `Contact ${contactName} added successfully`, 'info');
            
            // Force explicit update of the contacts list in the UI
            if (appState.unitelDb) {
                const contacts = appState.unitelDb.getContactsList();
                console.log('Updated contacts list:', contacts);
                updateContactsList(contacts);
            }
        } else {
            // This shouldn't happen, but just in case
            console.error('Contact add returned false or undefined');
            addSystemMessage('Failed to add contact due to unknown error');
            showModal('Error', 'Failed to add contact due to unknown error');
        }
    } catch (error) {
        // Log the full error object for debugging
        console.error('Error adding contact:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        // Only show error modal if it's a genuine error, not "already exists"
        if (error.message.includes('already exists')) {
            addSystemMessage(`Note: Contact ${contactName} already exists in your list`);
            showModal('Note', `Contact ${contactName} already exists in your list`, 'info');
        } else {
            addSystemMessage(`Failed to add contact: ${error.message}`);
            showModal('Error', `Failed to add contact: ${error.message}`);
        }
    } finally {
        // Re-enable the button
        if (addContactBtn) {
            addContactBtn.disabled = false;
            addContactBtn.textContent = 'Add Contact';
        }
    }
}

// Handle contact search
function handleContactSearch() {
    const searchTerm = elements.contactSearchInput.value.toLowerCase();
    
    if (!appState.connected || !appState.unitelDb) return;
    
    const contacts = appState.unitelDb.getContactsList();
    
    if (searchTerm) {
        const filteredContacts = contacts.filter(
            contact => contact.username.toLowerCase().includes(searchTerm)
        );
        updateContactsList(filteredContacts);
    } else {
        updateContactsList(contacts);
    }
}

// Handle sending a message
async function handleSendMessage() {
    if (!appState.connected || !appState.unitelDb || !appState.currentContact) return;
    
    const messageText = elements.messageInput.value.trim();
    
    if (!messageText) return;
    
    try {
        await appState.unitelDb.sendMessage(appState.currentContact, messageText);
        elements.messageInput.value = '';
    } catch (error) {
        console.error('Error sending message:', error);
        addSystemMessage(`Failed to send message: ${error.message}`);
    }
}

// Handle file selection
async function handleFileSelected() {
    if (!appState.connected || !appState.unitelDb || !appState.currentContact) return;
    
    const file = elements.fileInput.files[0];
    if (!file) return;
    
    try {
        await appState.unitelDb.sendFile(
            appState.currentContact, 
            file, 
            file.type, 
            file.name
        );
        
        // Reset file input
        elements.fileInput.value = '';
    } catch (error) {
        console.error('Error sending file:', error);
        addSystemMessage(`Failed to send file: ${error.message}`);
    }
}

// Handle token selection for sharing
async function handleTokenSelect(token) {
    if (!appState.connected || !appState.unitelDb || !appState.currentContact) {
        closeModal();
        return;
    }
    
    try {
        await appState.unitelDb.sendToken(appState.currentContact, token);
        closeModal();
        addSystemMessage(`Token sent to ${appState.currentContact}`);
    } catch (error) {
        console.error('Error sending token:', error);
        showModal('Error', `Failed to send token: ${error.message}`);
    }
}

// Handle starting a call
async function handleStartCall() {
    if (!appState.connected || !appState.unitelDb || !appState.currentContact) return;
    
    try {
        // Request user media first
        const stream = await getMediaStream();
        appState.callState.localStream = stream;
        
        // Display local video
        elements.localVideo.srcObject = stream;
        
        // Start call in UnitelDB (this sends signaling)
        const callId = await appState.unitelDb.startCall(appState.currentContact);
        
        // Update call state
        appState.callState.inCall = true;
        appState.callState.callDirection = 'outgoing';
        appState.callState.currentCallContact = appState.currentContact;
        
        // Update UI
        updateCallUI('calling');
        
        // Add system message
        addSystemMessage(`Calling ${appState.currentContact}...`);
        
    } catch (error) {
        console.error('Error starting call:', error);
        addSystemMessage(`Failed to start call: ${error.message}`);
        showModal('Call Error', error.message);
        
        // Reset call state
        cleanupCallState();
    }
}

// Handle answering a call
async function handleAnswerCall() {
    if (!appState.unitelDb || !appState.callState.pendingCallId) return;
    
    try {
        // Request user media first
        const stream = await getMediaStream();
        appState.callState.localStream = stream;
        
        // Display local video
        elements.localVideo.srcObject = stream;
        
        // Answer call in UnitelDB
        await appState.unitelDb.answerCall(
            appState.callState.currentCallContact, 
            appState.callState.pendingCallId
        );
        
        // Update call state
        appState.callState.inCall = true;
        appState.callState.callDirection = 'incoming';
        
        // Update UI
        updateCallUI('connected');
        
        // Add system message
        addSystemMessage(`Call with ${appState.callState.currentCallContact} connected`);
        
    } catch (error) {
        console.error('Error answering call:', error);
        addSystemMessage(`Failed to answer call: ${error.message}`);
        showModal('Call Error', error.message);
        
        // Reset call state
        cleanupCallState();
    }
}

// Handle rejecting a call
async function handleRejectCall() {
    if (!appState.unitelDb || !appState.callState.pendingCallId) return;
    
    try {
        await appState.unitelDb.rejectCall(
            appState.callState.currentCallContact, 
            appState.callState.pendingCallId
        );
        
        // Add system message
        addSystemMessage(`Call from ${appState.callState.currentCallContact} rejected`);
        
        // Reset call state
        cleanupCallState();
        
    } catch (error) {
        console.error('Error rejecting call:', error);
        addSystemMessage(`Failed to reject call: ${error.message}`);
        
        // Reset call state anyway
        cleanupCallState();
    }
}

// Handle ending a call
async function handleEndCall() {
    if (!appState.unitelDb || !appState.callState.inCall) return;
    
    try {
        await appState.unitelDb.endCall();
        addSystemMessage(`Call ended`);
    } catch (error) {
        console.error('Error ending call:', error);
        addSystemMessage(`Error ending call: ${error.message}`);
    } finally {
        // Clean up call state regardless
        cleanupCallState();
    }
}

// Handle call state changes from the UnitelDB
function handleCallStateChange(event, contactUsername, callId) {
    console.log('Call state change:', event, contactUsername, callId);
    
    switch (event) {
        case 'incoming':
            // Incoming call
            appState.callState.currentCallContact = contactUsername;
            appState.callState.pendingCallId = callId;
            
            // Switch to the contact's chat
            handleContactSelect(contactUsername);
            
            // Update UI
            updateCallUI('incoming');
            elements.incomingCallText.textContent = `Incoming call from ${contactUsername}`;
            
            // Add system message
            addSystemMessage(`Incoming call from ${contactUsername}`);
            break;
            
        case 'answered':
            // Call was answered
            if (appState.callState.callDirection === 'outgoing') {
                // Our outgoing call was answered
                updateCallUI('connected');
                addSystemMessage(`${contactUsername} answered the call`);
                
                // Start WebRTC connection
                initializeWebRTCConnection(contactUsername, true);
            }
            break;
            
        case 'rejected':
            // Call was rejected
            addSystemMessage(`Call ${appState.callState.callDirection === 'outgoing' ? 'to' : 'from'} ${contactUsername} was rejected`);
            cleanupCallState();
            break;
            
        case 'ended':
            // Call was ended
            addSystemMessage(`Call with ${contactUsername} ended`);
            cleanupCallState();
            break;
    }
}

// Handle WebRTC signaling messages
function handleWebRTCSignaling(type, contactUsername, data) {
    if (!appState.callState.inCall) return;
    
    switch (type) {
        case 'offer':
            // Create answer to the offer
            if (!appState.callState.peer) {
                initializeWebRTCConnection(contactUsername, false);
            }
            
            appState.callState.peer.signal(data);
            break;
            
        case 'answer':
            // Process answer to our offer
            if (appState.callState.peer) {
                appState.callState.peer.signal(data);
            }
            break;
            
        case 'candidate':
            // Add ICE candidate
            if (appState.callState.peer) {
                appState.callState.peer.signal(data);
            } else {
                // Store for later
                appState.callState.pendingCandidates.push(data);
            }
            break;
    }
}

// Initialize WebRTC connection
function initializeWebRTCConnection(contactUsername, isInitiator) {
    // Clean up any existing peer
    if (appState.callState.peer) {
        appState.callState.peer.destroy();
    }
    
    // Create new peer
    const peerOptions = {
        initiator: isInitiator,
        stream: appState.callState.localStream,
        trickle: true,
        config: {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:global.stun.twilio.com:3478' }
            ]
        }
    };
    
    const peer = new SimplePeer(peerOptions);
    appState.callState.peer = peer;
    
    // Set up event handlers
    peer.on('signal', data => {
        // Send signaling data to peer
        const signalType = data.type || 'candidate';
        const messageKey = `call_signal_${appState.unitelDb.name}_${Date.now()}`;
        
        // Send via Y.js
        const recipientCollection = appState.ydoc.getMap(`recipient_${contactUsername}`);
        recipientCollection.set(messageKey, {
            type: `sdp_${signalType}`,
            from: appState.unitelDb.name,
            sdp: data,
            timestamp: Date.now()
        });
    });
    
    peer.on('stream', stream => {
        // Display remote stream
        appState.callState.remoteStream = stream;
        elements.remoteVideo.srcObject = stream;
        
        // Update UI
        updateCallUI('connected');
    });
    
    peer.on('error', err => {
        console.error('WebRTC error:', err);
        addSystemMessage(`Call error: ${err.message}`);
    });
    
    peer.on('close', () => {
        cleanupCallState();
    });
    
    // Apply any pending ICE candidates
    if (appState.callState.pendingCandidates.length > 0) {
        appState.callState.pendingCandidates.forEach(candidate => {
            peer.signal(candidate);
        });
        appState.callState.pendingCandidates = [];
    }
}

// Update call UI based on state
function updateCallUI(state) {
    elements.noCallState.style.display = 'none';
    elements.incomingCallState.style.display = 'none';
    elements.ongoingCallState.style.display = 'none';
    
    switch (state) {
        case 'idle':
            elements.noCallState.style.display = 'block';
            elements.startCallBtn.disabled = !appState.currentContact || 
                                         !appState.unitelDb || 
                                         appState.callState.inCall;
            break;
            
        case 'incoming':
            elements.incomingCallState.style.display = 'block';
            break;
            
        case 'calling':
            elements.ongoingCallState.style.display = 'block';
            break;
            
        case 'connected':
            elements.ongoingCallState.style.display = 'block';
            
            // Update contacts list to show calling status
            updateContactsList(appState.unitelDb.getContactsList());
            break;
    }
}

// Reset call UI to idle state
function resetCallUI() {
    elements.noCallState.style.display = 'block';
    elements.incomingCallState.style.display = 'none';
    elements.ongoingCallState.style.display = 'none';
    elements.startCallBtn.disabled = true;
    
    // Clear video elements
    elements.localVideo.srcObject = null;
    elements.remoteVideo.srcObject = null;
}

// Clean up call state
function cleanupCallState() {
    // Stop streams
    if (appState.callState.localStream) {
        appState.callState.localStream.getTracks().forEach(track => track.stop());
    }
    
    // Close peer connection
    if (appState.callState.peer) {
        appState.callState.peer.destroy();
    }
    
    // Reset state
    appState.callState = {
        inCall: false,
        localStream: null,
        peer: null,
        remoteStream: null,
        callDirection: null,
        currentCallContact: null,
        pendingCandidates: [],
        pendingCallId: null
    };
    
    // Update UI
    resetCallUI();
    
    // Update contacts list
    if (appState.unitelDb) {
        updateContactsList(appState.unitelDb.getContactsList());
    }
}

// Handle toggling audio in a call
function handleToggleAudio() {
    if (!appState.callState.localStream) return;
    
    const audioTracks = appState.callState.localStream.getAudioTracks();
    audioTracks.forEach(track => {
        track.enabled = !track.enabled;
    });
    
    const isMuted = !audioTracks[0]?.enabled;
    elements.toggleAudioBtn.textContent = isMuted ? 'Unmute' : 'Mute';
}

// Handle toggling video in a call
function handleToggleVideo() {
    if (!appState.callState.localStream) return;
    
    const videoTracks = appState.callState.localStream.getVideoTracks();
    videoTracks.forEach(track => {
        track.enabled = !track.enabled;
    });
    
    const isHidden = !videoTracks[0]?.enabled;
    elements.toggleVideoBtn.textContent = isHidden ? 'Show Video' : 'Hide Video';
}

// Handle testing media devices
async function handleTestMedia() {
    try {
        const stream = await getMediaStream();
        elements.localVideo.srcObject = stream;
        
        setTimeout(() => {
            if (stream && !appState.callState.inCall) {
                stream.getTracks().forEach(track => track.stop());
                elements.localVideo.srcObject = null;
            }
        }, 5000);
        
    } catch (error) {
        console.error('Error testing media:', error);
        showModal('Media Error', `Failed to access media devices: ${error.message}`);
    }
}

// Handle changing audio device
function handleAudioDeviceChange() {
    // Store selected device ID for later use
    const deviceId = elements.audioInput.value;
    localStorage.setItem('preferredAudioInput', deviceId);
    
    // If in a call, restart media with new device
    if (appState.callState.inCall) {
        restartMediaWithNewDevices();
    }
}

// Handle changing video device
function handleVideoDeviceChange() {
    // Store selected device ID for later use
    const deviceId = elements.videoInput.value;
    localStorage.setItem('preferredVideoInput', deviceId);
    
    // If in a call, restart media with new device
    if (appState.callState.inCall) {
        restartMediaWithNewDevices();
    }
}

// Restart media stream with new devices
async function restartMediaWithNewDevices() {
    try {
        // Stop old tracks
        if (appState.callState.localStream) {
            appState.callState.localStream.getTracks().forEach(track => track.stop());
        }
        
        // Get new stream
        const newStream = await getMediaStream();
        appState.callState.localStream = newStream;
        
        // Update local video
        elements.localVideo.srcObject = newStream;
        
        // Replace tracks in WebRTC connection
        if (appState.callState.peer) {
            const audioTrack = newStream.getAudioTracks()[0];
            const videoTrack = newStream.getVideoTracks()[0];
            
            if (audioTrack) {
                appState.callState.peer.replaceTrack(
                    appState.callState.localStream.getAudioTracks()[0],
                    audioTrack,
                    appState.callState.localStream
                );
            }
            
            if (videoTrack) {
                appState.callState.peer.replaceTrack(
                    appState.callState.localStream.getVideoTracks()[0],
                    videoTrack,
                    appState.callState.localStream
                );
            }
        }
    } catch (error) {
        console.error('Error restarting media:', error);
        showModal('Media Error', `Failed to update media devices: ${error.message}`);
    }
}

// Get user media with selected devices
async function getMediaStream() {
    const constraints = {
        audio: true,
        video: true
    };
    
    // Use preferred devices if selected
    const audioDeviceId = elements.audioInput.value;
    const videoDeviceId = elements.videoInput.value;
    
    if (audioDeviceId) {
        constraints.audio = { deviceId: { exact: audioDeviceId } };
    }
    
    if (videoDeviceId) {
        constraints.video = { deviceId: { exact: videoDeviceId } };
    }
    
    return await navigator.mediaDevices.getUserMedia(constraints);
}

// Load available media devices
async function loadMediaDevices() {
    try {
        // First request permissions to see all devices
        await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
            .then(stream => {
                // Stop the tracks we don't need now
                stream.getTracks().forEach(track => track.stop());
            });
        
        // Now enumerate devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // Filter audio and video input devices
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        const videoInputs = devices.filter(device => device.kind === 'videoinput');
        
        // Store in app state
        appState.mediaDevices.audioInput = audioInputs;
        appState.mediaDevices.videoInput = videoInputs;
        
        // Populate dropdowns
        elements.audioInput.innerHTML = '';
        elements.videoInput.innerHTML = '';
        
        // Add audio devices
        audioInputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Microphone ${elements.audioInput.options.length + 1}`;
            elements.audioInput.appendChild(option);
        });
        
        // Add video devices
        videoInputs.forEach(device => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `Camera ${elements.videoInput.options.length + 1}`;
            elements.videoInput.appendChild(option);
        });
        
        // Set preferred devices if stored
        const preferredAudio = localStorage.getItem('preferredAudioInput');
        const preferredVideo = localStorage.getItem('preferredVideoInput');
        
        if (preferredAudio) {
            elements.audioInput.value = preferredAudio;
        }
        
        if (preferredVideo) {
            elements.videoInput.value = preferredVideo;
        }
        
        // Listen for device changes
        navigator.mediaDevices.addEventListener('devicechange', loadMediaDevices);
        
    } catch (error) {
        console.error('Error loading media devices:', error);
    }
}

// Show modal dialog with emoji picker
function showEmojiPicker() {
    elements.modalTitle.textContent = 'Select Emoji';
    elements.modalMessage.style.display = 'none';
    elements.emojiPicker.style.display = 'grid';
    elements.tokenPicker.style.display = 'none';
    elements.imageViewer.style.display = 'none';
    elements.modalConfirmBtn.style.display = 'none';
    elements.modalCancelBtn.textContent = 'Close';
    
    elements.modal.style.display = 'block';
}

// Show modal dialog with token picker
function showTokenPicker() {
    if (!appState.connected || !appState.unitelDb) return;
    
    elements.modalTitle.textContent = 'Select Token to Send';
    elements.modalMessage.style.display = 'none';
    elements.emojiPicker.style.display = 'none';
    elements.tokenPicker.style.display = 'block';
    elements.imageViewer.style.display = 'none';
    elements.modalConfirmBtn.style.display = 'none';
    elements.modalCancelBtn.textContent = 'Close';
    
    // Populate token picker
    elements.tokenPicker.innerHTML = '';
    
    // Get tokens from inventory
    appState.unitelDb.getInventoryList().then(tokens => {
        // Only display non-nametag tokens
        const tokensToDisplay = tokens.filter(token => 
            token.tokenClass !== appState.unitelDb.tokenNametagClass
        );
        
        if (tokensToDisplay.length === 0) {
            elements.tokenPicker.innerHTML = '<div class="empty-message">No tokens in inventory</div>';
        } else {
            tokensToDisplay.forEach(token => {
                const tokenElement = document.createElement('div');
                tokenElement.className = 'token-item';
                tokenElement.textContent = token.tokenData?.name || token.tokenId.substring(0, 8);
                
                tokenElement.addEventListener('click', () => handleTokenSelect(token));
                
                elements.tokenPicker.appendChild(tokenElement);
            });
        }
    });
    
    elements.modal.style.display = 'block';
}

// Show full size image
function showFullImage(src, name) {
    elements.modalTitle.textContent = name || 'Image';
    elements.modalMessage.style.display = 'none';
    elements.emojiPicker.style.display = 'none';
    elements.tokenPicker.style.display = 'none';
    elements.imageViewer.style.display = 'block';
    elements.fullImage.src = src;
    elements.modalConfirmBtn.style.display = 'none';
    elements.modalCancelBtn.textContent = 'Close';
    
    elements.modal.style.display = 'block';
}

// Handle downloading a file
function downloadFile(dataUrl, fileName) {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    link.click();
}

// Handle saving an image
function handleSaveImage() {
    if (!elements.fullImage.src) return;
    
    const link = document.createElement('a');
    link.href = elements.fullImage.src;
    link.download = 'image_' + Date.now() + '.jpg';
    link.click();
    
    closeModal();
}

// Initialize emoji picker
function initEmojiPicker() {
    elements.emojiPicker.innerHTML = '';
    
    commonEmojis.forEach(emoji => {
        const emojiElement = document.createElement('div');
        emojiElement.className = 'emoji-item';
        emojiElement.textContent = emoji;
        
        emojiElement.addEventListener('click', () => {
            if (!appState.currentContact) return;
            
            // Add emoji to input
            elements.messageInput.value += emoji;
            elements.messageInput.focus();
            
            closeModal();
        });
        
        elements.emojiPicker.appendChild(emojiElement);
    });
}

// Show modal dialog
function showModal(title, message, type = 'info') {
    // Get fresh references to modal elements
    const modalElement = document.getElementById('modal');
    const modalTitleElement = document.getElementById('modal-title');
    const modalMessageElement = document.getElementById('modal-message');
    const modalConfirmBtn = document.getElementById('modal-confirm');
    const modalCancelBtn = document.getElementById('modal-cancel');
    const emojiPicker = document.getElementById('emoji-picker');
    const tokenPicker = document.getElementById('token-picker');
    const imageViewer = document.getElementById('image-viewer');
    
    if (!modalElement || !modalTitleElement || !modalMessageElement) {
        console.error('Modal elements not found in DOM');
        alert(`${title}: ${message}`); // Fallback to alert if modal not available
        return;
    }
    
    modalTitleElement.textContent = title;
    modalMessageElement.textContent = message;
    modalMessageElement.style.display = 'block';
    
    if (emojiPicker) emojiPicker.style.display = 'none';
    if (tokenPicker) tokenPicker.style.display = 'none';
    if (imageViewer) imageViewer.style.display = 'none';
    
    // Configure modal based on type
    if (modalConfirmBtn && modalCancelBtn) {
        if (type === 'error') {
            modalConfirmBtn.style.display = 'none';
            modalCancelBtn.textContent = 'Close';
        } else if (type === 'confirm') {
            modalConfirmBtn.style.display = 'inline-block';
            modalCancelBtn.textContent = 'Cancel';
        } else { // info
            modalConfirmBtn.style.display = 'none';
            modalCancelBtn.textContent = 'OK';
        }
    }
    
    modalElement.style.display = 'block';
}

// Close modal dialog
function closeModal() {
    // Get fresh reference to modal and file input
    const modalElement = document.getElementById('modal');
    const fileInputElement = document.getElementById('file-input');
    
    if (modalElement) {
        modalElement.style.display = 'none';
    }
    
    // Reset file input if it exists
    if (fileInputElement) {
        fileInputElement.value = '';
    }
    
    // If closing modal cancels a pending action
    appState.pendingAction = null;
}

// Handle modal confirmation
function handleModalConfirm() {
    // Handle any pending actions
    if (appState.pendingAction) {
        console.log('Processing pending action:', appState.pendingAction.type);
        switch (appState.pendingAction.type) {
            // Add cases for confirm actions here
        }
    }
    
    closeModal();
}

// Helper function to escape HTML to prevent XSS
function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Expose necessary functions for HTML elements
window.showFullImage = showFullImage;
window.downloadFile = downloadFile;

// Initialize the application when DOM is loaded - with safeguards
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
        console.log('DOM loaded - initializing Unitel');
        setTimeout(initApp, 100); // Slight delay to ensure DOM is fully ready
    });
} else {
    // DOM already loaded, initialize directly with delay
    console.log('DOM already loaded - initializing Unitel with delay');
    setTimeout(initApp, 100);
}

// Export functions for webpack
module.exports = {
    initApp
};