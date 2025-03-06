// Constants for token types and configuration
const signaling_urls = ['wss://signaling.yjs.dev',
        'wss://y-webrtc-signaling-eu.herokuapp.com'];
const market_item_token_type = 'uniroad_item';
const coin_token_type = 'unicity_test_coin';
const default_value = '10';

class UniroadDB {
    constructor(provider, ydoc, TXF, secret, name, options = {}) {
        this.ydoc = ydoc;
        this.TXF = TXF;
        this.transport = TXF.getHTTPTransport(TXF.defaultGateway());
        this.secret = secret;
        this.name = name;
        this.pubkey = TXF.generateRecipientPubkeyAddr(secret);
        this.tokenItemClass = TXF.validateOrConvert('token_class', market_item_token_type);
        this.tokenCoinClass = TXF.validateOrConvert('token_class', coin_token_type);
        this.environmentHandlers = options.environmentHandlers || getDefaultEnvironmentHandlers();
        
        // Create shared collections
        this.uniroad = {
            users: this.ydoc.getMap('users'),
            marketplace: this.ydoc.getMap('marketplace'),
            owned: this.ydoc.getMap(`owned_${this.pubkey}`),
            recipient: this.ydoc.getMap(`recipient_${this.name}`)
        };

        // Store the provider
        this.provider = provider;
        
        // Set up awareness if available
        if (this.provider.awareness) {
            this.awareness = this.provider.awareness;
            this.awareness.setLocalState({
                user: {
                    name: this.name,
                    pubkey: this.pubkey,
                    online: true
                }
            });
        }

        // Initialize the system
        this._setupObservers();
        this._setupProviderEvents();
        this._setupCleanup();
    }

    _setupObservers = () => {
        this.uniroad.marketplace.observe((event) => {
            let marketChanged = false;
            
            event.changes.keys.forEach((change, key) => {
                if (change.action === 'add' || change.action === 'update') {
                    const data = this.uniroad.marketplace.get(key);
                    this.environmentHandlers.log(`Market item updated: ${key}`, data);
                    marketChanged = true;
                } else if (change.action === 'delete') {
                    this.environmentHandlers.log(`Market item removed: ${key}`);
                    marketChanged = true;
                }
            });
            
            // Notify the market viewer of changes regardless of the action type
            if (marketChanged && this.marketViewer) {
                this.marketViewer(this.getMarketList.bind(this));
            }
        });

        this.uniroad.owned.observe((event) => {
            event.changes.keys.forEach((change, key) => {
                if (change.action === 'add' || change.action === 'update') {
                    const data = this.uniroad.owned.get(key);
                    this.environmentHandlers.log(`Inventory item updated: ${key}`, data);
                    if (this.inventoryViewer) {
                        this.inventoryViewer(this.getInventoryList.bind(this), data, key);
                    }
                }
            });
        });

        this.uniroad.recipient.observe((event) => {
            event.changes.keys.forEach((change, key) => {
                if (change.action === 'add' || change.action === 'update') {
                    const data = this.uniroad.recipient.get(key);
                    this.environmentHandlers.log(`Token received: ${key}`, data);
                    this.processReceivedToken(key, JSON.stringify(data)).catch(err => {
                        this.environmentHandlers.log(`Error processing received token: ${err.message}`);
                    });
                }
            });
        });
    }

    _setupProviderEvents = () => {
        if (typeof this.provider.on === 'function') {
            this.provider.on('synced', () => {
                this.environmentHandlers.log("Initializing...");
                this.initUserName().catch(err => {
                    this.environmentHandlers.log(`Error initializing user: ${err.message}`);
                });
            });
        } else {
            this.environmentHandlers.log("Provider does not support events, initializing immediately...");
            this.initUserName().catch(err => {
                this.environmentHandlers.log(`Error initializing user: ${err.message}`);
            });
        }
    }

    _setupCleanup = () => {
        const cleanup = () => {
            if (this.awareness) {
                this.awareness.setLocalState({
                    user: {
                        ...this.awareness.getLocalState().user,
                        online: false
                    }
                });
            }
            
            if (this.provider && typeof this.provider.destroy === 'function') {
                this.provider.destroy();
            }
        };

        this.environmentHandlers.registerCleanup(cleanup);
    }

    async initUserName() {
        if (!this.uniroad.owned.has(nametagName(this.name))) {
            const token_data = `{"dest_ref": "${this.pubkey}"}`;
            const nametag = await this.TXF.createNametag(this.name, token_data, this.secret, this.transport);

            // Ensure data is properly serialized
            this.uniroad.owned.set(nametagName(this.name), JSON.parse(this.TXF.exportFlow(nametag)));
            this.uniroad.users.set('username_' + this.name, { pubkey: this.pubkey });
            this.uniroad.users.set('pubkey_' + this.pubkey, { username: this.name });
        }
    }

    getMarketList = () => {
        const items = [];
        const marketplace = this.uniroad.marketplace;
        
        marketplace.forEach((tokenFlow) => {
            const token = this.TXF.importFlow(JSON.stringify(tokenFlow));
            if (token.tokenClass === this.tokenItemClass) {
                items.push(token.tokenData);
            }
        });
        
        return items;
    }

