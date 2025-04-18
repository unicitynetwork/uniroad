// Constants for token types and configuration
const coin_token_type = 'unicity_test_coin';
const nametag_token_type = 'unitel_nametag';
const contact_status_interval = 10000; // Poll contacts every 10 seconds

class UnitelDB {
    constructor(provider, ydoc, TXF, secret, name, options = {}) {
        this.ydoc = ydoc;
        this.TXF = TXF;
        this.transport = TXF.getHTTPTransport(TXF.defaultGateway());
        this.secret = secret;
        this.name = name;
        this.pubkey = TXF.generateRecipientPubkeyAddr(secret);
        this.tokenNametagClass = TXF.validateOrConvert('token_class', nametag_token_type);
        this.tokenCoinClass = TXF.validateOrConvert('token_class', coin_token_type);
        this.environmentHandlers = options.environmentHandlers || getDefaultEnvironmentHandlers();
        this.currentChatContact = null;
        this.callState = {
            inCall: false,
            localStream: null,
            peerConnection: null,
            remoteStream: null,
            callDirection: null, // 'outgoing' or 'incoming'
            currentCallContact: null
        };
        this.contactPollInterval = null;
        
        // Make names more unique to prevent collisions
        // Use a combination of username and a hash of the pubkey
        const pubkeyHash = this.pubkey.slice(-8); // Use last 8 chars of pubkey for uniqueness
        const contactListName = `contacts_for_user_${this.name}_${pubkeyHash}`;
        const inventoryName = `inventory_for_user_${this.name}_${pubkeyHash}`;
        const recipientName = `recipient_for_user_${this.name}_${pubkeyHash}`;
        
        this.environmentHandlers.log(`Initializing user-specific collections for: ${this.name} (${pubkeyHash})`);
        
        try {
            // Create shared and user-specific collections with verification
            this.unitel = {
                // Shared between all users
                users: this.ydoc.getMap('users')
            };
            
            // Create and verify each map separately for better error handling
            this.unitel.contacts = this.ydoc.getMap(contactListName);
            this.environmentHandlers.log(`Contact list map created: ${contactListName}, valid: ${!!this.unitel.contacts}`);
            
            this.unitel.inventory = this.ydoc.getMap(inventoryName);
            this.environmentHandlers.log(`Inventory map created: ${inventoryName}, valid: ${!!this.unitel.inventory}`);
            
            this.unitel.recipient = this.ydoc.getMap(recipientName);
            this.environmentHandlers.log(`Recipient inbox map created: ${recipientName}, valid: ${!!this.unitel.recipient}`);
            
            // Verify all maps are properly initialized
            const allMapsValid = 
                !!this.unitel.users && 
                !!this.unitel.contacts && 
                !!this.unitel.inventory && 
                !!this.unitel.recipient;
                
            if (!allMapsValid) {
                this.environmentHandlers.log(`ERROR: One or more Y.js maps failed to initialize properly!`);
                // We'll continue anyway and try to recover
            }
            
            // Log the collections for debugging
            this.environmentHandlers.log(`Contact list: ${contactListName} (size: ${this.unitel.contacts.size})`);
            this.environmentHandlers.log(`Inventory: ${inventoryName} (size: ${this.unitel.inventory.size})`);
            this.environmentHandlers.log(`Recipient inbox: ${recipientName} (size: ${this.unitel.recipient.size})`);
        } catch (error) {
            this.environmentHandlers.log(`Error initializing Y.js collections: ${error.message}`);
            throw new Error(`Failed to initialize collections: ${error.message}`);
        }

        // Store the provider
        this.provider = provider;
        
        // Set up awareness if available
        if (this.provider.awareness) {
            this.awareness = this.provider.awareness;
            this.awareness.setLocalState({
                user: {
                    name: this.name,
                    pubkey: this.pubkey,
                    online: true,
                    lastSeen: new Date().toISOString(),
                    status: 'online' // 'online', 'offline', 'idle'
                }
            });
        }

        // Initialize the system
        this._setupObservers();
        this._setupProviderEvents();
        this._setupCleanup();
        this._setupIdleDetection();
    }

