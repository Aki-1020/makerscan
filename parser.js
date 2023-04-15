/*
/
/   © 2023 Pandanite Developers 
/
/   Block parser for Pandanite
/
*/

const Big           = require("big.js");
const mongoose      = require('mongoose');
const sleep         = require('sleep-promise');
const allSchema     = require("./modelDefinitions");
const got           = require("got");  // Version 11
const fs            = require('fs');
const ini           = require('ini');
const Redis         = require("ioredis");

const schemas       = new allSchema.default();

const iniconfig = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))

var rclient = new Redis(iniconfig.redis_port, iniconfig.redis_host);

// Models
const AccountModel = mongoose.model('Account', schemas.accountSchema);
const BlockModel = mongoose.model('Block', schemas.blockSchema);
const PeerModel = mongoose.model('Peer', schemas.peerSchema);
const TransactionModel = mongoose.model('Transaction', schemas.transactionSchema);

var startTime = Date.now();

var pdnNode = iniconfig.pandanite_node;

var isDownloading = false;
var lastWorkTime = Date.now();
var shuttingdown = false;

var knownAccounts = {
	"00787200CD9DD289463459E2030957D75203115EDF26902D9E": "XeggeX",
	"00BA78D020098E1CBBED9607ADAA3FD590EAD047848A6CD3E0": "Development Fund",
	"00B24407B0E9165733AD8C21C3A4E352593FE897889D89DADA": "TradeOgre",
	"00E58C2296947E3AABAE4E9F11F091AC6CE1DDE296C7CCC7EF": "Exbitron",
};

// On Shutdown - Do some Cleanup
process.on('SIGINT', function() {

    shuttingdown = true;
    
    return new Promise((resolve, reject) => {
    
        var shutdowncheck = setInterval(function() {

            console.log('Checking if shutdown is safe... isDownloading: ' + isDownloading.toString());
            if (isDownloading === false)
            {
                process.exit(0);
            }
  
        }, 1000);

    });
    
});

var initialScan = false;

if (process.argv.length > 2 && parseInt(process.argv[2]) == 1) 
{
	initialScan = true;
}

const mongooseOptions = {
            autoIndex: true,
            connectTimeoutMS: 15000,
            socketTimeoutMS: 60000,
            minPoolSize: 20,
            maxPoolSize: 200
        };

mongoose.set('strictQuery', true);

mongoose.connect(iniconfig.mongo_connection, mongooseOptions, async function() {

    downloadBlocks();
    
    setInterval(function() {
    
        if (isDownloading === false && shuttingdown === false)
        {
            downloadBlocks();
        }
    
    
    }, 30000);



});