    getInventoryList = async () => {
        const coins = [];
        const items = [];
        const owned = this.uniroad.owned;
        
        owned.forEach((tokenFlow) => {
            const token = this.TXF.importFlow(JSON.stringify(tokenFlow));
            if (token.tokenClass === this.tokenCoinClass) {
                coins.push(token);
            } else if (token.tokenClass === this.tokenItemClass) {
                items.push(token);
            }
        });

        const balance = coins.reduce((sum, token) => sum + BigInt(token.tokenValue), BigInt(0));
        return { coins, items, balance };
    }

    registerMarketViewer = (marketViewer) => {
        this.marketViewer = marketViewer;
    }

    registerInventoryViewer = (inventoryViewer) => {
        this.inventoryViewer = inventoryViewer;
    }

    async addMarketItem(itemName, itemObj) {
        const tokenId = this.TXF.generateRandom256BitHex();
        const nonce = this.TXF.generateRandom256BitHex();
        const salt = this.TXF.generateRandom256BitHex();
        const marketTokenFlow = {
            token: await this.TXF.mint({
                token_id: tokenId,
                token_class_id: this.tokenItemClass,
                token_value: default_value,
                immutable_data: itemObj,
                sign_alg: 'secp256k1',
                hash_alg: 'sha256',
                secret: this.secret,
                nonce,
                mint_salt: salt,
                transport: this.transport
            })
        };

        this.uniroad.marketplace.set(marketItemName(itemName), JSON.parse(JSON.stringify(marketTokenFlow)));
	const pubkey = marketTokenFlow.token.state.challenge.pubkey;
	this.uniroad.users.set('pubkey_' + pubkey, { username: this.name });
    }

    async addCoin() {
        const tokenId = this.TXF.generateRandom256BitHex();
        const nonce = this.TXF.generateRandom256BitHex();
        const salt = this.TXF.generateRandom256BitHex();
        const coinToken = {
            token: await this.TXF.mint({
                token_id: tokenId,
                token_class_id: this.tokenCoinClass,
                token_value: default_value,
                sign_alg: 'secp256k1',
                hash_alg: 'sha256',
                secret: this.secret,
                nonce,
                mint_salt: salt,
                transport: this.transport
            })
        };

        this.uniroad.owned.set(coinName(tokenId), JSON.parse(JSON.stringify(coinToken)));
    }

/*    async purchase(itemname) {
        const item = this.uniroad.marketplace.get(marketItemName(itemname));
        if (!item)
            throw new Error("Item " + itemname + " not found");

        let foundCoin = null;
        const owned = this.uniroad.owned;
        owned.forEach((tokenFlow) => {
            const token = this.TXF.importFlow(JSON.stringify(tokenFlow));
            if (token.tokenClass === this.tokenCoinClass) {
                const status = await this.TXF.getTokenStatus(token, this.secret, this.transport);
                if (status?.owned && status?.unspent) {
                    foundCoin = token;
                }
            } 
        });

        if (!foundCoin)
            throw new Error("No coin found for the purchase");

        const salt = this.TXF.generateRandom256BitHex();
        const item_owner = await this.getItemOwnerName(item);
        
        // Check owner online status if awareness is available
        if (this.awareness) {
            const peers = Array.from(this.awareness.getStates().values());
            const ownerPeer = peers.find(peer => peer.user.name === item_owner);
            if (!ownerPeer?.user.online) {
                throw new Error("Item owner is currently offline");
            }
        }

        const dest_ref = 'nametag' + this.TXF.generateNamegtagTokenId(item_owner);
        const tx = await this.TXF.createTx(coin, dest_ref, salt, this.secret, this.transport, undefined, itemReference(itemname, this.pubkey));
        const newToken = JSON.parse(this.TXF.exportFlow(coin, tx));
        
        const recipientCollection = this.ydoc.getMap(`recipient_${item_owner}`);
        recipientCollection.set(coinName(newToken.token.tokenId), newToken);
        this.uniroad.owned.delete(coinName(newToken.token.tokenId));
    }*/

    async purchase(itemname) {
	const item = this.uniroad.marketplace.get(marketItemName(itemname));
        if (!item) {
	    throw new Error("Item " + itemname + " not found");
        }

	// Convert the owned map entries to array for async processing
        const ownedEntries = Array.from(this.uniroad.owned.entries());
	let foundCoin = null;

        // Iterate through the entries and check each token
	for (const [key, tokenFlow] of ownedEntries) {
    	    const token = this.TXF.importFlow(JSON.stringify(tokenFlow));
            if (token.tokenClass === this.tokenCoinClass) {
	        const status = await this.TXF.getTokenStatus(token, this.secret, this.transport);
    	        if (status?.owned && status?.unspent) {
        	    foundCoin = { key, token };
            	    break;
                }
	    }
        }

	if (!foundCoin) {
    	    throw new Error("No coin found for the purchase");
        }

	const salt = this.TXF.generateRandom256BitHex();
        const item_owner = await this.getItemOwnerName(item);

	// Check if the owner is online through awareness protocol
        if (this.awareness) {
	    const peers = Array.from(this.awareness.getStates().values());
    	    const ownerPeer = peers.find(peer => peer.user.name === item_owner);
            if (!ownerPeer?.user.online) {
	        throw new Error("Item owner is currently offline");
    	    }
        }

	const dest_ref = 'nametag' + this.TXF.generateNametagTokenId(item_owner);
        const tx = await this.TXF.createTx(foundCoin.token, dest_ref, salt, this.secret, this.transport, undefined, itemReference(itemname, this.pubkey));
	const newToken = JSON.parse(this.TXF.exportFlow(foundCoin.token, tx));

        const recipientCollection = this.ydoc.getMap(`recipient_${item_owner}`);
	recipientCollection.set(coinName(newToken.token.tokenId), newToken);
        this.uniroad.owned.delete(coinName(newToken.token.tokenId));
    }