    _setupObservers = () => {
        // Observe contacts list
        this.unitel.contacts.observe((event) => {
            event.changes.keys.forEach((change, key) => {
                if (change.action === 'add' || change.action === 'update') {
                    const data = this.unitel.contacts.get(key);
                    this.environmentHandlers.log(`Contact updated: ${key}`, data);
                    if (this.contactsViewer) {
                        this.contactsViewer(this.getContactsList.bind(this));
                    }
                } else if (change.action === 'delete') {
                    this.environmentHandlers.log(`Contact removed: ${key}`);
                    if (this.contactsViewer) {
                        this.contactsViewer(this.getContactsList.bind(this));
                    }
                }
            });
        });

        // Observe inventory
        this.unitel.inventory.observe((event) => {
            event.changes.keys.forEach((change, key) => {
                if (change.action === 'add' || change.action === 'update') {
                    const data = this.unitel.inventory.get(key);
                    this.environmentHandlers.log(`Inventory item updated: ${key}`, data);
                    if (this.inventoryViewer) {
                        this.inventoryViewer(this.getInventoryList.bind(this), data, key);
                    }
                }
            });
        });

        // Observe messages received
        this.unitel.recipient.observe((event) => {
            event.changes.keys.forEach((change, key) => {
                if (change.action === 'add' || change.action === 'update') {
                    const data = this.unitel.recipient.get(key);
                    this.environmentHandlers.log(`Message received: ${key}`, data);
                    this.processReceivedMessage(key, data).catch(err => {
                        this.environmentHandlers.log(`Error processing received message: ${err.message}`);
                    });
                }
            });
        });
    }

    _setupProviderEvents = () => {
        // Flag to track initialization state
        let initialized = false;
        
        if (typeof this.provider.on === 'function') {
            this.provider.on('synced', () => {
                // Prevent duplicate initialization
                if (initialized) return;
                initialized = true;
                
                this.environmentHandlers.log("Initializing...");
                this.initUserName().catch(err => {
                    this.environmentHandlers.log(`Error initializing user: ${err.message}`);
                });
                this._startContactPolling();
            });
        } else {
            this.environmentHandlers.log("Provider does not support events, initializing immediately...");
            this.initUserName().catch(err => {
                this.environmentHandlers.log(`Error initializing user: ${err.message}`);
            });
            this._startContactPolling();
        }
    }

    _setupCleanup = () => {
        const cleanup = () => {
            // Set user status to offline before disconnecting
            if (this.awareness) {
                this.awareness.setLocalState({
                    user: {
                        ...this.awareness.getLocalState().user,
                        online: false,
                        status: 'offline',
                        lastSeen: new Date().toISOString()
                    }
                });
            }
            
            // Clean up any ongoing calls
            this._endCallCleanup();
            
            // Clear contact polling interval
            if (this.contactPollInterval) {
                clearInterval(this.contactPollInterval);
                this.contactPollInterval = null;
            }
            
            // Destroy provider
            if (this.provider && typeof this.provider.destroy === 'function') {
                this.provider.destroy();
            }
        };

        this.environmentHandlers.registerCleanup(cleanup);
    }

    _setupIdleDetection = () => {
        // If in browser environment, set up idle detection
        if (typeof window !== 'undefined') {
            const idleTime = 300000; // 5 minutes
            let idleTimer;
            
            const resetIdleTimer = () => {
                clearTimeout(idleTimer);
                
                // Only update if currently idle or just connected
                if (this.awareness && 
                    this.awareness.getLocalState().user.status === 'idle' || 
                    this.awareness.getLocalState().user.status === 'offline') {
                    this.awareness.setLocalState({
                        user: {
                            ...this.awareness.getLocalState().user,
                            status: 'online',
                            lastSeen: new Date().toISOString()
                        }
                    });
                }
                
                idleTimer = setTimeout(() => {
                    if (this.awareness) {
                        this.awareness.setLocalState({
                            user: {
                                ...this.awareness.getLocalState().user,
                                status: 'idle',
                                lastSeen: new Date().toISOString()
                            }
                        });
                    }
                }, idleTime);
            };
            
            // Monitor user activity
            window.addEventListener('mousemove', resetIdleTimer);
            window.addEventListener('keypress', resetIdleTimer);
            window.addEventListener('click', resetIdleTimer);
            window.addEventListener('touchstart', resetIdleTimer);
            
            // Start the initial timer
            resetIdleTimer();
        }
    }