async function downloadBlocks()
{

    isDownloading = true;

    const lastBlock = await BlockModel.find({}).sort({blockHeight: -1}).limit(1);

    let height = 1;

    if (lastBlock.length > 0)
    {
        height = parseInt(lastBlock[0].blockId) + 1;
    }

	try {
	
		const blockCount = await got(pdnNode + "/block_count").json();
	
		let counter = 0;
	
		while (height <= blockCount && counter < 25000)
		{

			lastWorkTime = Date.now();
	
			const blockInfo = await got(pdnNode + "/block?blockId=" + height).json();
		
			height++;
		
			console.log("Block: " + blockInfo.id);
		
			const newBlock = {
			  blockId: parseInt(blockInfo.id),
			  blockHash: blockInfo.hash,
			  nonce: blockInfo.nonce,
			  difficulty: blockInfo.difficulty,
			  timestamp: parseInt(blockInfo.timestamp),
			  merkleRoot: blockInfo.merkleRoot,
			  lastBlockHash: blockInfo.lastBlockHash,
			  transactionCount: blockInfo.transactions.length,
			  createdAt: Date.now(),
			  updatedAt: Date.now()
			};
		
			const newBlockRecord = await BlockModel.create(newBlock);
		
			const transactions = blockInfo.transactions;
		
			let totalValue = 0;
			let totalFee = 0;
		
			for (let i = 0; i < transactions.length; i++)
			{
		
				const thisTrx = transactions[i];
			
				let fromAccount;
			
				if (thisTrx.from && thisTrx.from != "00000000000000000000000000000000000000000000000000" && thisTrx.from != "")
				{
			
					fromAccount = await AccountModel.findOne({ address: thisTrx.from });
				
					if (fromAccount)
					{

						const deductAmount = parseInt((thisTrx.amount + thisTrx.fee) * -1);
						
						if (knownAccounts[thisTrx.from])
						{

							await AccountModel.updateOne({ address: thisTrx.from }, {label: knownAccounts[thisTrx.from], publicKey: thisTrx.signingKey, lastSeenAt: parseInt(blockInfo.timestamp), updatedAt: Date.now(), $inc: {balance: deductAmount, txcount: 1}});

						}
						else
						{

							await AccountModel.updateOne({ address: thisTrx.from }, {publicKey: thisTrx.signingKey, lastSeenAt: parseInt(blockInfo.timestamp), updatedAt: Date.now(), $inc: {balance: deductAmount, txcount: 1}});
						
						}
						
					}
					else
					{
					
						if (knownAccounts[thisTrx.from])
						{

							fromAccount = await AccountModel.create({
								publicKey: thisTrx.signingKey,
								address: thisTrx.from,
								firstSeenAt: parseInt(blockInfo.timestamp),
								lastSeenAt: parseInt(blockInfo.timestamp),
								txcount: 1,
								balance: 0,
								label: knownAccounts[thisTrx.from],
								createdAt: Date.now(),
								updatedAt: Date.now()
							});

						}
						else
						{
				
							fromAccount = await AccountModel.create({
								publicKey: thisTrx.signingKey,
								address: thisTrx.from,
								firstSeenAt: parseInt(blockInfo.timestamp),
								lastSeenAt: parseInt(blockInfo.timestamp),
								txcount: 1,
								balance: 0,
								label: '',
								createdAt: Date.now(),
								updatedAt: Date.now()
							});
						
						}
				
					}
			
				}
			
				let toAccount = await AccountModel.findOne({ address: thisTrx.to });
			
				if (thisTrx.from == thisTrx.to)
				{
			
					await AccountModel.updateOne({ address: thisTrx.to }, {$inc: {balance: thisTrx.amount}});

				}
				else
				{

					if (toAccount)
					{

						if (knownAccounts[thisTrx.to])
						{

							await AccountModel.updateOne({ address: thisTrx.to }, {label: knownAccounts[thisTrx.to], lastSeenAt: parseInt(blockInfo.timestamp), updatedAt: Date.now(), $inc: {balance: thisTrx.amount, txcount: 1}});

						}
						else
						{
						
							await AccountModel.updateOne({ address: thisTrx.to }, {lastSeenAt: parseInt(blockInfo.timestamp), updatedAt: Date.now(), $inc: {balance: thisTrx.amount, txcount: 1}});
						
						}
						
					}
					else
					{
					
					
						if (knownAccounts[thisTrx.to])
						{
						
							toAccount = await AccountModel.create({
								publicKey: '',
								address: thisTrx.to,
								firstSeenAt: parseInt(blockInfo.timestamp),
								lastSeenAt: parseInt(blockInfo.timestamp),
								txcount: 1,
								balance: thisTrx.amount,
								label: knownAccounts[thisTrx.to],
								createdAt: Date.now(),
								updatedAt: Date.now()
							});
						
						}
						else
						{
				
							toAccount = await AccountModel.create({
								publicKey: '',
								address: thisTrx.to,
								firstSeenAt: parseInt(blockInfo.timestamp),
								lastSeenAt: parseInt(blockInfo.timestamp),
								txcount: 1,
								balance: thisTrx.amount,
								label: '',
								createdAt: Date.now(),
								updatedAt: Date.now()
							});
						
						}
				
					}
			
				}
			
				if (thisTrx.from == "")
				{

					await BlockModel.updateOne({blockId: blockInfo.id}, {minedBy: toAccount._id, blockReward: thisTrx.amount, updatedAt: Date.now()});
			
				}
			
				const newTx = {
				  block: newBlockRecord._id,
				  fromAccount: fromAccount?fromAccount._id:null,
				  toAccount: toAccount._id,
				  timestamp: parseInt(blockInfo.timestamp),
				  amount: thisTrx.amount,
				  fee: thisTrx.fee,
				  isGenerate: fromAccount?false:true,
				  transactionId: thisTrx.txid,
				  signingKey: thisTrx.signingKey,
				  signature: thisTrx.signature,
				  createdAt: Date.now(),
				  updatedAt: Date.now()
				};
			
				await TransactionModel.create(newTx);

				totalValue = totalValue + thisTrx.amount;
				totalFee = totalFee + thisTrx.fee;
			
				const message = {
					type: "transaction",
					method: "new",
					data: {
						transactionId: thisTrx.txid
					}
				};
		
				if (initialScan == false)
					await rclient.publish("pandascan:newTransaction", JSON.stringify(message));
			
			}

			await BlockModel.updateOne({blockId: blockInfo.id}, {totalValue: totalValue, totalFees: totalFee, updatedAt: Date.now()});

			counter++;

			const message = {
				type: "block",
				method: "new",
				data: {
					blockId: blockInfo.id
				}
			};
		
			if (initialScan == false)
				await rclient.publish("pandascan:newBlock", JSON.stringify(message));
		
		}
	
		if (counter > 0) // a block was processed
		{
	
			// Refresh Stats
		
			const message = {
				type: "stats",
				method: "update",
				data: {}
			};
			
			if (initialScan == false)
				await rclient.publish("pandascan:updateStats", JSON.stringify(message));
	
		}
	
		// Get Peer Info
	
		const peerList = await got(pdnNode + "/peers").json();
	
		let peerData = {};

		for (let i = 0; i < peerList.length; i++)
		{
	
			const thisPeer = peerList[i];
		
			try {
	
				const peerDetail = await got(thisPeer + "/name").json();
			
				peerData[thisPeer] = peerDetail;

				const peerStats = await got(thisPeer + "/stats").json();
			
				peerData[thisPeer]['currentBlock'] = peerStats.current_block;
			
			} catch (e) {
		
				console.log(e);
		
			}

		}
	
		const pKeys = Object.keys(peerData);
	
		for (let i = 0; i < pKeys.length; i++)
		{
	
			const { hostname, port } = new URL(pKeys[i]);
		
			const thisPeer = peerData[pKeys[i]];
	
			const havePeer = await PeerModel.findOne({ipAddress: hostname, port: port});
		
			if (havePeer)
			{
		
				await PeerModel.updateOne({ipAddress: hostname, port: port}, {$set: {name: thisPeer.name, version: thisPeer.networkName + ":" + thisPeer.version, currentBlock: thisPeer.currentBlock, lastSeenAt: Date.now(), updatedAt: Date.now()}});
		
			}
			else
			{
		
				const newPeer = {
				  name: thisPeer.name,
				  ipAddress: hostname,
				  port: port,
				  version: thisPeer.networkName + ":" + thisPeer.version,
				  currentBlock: thisPeer.currentBlock,
				  lastSeenAt: parseInt(Date.now()/1000),
				  createdAt: Date.now(),
				  updatedAt: Date.now()
				};
			
				await PeerModel.create(newPeer);
		
			}
	
	
		}
    
    } catch (e) {
    
    	console.log(e);
    
    }
    
    isDownloading = false;

}
