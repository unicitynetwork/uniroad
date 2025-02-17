
const relay_urls = ["https://gateway-test1.unicity.network:443"];

const market_item_token_type = 'uniroad_item';
const coin_token_type='unicity_test_coin';
const default_value = '10';

class UniroadDB{

    constructor(Gun, TXF, secret, name){
	this.TXF = TXF;
	this.transport = TXF.getHTTPTransport(TXF.defaultGateway());
	this.secret = secret;
	this.name = name;
	this.pubkey = TXF.generateRecipientPubkeyAddr(secret);
	this.tokenItemClass = TXF.validateOrConvert('token_class', market_item_token_type);
	this.tokenCoinClass = TXF.validateOrConvert('token_class', coin_token_type);
	const gun = new Gun(relay_urls);
	this.uniroad = gun.get('uniroad');
	this.users = uniroad.get('users');
	this.marketplace = uniroad.get('marketplace');
	this.own_tokens = ownedCollection(uniroad, this.pubkey);
	this.received_tokens = recipientCollection(uniroad, name);

	this.marketplace.map().on((data, key) => {
	    console.log(`Market item updated: ${key}`, data);
	    this.marketViewer(this.getMarketList, data, key);
	});

	this.own_tokens.map().on((data, key) => {
	    console.log(`Inventory item updated: ${key}`, data);
	    this.inventoryViewer(this.getInventoryList, data, key);
	});

	this.received_tokens.map().on((data, key) => {
	    console.log(`Token received: ${key}`, data);
	    processReceivedToken(key, data);
	});

	setTimeout(() => {
	    console.log("Waiting for sync...");
	    initUserName();
	}, 5000);
	this.initUserName();
    }

    async addMarketItem(itemName, itemObj){
	const tokenId = this.TXF.generateRandom256BitHex();
	const nonce = this.TXF.generateRandom256BitHex();
        const salt = this.TXF.generateRandom256BitHex();
	const marketTokenFlow = {token: await this.TXF.mint({
	    token_id: tokenId, token_class_id: this.tokenItemClass, token_value: default_value, 
	    token_data: itemObj,
	    sign_alg: 'secp256k1', hash_alg: 'sha256', 
	    secret: this.secret, nonce, mint_salt: salt, transport: this.transport
        })};

	await setObject(this.marketplace, marketItemtName(itemName), marketTokenFlow);
    }

    async listItem(itemname){
	const marketTokenFlow = await getObject(this.own_tokens, marketItemName(itemname));
	if(!marketTokenFlow)
	    throw new Error("Item "+itemname+" not found");
	if(marketTokenFlow?.token?.state?.pubkey !== this.pubkey)
	    throw new Error("Item "+itemname+" not owned by "+this.name);
	await setObject(this.marketplace, marketItemtName(itemName), marketTokenFlow);
	await setObject(this.own_tokens, marketItemtName(itemName), null);
    }

    async addCoin(){
	const tokenId = this.TXF.generateRandom256BitHex();
	const nonce = this.TXF.generateRandom256BitHex();
        const salt = this.TXF.generateRandom256BitHex();
	const coinToken = {token: await this.TXF.mint({
	    token_id: tokenId, token_class_id: this.tokenCoinClass, token_value: default_value, 
	    sign_alg: 'secp256k1', hash_alg: 'sha256', 
	    secret: this.secret, nonce, mint_salt: salt, transport: this.transport
        })};

	await setObject(this.own_tokens, coinName(tokenId), coinToken);
    }

    async initUserName(){
	if(!(await objectExists(this.own_tokens, nametagName(this.name)))){
	    const token_data = `{"dest_ref": "${this.pubkey}"}`;
	    const nametag = await this.TXF.createNametag(this.name, token_data, this.secret, this.transport);
	    await setObject(this.own_tokens, nametagName(this.name), nametag);
	    await setObject(this.users, 'username_'+this.name, {pubkey: this.pubkey});
	    await setObject(this.users, 'pubkey_'+this.pubkey, {username: this.name});
	}
    }

    async purchase(itemname){
	const item = await getObject(this.marketplace, marketItemName(itemname));
	if(!item)
	    throw new Error("Item "+itemname+" not found");
	const coin = await searchObject(this.own_tokens, async (data) => {
	    if(data?.tokenClass == this.tokenCoinClass){
		const token = this.TXF.importFlow(JSON.stringify(data));
		const status = await this.TXF.getTokenStatus(token, this.secret, this.transport);
		if(status?.owned&&status?.unspent)
		    return true;
	    }
	    return false;
	});
	if(!coin)
	    throw new Error("No coin found for the purchase");
	const token = this.TXF.importFlow(JSON.stringify(coin));
	const salt = this.TXF.generateRandom256BitHex();
	const item_owner = await getItemOwnerName(this.users, item);
	const dest_ref = 'nametag'+this.TXF.generateNamegtagTokenId(item_owner);
	const tx = await this.TXF.createTx(token, dest_ref, salt, this.secret, this.transport, undefined, itemReference(itemname, this.pubkey));
	const newToken = JSON.parse(this.TXF.exportFlow(token, tx));
	await sentTo(this.uniroad, item_owner, coinName(newToken.token.tokenId), newToken);
	await setObject(this.own_tokens, coinName(newToken.token.tokenId), null);
    }