    _startContactPolling = () => {
        // Poll the status of contacts periodically
        this.contactPollInterval = setInterval(async () => {
            const contacts = this.getContactsList();
            
            // Update status of all contacts based on awareness states
            if (this.awareness) {
                const states = Array.from(this.awareness.getStates().entries());
                
                contacts.forEach(contact => {
                    // Find the contact's awareness state if they're online
                    const userState = states.find(([_, state]) => 
                        state.user && state.user.name === contact.username
                    );
                    
                    if (userState) {
                        const [_, state] = userState;
                        // Update contact status
                        this.unitel.contacts.set(contactKey(contact.username), {
                            ...contact,
                            status: state.user.status || 'offline',
                            lastSeen: state.user.lastSeen || new Date().toISOString()
                        });
                    } else {
                        // No awareness state found, contact is offline
                        if (contact.status !== 'offline') {
                            this.unitel.contacts.set(contactKey(contact.username), {
                                ...contact,
                                status: 'offline',
                                lastSeen: new Date().toISOString()
                            });
                        }
                    }
                });
                
                // Update contacts viewer
                if (this.contactsViewer) {
                    this.contactsViewer(this.getContactsList.bind(this));
                }
            }
        }, contact_status_interval);
    }

    async initUserName() {
        // Check for existing nametag in the inventory
        const nametagId = nametagKey(this.name);
        
        try {
            // Create nametag if it doesn't exist yet
            if (!this.unitel.inventory.has(nametagId)) {
                // Check if user mapping already exists (another instance may have created it)
                const existingUser = this.unitel.users.get('username_' + this.name);
                if (existingUser) {
                    this.environmentHandlers.log(`User ${this.name} already registered, skipping nametag creation`);
                    return;
                }
                
                // Add a small delay to prevent race conditions between instances
                await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
                
                // Check again after delay (in case another instance created it)
                if (this.unitel.inventory.has(nametagId) || 
                    this.unitel.users.get('username_' + this.name)) {
                    this.environmentHandlers.log(`User ${this.name} was registered during delay, skipping nametag creation`);
                    return;
                }
                
                const token_data = `{"dest_ref": "${this.pubkey}"}`;
                const nametag = await this.TXF.createNametag(this.name, token_data, this.secret, this.transport);

                // Store nametag in user's inventory
                this.unitel.inventory.set(nametagId, JSON.parse(this.TXF.exportFlow(nametag)));
                
                // Register user mapping
                this.unitel.users.set('username_' + this.name, { pubkey: this.pubkey });
                this.unitel.users.set('pubkey_' + this.pubkey, { username: this.name });
                
                this.environmentHandlers.log(`User ${this.name} initialized with nametag`);
            } else {
                this.environmentHandlers.log(`User ${this.name} already has a nametag`);
            }
        } catch (error) {
            // If error relates to duplicate requests, simply log it but don't propagate
            if (error.message.includes('already exists')) {
                this.environmentHandlers.log(`Nametag creation skipped: ${error.message}`);
            } else {
                // For other errors, propagate them
                throw error;
            }
        }
    }

    getContactsList = () => {
        const contacts = [];
        
        if (!this.unitel || !this.unitel.contacts) {
            this.environmentHandlers.log('Error: Contacts map not properly initialized');
            return contacts; // Return empty array rather than causing an error
        }
        
        // Log map size and key for debugging
        const mapSize = this.unitel.contacts.size;
        const contactsMapName = this.unitel.contacts._map ? this.unitel.contacts._map.name : 'unknown';
        this.environmentHandlers.log(`Retrieving contacts from map ${contactsMapName} (size: ${mapSize})`);
        
        try {
            // Get all contacts from the user-specific map
            this.unitel.contacts.forEach((contact, key) => {
                if (!contact || !contact.username) {
                    this.environmentHandlers.log(`Found invalid contact at key ${key}: ${JSON.stringify(contact)}`);
                    return; // Skip invalid entries
                }
                
                this.environmentHandlers.log(`Found contact: ${key} -> ${contact.username}`);
                
                // Ensure all required properties exist
                const validatedContact = {
                    username: contact.username,
                    status: contact.status || 'unknown',
                    added: contact.added || new Date().toISOString(),
                    lastSeen: contact.lastSeen || new Date().toISOString()
                };
                
                contacts.push(validatedContact);
            });
            
            this.environmentHandlers.log(`Retrieved ${contacts.length} contacts`);
            return contacts;
        } catch (error) {
            this.environmentHandlers.log(`Error retrieving contacts: ${error.message}`);
            return []; // Return empty array on error
        }
    }

