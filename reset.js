/*
/
/   © 2023 Pandanite Developers 
/
/   Resets database to empty for full rescan
/
*/

const mongoose      = require('mongoose');
const allSchema     = require("./modelDefinitions");
const fs            = require('fs');
const ini           = require('ini');

const schemas       = new allSchema.default();

const iniconfig = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))

// Models
const AccountModel = mongoose.model('Account', schemas.accountSchema);
const BlockModel = mongoose.model('Block', schemas.blockSchema);
const PeerModel = mongoose.model('Peer', schemas.peerSchema);
const TransactionModel = mongoose.model('Transaction', schemas.transactionSchema);

const mongooseOptions = {
            autoIndex: true,
            connectTimeoutMS: 15000,
            socketTimeoutMS: 60000,
            minPoolSize: 20,
            maxPoolSize: 200
        };

mongoose.set('strictQuery', true);

mongoose.connect(iniconfig.mongo_connection, mongooseOptions, async function() {

	await AccountModel.deleteMany({});

	console.log("Accounts deleted");

	await BlockModel.deleteMany({});

	console.log("Blocks deleted");

	await PeerModel.deleteMany({});

	console.log("Peers deleted");

	await TransactionModel.deleteMany({});

	console.log("Transactions deleted");

	console.log("Reset Completed");
	
	process.exit(0);

});