    async processPurchase(tokenFlow) {
        const { item, back_ref } = this.TXF.extractMsg(tokenFlow);
        const { username } = this.uniroad.users.get('pubkey_' + back_ref);
        const sendername = username;
        const marketTokenFlow = this.uniroad.marketplace.get(marketItemName(item));
        const nametag = await this.getNametag();
        const coin = this.TXF.importFlow(tokenFlow, this.secret, undefined, undefined, { ['nametag_' + nametag.token.tokenId]: nametag });
        try {
            const marketToken = this.TXF.importFlow(JSON.stringify(marketTokenFlow));
            const tx = await this.TXF.createTx(marketToken, back_ref, this.TXF.generateRandom256BitHex(), this.secret, this.transport);
            const newMarketToken = JSON.parse(this.TXF.exportFlow(marketToken, tx));
            const senderRecipient = this.ydoc.getMap(`recipient_${sendername}`);
            senderRecipient.set(marketItemName(item), newMarketToken);
	    this.uniroad.owned.set(coinName(coin.tokenId), {token: coin});
            this.uniroad.marketplace.delete(marketItemName(item));
        } catch (e) {
            const tx = await this.TXF.createTx(coin, back_ref, this.TXF.generateRandom256BitHex(), this.secret, this.transport);
            const newCoin = JSON.parse(this.TXF.exportFlow(coin, tx));
            const senderRecipient = this.ydoc.getMap(`recipient_${sendername}`);
            senderRecipient.set(coinName(newCoin.token.tokenId), newCoin);
        }
    
        this.uniroad.recipient.delete(coinName(coin.tokenId));
    }

    async processReceivedToken(entryName, tokenFlow) {
        if (JSON.parse(tokenFlow)?.token?.tokenClass === this.tokenCoinClass && this.TXF.extractMsg(tokenFlow)) {
            await this.processPurchase(tokenFlow);
        } else {
            const nametag = await this.getNametag();
            const token = this.TXF.importFlow(tokenFlow, this.secret, undefined, undefined, { ['nametag_' + nametag.token.tokenId]: nametag });
            const importedTokenFlow = JSON.parse(this.TXF.exportFlow(token));
            this.uniroad.owned.set(entryName, importedTokenFlow);
            this.uniroad.recipient.delete(entryName);
        }
    }

    async listItem(itemname) {
        const marketTokenFlow = this.uniroad.owned.get(marketItemName(itemname));
        if (!marketTokenFlow)
            throw new Error("Item " + itemname + " not found");
	const marketToken = this.TXF.importFlow(JSON.stringify(marketTokenFlow));
	const status = await this.TXF.getTokenStatus(marketToken, this.secret, this.transport);
	console.log(status);
    	if (!status?.owned) {
    	    throw new Error("Item " + itemname + " not owned by " + this.name);
        }
    	if (!status?.unspent) {
    	    throw new Error("Item " + itemname + " not spendable by " + this.name);
        }
        
        this.uniroad.marketplace.set(marketItemName(itemname), marketTokenFlow);
	const pubkey = marketTokenFlow.token.state.challenge.pubkey;
	this.uniroad.users.set('pubkey_' + pubkey, { username: this.name });
        this.uniroad.owned.delete(marketItemName(itemname));
    }

    getNametag() {
        return this.uniroad.owned.get(nametagName(this.name));
    }

    async getItemOwnerName(itemTokenFlow) {
        const pubkey = itemTokenFlow.token.state.challenge.pubkey;
	const record = this.uniroad.users.get('pubkey_' + pubkey);
        const { username } = record;
        return username;
    }

    destroy() {
        if (this.provider && typeof this.provider.destroy === 'function') {
            this.provider.destroy();
        }
        
        if (this.ydoc && typeof this.ydoc.destroy === 'function') {
            this.ydoc.destroy();
        }
    }
}

// Helper functions
function marketItemName(itemName) {
    return "market_item_" + itemName;
}

function coinName(tokenId) {
    return "coin_" + tokenId;
}

function nametagName(name) {
    return "nametag_" + name;
}

function itemReference(itemname, back_ref) {
    return { item: itemname, back_ref };
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

module.exports = { UniroadDB };