    getInventoryList = async () => {
        const tokens = [];
        this.unitel.inventory.forEach((tokenFlow) => {
            const token = this.TXF.importFlow(JSON.stringify(tokenFlow));
            tokens.push(token);
        });

        return tokens;
    }

    // Chat methods
    getChat = async (contactUsername) => {
        if (!contactUsername) return [];
        
        // Get or create chat document
        const chatRoomName = getChatRoomName(this.name, contactUsername);
        const chatDoc = this.ydoc.getArray(chatRoomName);
        
        // Return array of messages
        return Array.from(chatDoc);
    }

    sendMessage = async (contactUsername, messageContent, messageType = 'text') => {
        if (!contactUsername) {
            throw new Error('Contact username is required');
        }
        
        if (!messageContent) {
            throw new Error('Message content is required');
        }

        // Get chat room
        const chatRoomName = getChatRoomName(this.name, contactUsername);
        const chatDoc = this.ydoc.getArray(chatRoomName);
        
        // Create message object
        const message = {
            id: generateMessageId(),
            sender: this.name,
            timestamp: new Date().toISOString(),
            content: messageContent,
            type: messageType // 'text', 'image', 'file', 'token', 'system'
        };
        
        // Add to chat document
        chatDoc.push([message]);
        
        // Notify the contact
        const recipientCollection = this.ydoc.getMap(`recipient_${contactUsername}`);
        recipientCollection.set(`message_${message.id}`, {
            chatRoom: chatRoomName,
            messageId: message.id
        });
        
        // If chat viewer is registered and current chat is with this contact, update UI
        if (this.chatViewer && this.currentChatContact === contactUsername) {
            this.chatViewer(this.getChat.bind(this, contactUsername));
        }
        
        return message;
    }

    sendToken = async (contactUsername, token) => {
        if (!contactUsername) {
            throw new Error('Contact username is required');
        }
        
        if (!token) {
            throw new Error('Token is required');
        }
        
        // Create a transaction to transfer the token
        const salt = this.TXF.generateRandom256BitHex();
        const dest_ref = 'nametag' + this.TXF.generateNametagTokenId(contactUsername);
        const tx = await this.TXF.createTx(token, dest_ref, salt, this.secret, this.transport);
        const tokenFlow = JSON.parse(this.TXF.exportFlow(token, tx));
        
        // Send token to recipient
        const recipientCollection = this.ydoc.getMap(`recipient_${contactUsername}`);
        const tokenId = token.tokenId;
        recipientCollection.set(`token_${tokenId}`, tokenFlow);
        
        // Remove from inventory
        this.unitel.inventory.delete(`token_${tokenId}`);
        
        // Add message to chat
        await this.sendMessage(contactUsername, {
            tokenId: tokenId,
            tokenClass: token.tokenClass,
            tokenValue: token.tokenValue,
            tokenName: token.tokenData?.name || 'Token'
        }, 'token');
        
        return tokenId;
    }

    sendFile = async (contactUsername, file, fileType, fileName) => {
        if (!contactUsername) {
            throw new Error('Contact username is required');
        }
        
        if (!file) {
            throw new Error('File is required');
        }
        
        // Convert file to base64 if needed
        let fileContent = file;
        if (typeof file !== 'string') {
            // Assume it's a File or Blob object
            fileContent = await this._fileToBase64(file);
        }
        
        // Determine message type based on file type
        const isImage = fileType?.startsWith('image/') || fileName?.match(/\.(jpeg|jpg|gif|png|webp)$/i);
        const messageType = isImage ? 'image' : 'file';
        
        // Create message content
        const messageContent = {
            data: fileContent,
            type: fileType || 'application/octet-stream',
            name: fileName || 'unnamed_file',
            size: fileContent.length // Estimate size for base64
        };
        
        // Send message
        return await this.sendMessage(contactUsername, messageContent, messageType);
    }