    async processPurchase(tokenFlow){
	const {item, back_ref} = this.TXF.extractMsg(tokenFlow);
	const { username } = await getObject(users, 'pubkey_'+pubkey);
	const sendername = username;
	const marketTokenFlow = await getObject(this.marketplace, marketItemName(item));
	const nametag = await getNameTag();
	const coin = this.TXF.importFlow(JSON.stringify(token), this.secret, undefined, undefined, ['nametag_'+nametag.token.tokenId]: nametag);
	try{
	    const marketToken = this.TXF.importFlow(JSON.stringify(marketTokenFlow));
	    const tx = await this.TXF.createTx(marketToken, back_ref, this.TXF.generateRandom256BitHex(), this.secret, this.transport);
	    const newMarketToken = JSON.parse(this.TXF.exportFlow(marketToken, tx));
	    await sentTo(this.uniroad, sendername, coinName(newToken.token.tokenId), newToken);
	    await setObject(this.marketplace, marketItemtName(item), null);
	}catch(e){
	    const tx = await this.TXF.createTx(coin, back_ref, this.TXF.generateRandom256BitHex(), this.secret, this.transport);
	    const newCoin = JSON.parse(this.TXF.exportFlow(coin, tx));
	    await sentTo(this.uniroad, sendername, coinName(newCoin.token.tokenId), newCoin);
	}
	await setObject(this.received_tokens, coinName(coin.tokenId), null);
    }

    async processReceivedToken(entryName, tokenFlow){
	if(tokenFlow?.token?.tokenClass == this.tokenCoinClass && this.TXF.extractMsg(tokenFlow)){
	    await processPurchase(tokenFlow);
	}else{
	    const token = this.TXF.importFlow(JSON.stringify(token), this.secret, undefined, undefined, ['nametag_'+nametag.token.tokenId]: nametag);
	    const importedTokenFlow = JSON.parse(this.TXF.exportFlow(token));
	    await setObject(this.own_tokens, entryName, importedTokenFlow);
	    await setObject(this.received_tokens, entryName, null);
	}
    }

    registerMarketViewer(marketViewer){
	this.marketViewer = marketViewer;
    }

    registerInventoryViewer(inventoryViewer){
	this.inventoryViewer = inventoryViewer;
    }

    getMarketList(){
	return iterateOverCollection(
	    this.marketplace,
	    (tokenFlow) => {
		const token = this.TXF.importFlow(JSON.stringify(tokenFlow));
		if(token.tokenClass === this.tokenItemClass)
		    return token.state.data;
		else
		    return undefined;
	    }
	);
    }

    async getInventoryList(){
	coins = await iterateOverCollection(
	    this.own_tokens,
	    (tokenFlow) => {
		const token = this.TXF.importFlow(JSON.stringify(tokenFlow));
		if(token.tokenClass === this.tokenCoinClass)
		    return token;
		else
		    return undefined;
	    }
	);
	items = await iterateOverCollection(
	    this.own_tokens,
	    (tokenFlow) => {
		const token = this.TXF.importFlow(JSON.stringify(tokenFlow));
		if(token.tokenClass === this.tokenItemClass)
		    return token;
		else
		    return undefined;
	    }
	);
	const balance = coins.reduce((sum, token) => sum + BigInt(token.tokenValue), BigInt(0));
	return {coins, items, balance };
    }

    getNametag(){
	retrun getObject(this.own_tokens, nametagName(this.name));
    }

}

function ownedCollection(uninet, pubkey){
    return uninet.get('owned_'+pubkey);
}

function recipientCollection(uninet, name){
    return uninet.get('recipient_'+name);
}

function marketItemtName(itemName){
    return "market_item_"+itemName;
}

function coinName(tokenId){
    return "coin_"+tokenId;
}

function nametagName(name){
    return "nametag_"+name;
}

function itemReference(itemname, back_ref){
    return {item: itemname, back_ref};
}

function objectExists(collection, name) {
    return new Promise(resolve => {
        collection.get(name).once(data => {
            resolve(data !== undefined && data !== null);
        });
    });
}

function getObject(collection, name) {
    return new Promise(resolve => {
        collection.get(name).once(data => {
            resolve(data || null); // Return object if exists, otherwise null
        });
    });
}

function setObject(collection, name, obj) {
    return collection.get(name).put(obj);
}

function searchObject(collection, selector){
    return new Promise(resolve => {
        collection.map().once((data, key) => {
            if (data && selector(data)) {
                resolve({ key, ...data }); // Return first matching object
            }
        });

        // If no match found, return null after 2 seconds
        setTimeout(() => resolve(null), 2000);
    });
}

function iterateOverCollection(collection, selector) {
    return new Promise(resolve => {
        let objectsArray = [];
        let pending = 0;
        let resolved = false;

        collection.map().once((data, key) => {
            if (data && data !== null) {
                pending++; // Track ongoing async operations

		const selected = selector(data);
		if(selected)
            	    objectsArray.push(selected);

                // Check if all async operations are done
                if (--pending === 0 && !resolved) {
                    resolved = true;
                    resolve(objectsArray);
                }
            }
        });

        // If no objects exist, resolve immediately
        setTimeout(() => {
            if (!resolved) resolve(objectsArray);
        }, 500);
    });
}

function sendTo(uninet, name, objname, token){
    const recipient = recipientCollection(uninet, name);
    return setObject(recipient, objname, token);
}

async function getItemOwnerName(users, itemTokenFlow){
    const pubkey = itemTokenFlow.token.state.challenge.pubkey;
    const { username } = await getObject(users, 'pubkey_'+pubkey);
    return username;
}