    _fileToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    processReceivedMessage = async (key, data) => {
        if (key.startsWith('message_')) {
            // It's a chat message notification
            const { chatRoom, messageId } = data;
            const chatDoc = this.ydoc.getArray(chatRoom);
            
            // Find the sender based on chat room name
            const roomParts = chatRoom.split('_');
            const sender = roomParts[1] === this.name ? roomParts[2] : roomParts[1];
            
            // If this is the current chat, update UI
            if (this.chatViewer && this.currentChatContact === sender) {
                this.chatViewer(this.getChat.bind(this, sender));
                
                // Add notification for call-related messages
                const messages = Array.from(chatDoc);
                const message = messages.find(m => m.id === messageId);
                if (message?.type === 'system' && message.content.startsWith('call_')) {
                    // Handle call notification
                    this._handleCallMessage(message.content, sender);
                }
            }
            
            // Delete the notification since we've processed it
            this.unitel.recipient.delete(key);
        } else if (key.startsWith('token_')) {
            // It's a token
            const tokenFlow = data;
            const token = this.TXF.importFlow(JSON.stringify(tokenFlow));
            
            // Add to inventory
            this.unitel.inventory.set(key, tokenFlow);
            
            // Delete from recipient collection
            this.unitel.recipient.delete(key);
        } else if (key.startsWith('call_')) {
            // It's a call signaling message
            const signalData = data;
            this._handleCallSignaling(key, signalData);
        }
    }

    // Contact management
    addContact = (username) => {
        this.environmentHandlers.log(`addContact called with username: "${username}"`);
        
        // Validate username
        if (!username) {
            this.environmentHandlers.log(`Username is empty or null`);
            throw new Error('Contact name is required');
        }
        
        // Ensure contacts map is properly initialized
        if (!this.unitel.contacts) {
            this.environmentHandlers.log(`Contacts map is not properly initialized`);
            throw new Error('Internal error: Contact list not initialized');
        }
        
        // Get contact ID and log current contacts map
        const contactId = contactKey(username);
        
        try {
            const contactsMapName = this.unitel.contacts._map ? this.unitel.contacts._map.name : 'unknown';
            this.environmentHandlers.log(`Adding contact ${username} with key ${contactId} to ${contactsMapName}`);
            this.environmentHandlers.log(`Current contacts map size: ${this.unitel.contacts.size}`);
            
            // Check if contact already exists
            if (this.unitel.contacts.has(contactId)) {
                this.environmentHandlers.log(`Contact ${username} already exists in user's contact list`);
                throw new Error(`Contact ${username} already exists`);
            }
            
            // Create contact object with all required fields
            const contactObj = {
                username,
                status: 'unknown', // Will be updated on next polling cycle
                added: new Date().toISOString(),
                lastSeen: new Date().toISOString() // Initialize with current time
            };
            
            // Add contact to Y.js map with defensive retry
            let retryCount = 0;
            let contactExists = false;
            
            // Try up to 3 times to ensure the contact is added
            while (!contactExists && retryCount < 3) {
                this.environmentHandlers.log(`Setting contact in Y.js map (attempt ${retryCount + 1})`);
                
                // Add the contact to the map
                this.unitel.contacts.set(contactId, contactObj);
                
                // Small delay to allow for Y.js synchronization
                // Use an immediate check instead of setTimeout to avoid async complexity
                contactExists = this.unitel.contacts.has(contactId);
                
                if (!contactExists) {
                    retryCount++;
                    this.environmentHandlers.log(`Contact not added, retrying... (attempt ${retryCount})`);
                    // Small delay before retry
                    const startTime = Date.now();
                    while (Date.now() - startTime < 100) { /* Busy wait */ }
                }
            }
            
            // Final verification
            contactExists = this.unitel.contacts.has(contactId);
            this.environmentHandlers.log(`Contact ${username} added successfully, verified: ${contactExists}`);
            this.environmentHandlers.log(`New contacts map size: ${this.unitel.contacts.size}`);
            
            if (!contactExists) {
                this.environmentHandlers.log(`Failed to add contact after ${retryCount} attempts`);
                throw new Error(`Failed to add contact after multiple attempts`);
            }
            
            // Force update of UI
            if (this.contactsViewer) {
                this.environmentHandlers.log(`Updating contacts UI after adding ${username}`);
                this.contactsViewer(this.getContactsList.bind(this));
            }
            
            return true;
        } catch (error) {
            // Log error details
            this.environmentHandlers.log(`Error adding contact: ${error.message}`);
            
            // Re-throw the error
            throw error;
        }
    }

    removeContact = (username) => {
        if (!username) {
            throw new Error('Username is required');
        }
        
        const contactId = contactKey(username);
        this.environmentHandlers.log(`Removing contact ${username} with key ${contactId} from contacts_${this.pubkey}`);
        
        // Remove contact
        this.unitel.contacts.delete(contactId);
        
        this.environmentHandlers.log(`Contact ${username} removed successfully`);
        
        // Force update of UI
        if (this.contactsViewer) {
            this.contactsViewer(this.getContactsList.bind(this));
        }
        
        return true;
    }

    setCurrentChatContact = (contactUsername) => {
        this.currentChatContact = contactUsername;
        
        // Update UI if chat viewer is registered
        if (this.chatViewer && contactUsername) {
            this.chatViewer(this.getChat.bind(this, contactUsername));
        }
    }

    // Video call methods
    async startCall(contactUsername) {
        if (this.callState.inCall) {
            throw new Error('Already in a call');
        }
        
        // Get contact status
        const contacts = this.getContactsList();
        const contact = contacts.find(c => c.username === contactUsername);
        
        if (!contact) {
            throw new Error(`Contact ${contactUsername} not found`);
        }
        
        if (contact.status !== 'online') {
            throw new Error(`Contact ${contactUsername} is not online`);
        }
        
        // Initialize call state
        this.callState.callDirection = 'outgoing';
        this.callState.currentCallContact = contactUsername;
        
        // Send a system message in the chat
        await this.sendMessage(contactUsername, 
            { type: 'call_outgoing', status: 'initiated' }, 
            'system'
        );
        
        // Send call signaling message
        const recipientCollection = this.ydoc.getMap(`recipient_${contactUsername}`);
        const callId = `call_${this.name}_${Date.now()}`;
        recipientCollection.set(callId, {
            type: 'call_offer',
            caller: this.name,
            timestamp: Date.now()
        });
        
        // Return call ID for reference
        return callId;
    }

    async answerCall(contactUsername, callId) {
        if (this.callState.inCall) {
            throw new Error('Already in a call');
        }
        
        // Set up call state
        this.callState.callDirection = 'incoming';
        this.callState.currentCallContact = contactUsername;
        
        // Send a system message in the chat
        await this.sendMessage(contactUsername, 
            { type: 'call_incoming', status: 'accepted' }, 
            'system'
        );
        
        // Send answer signaling message
        const recipientCollection = this.ydoc.getMap(`recipient_${contactUsername}`);
        recipientCollection.set(callId.replace('offer', 'answer'), {
            type: 'call_answer',
            callee: this.name,
            timestamp: Date.now()
        });
        
        return true;
    }

    async rejectCall(contactUsername, callId) {
        // Send a system message in the chat
        await this.sendMessage(contactUsername, 
            { type: 'call_incoming', status: 'rejected' }, 
            'system'
        );
        
        // Send reject signaling message
        const recipientCollection = this.ydoc.getMap(`recipient_${contactUsername}`);
        recipientCollection.set(callId.replace('offer', 'reject'), {
            type: 'call_reject',
            callee: this.name,
            timestamp: Date.now()
        });
        
        // Clear call state
        this._endCallCleanup();
        
        return true;
    }

    async endCall() {
        const contactUsername = this.callState.currentCallContact;
        
        if (!contactUsername) {
            throw new Error('No active call');
        }
        
        // Send a system message in the chat
        await this.sendMessage(contactUsername, 
            { 
                type: this.callState.callDirection === 'outgoing' ? 'call_outgoing' : 'call_incoming', 
                status: 'ended' 
            }, 
            'system'
        );
        
        // Send hangup signaling message
        const recipientCollection = this.ydoc.getMap(`recipient_${contactUsername}`);
        recipientCollection.set(`call_hangup_${this.name}_${Date.now()}`, {
            type: 'call_hangup',
            from: this.name,
            timestamp: Date.now()
        });
        
        // Clean up call state
        this._endCallCleanup();
        
        return true;
    }

    _endCallCleanup() {
        // Stop all tracks in the local stream
        if (this.callState.localStream) {
            this.callState.localStream.getTracks().forEach(track => track.stop());
        }
        
        // Close the peer connection
        if (this.callState.peerConnection) {
            this.callState.peerConnection.close();
        }
        
        // Reset call state
        this.callState = {
            inCall: false,
            localStream: null,
            peerConnection: null,
            remoteStream: null,
            callDirection: null,
            currentCallContact: null
        };
    }

    _handleCallMessage(content, sender) {
        const callInfo = content;
        
        if (callInfo.type === 'call_incoming' && callInfo.status === 'rejected') {
            // Call was rejected, clean up
            this._endCallCleanup();
            
            // If a call handler is registered, notify it
            if (this.callHandler) {
                this.callHandler('rejected', sender);
            }
        } else if (callInfo.type === 'call_incoming' && callInfo.status === 'ended' ||
                   callInfo.type === 'call_outgoing' && callInfo.status === 'ended') {
            // Call ended
            this._endCallCleanup();
            
            // If a call handler is registered, notify it
            if (this.callHandler) {
                this.callHandler('ended', sender);
            }
        }
    }

    _handleCallSignaling(key, data) {
        const { type } = data;
        
        if (type === 'call_offer') {
            const { caller, timestamp } = data;
            
            // If a call handler is registered, notify it
            if (this.callHandler) {
                this.callHandler('incoming', caller, key);
            }
        } else if (type === 'call_answer') {
            const { callee } = data;
            
            // If a call handler is registered, notify it
            if (this.callHandler) {
                this.callHandler('answered', callee);
            }
        } else if (type === 'call_reject') {
            const { callee } = data;
            
            // Clean up call state
            this._endCallCleanup();
            
            // If a call handler is registered, notify it
            if (this.callHandler) {
                this.callHandler('rejected', callee);
            }
        } else if (type === 'call_hangup') {
            const { from } = data;
            
            // Clean up call state
            this._endCallCleanup();
            
            // If a call handler is registered, notify it
            if (this.callHandler) {
                this.callHandler('ended', from);
            }
        } else if (type === 'ice_candidate') {
            // Handle ICE candidate for WebRTC
            const { candidate, from } = data;
            
            // If WebRTC is set up and we're in a call with this contact
            if (this.callState.peerConnection && this.callState.currentCallContact === from) {
                this.callState.peerConnection.addIceCandidate(candidate)
                    .catch(err => {
                        this.environmentHandlers.log(`Error adding ICE candidate: ${err.message}`);
                    });
            }
        } else if (type === 'sdp_offer') {
            // Handle SDP offer for WebRTC
            const { sdp, from } = data;
            
            // Process SDP offer (this would be handled by WebRTC logic)
            if (this.webrtcHandler) {
                this.webrtcHandler('offer', from, sdp);
            }
        } else if (type === 'sdp_answer') {
            // Handle SDP answer for WebRTC
            const { sdp, from } = data;
            
            // Process SDP answer (this would be handled by WebRTC logic)
            if (this.webrtcHandler) {
                this.webrtcHandler('answer', from, sdp);
            }
        }
        
        // Delete the signaling message once processed
        this.unitel.recipient.delete(key);
    }

    // Register UI handlers
    registerContactsViewer = (contactsViewer) => {
        this.contactsViewer = contactsViewer;
    }

    registerInventoryViewer = (inventoryViewer) => {
        this.inventoryViewer = inventoryViewer;
    }

    registerChatViewer = (chatViewer) => {
        this.chatViewer = chatViewer;
    }

    registerCallHandler = (callHandler) => {
        this.callHandler = callHandler;
    }

    registerWebRTCHandler = (webrtcHandler) => {
        this.webrtcHandler = webrtcHandler;
    }

    destroy() {
        // First clean up any intervals
        if (this.contactPollInterval) {
            clearInterval(this.contactPollInterval);
        }
        
        // Clean up call resources
        this._endCallCleanup();
        
        // Finally destroy provider and document
        if (this.provider && typeof this.provider.destroy === 'function') {
            this.provider.destroy();
        }
        
        if (this.ydoc && typeof this.ydoc.destroy === 'function') {
            this.ydoc.destroy();
        }
    }
}

// Helper functions
function contactKey(username) {
    return `contact_${username}`;
}

function nametagKey(name) {
    return `nametag_${name}`;
}

function getChatRoomName(user1, user2) {
    // Create a deterministic chat room name regardless of order
    const names = [user1, user2].sort();
    return `chat_${names[0]}_${names[1]}`;
}

function generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Environment-specific handlers
function getDefaultEnvironmentHandlers() {
    if (typeof window !== 'undefined') {
        return {
            log: console.log.bind(console),
            registerCleanup: (cleanup) => {
                window.addEventListener('beforeunload', cleanup);
            }
        };
    } else {
        return {
            log: console.log.bind(console),
            registerCleanup: (cleanup) => {
                process.on('SIGINT', cleanup);
                process.on('SIGTERM', cleanup);
                process.on('exit', cleanup);
                
                if (!process.env.NO_KEEP_ALIVE) {
                    setInterval(() => {}, 10000);
                }
            }
        };
    }
}

module.exports = { UnitelDB };