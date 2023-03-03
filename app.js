/*
/
/   © 2023 Pandanite Developers 
/
/   Block explorer app for Pandanite
/
*/

const http              = require('http');
const https             = require('https');
const createError       = require('http-errors');
const express           = require('express');
const path              = require('path');
const cookieParser      = require('cookie-parser');
const logger            = require('morgan');
const request           = require('request');
const Session           = require('express-session')
const flash             = require('connect-flash');
const csrf              = require('csurf')
const fs                = require('fs');
const ini               = require('ini');
const sharedsession     = require('socket.io-express-session');
const Redis             = require('ioredis');
const lodash            = require('lodash');
const i18n              = require('i18n-2')
const crypto            = require('crypto')
const mongoose          = require('mongoose');
const allSchema         = require("./modelDefinitions");
const got               = require('got')
const Big               = require('big.js');
const NodeCache         = require( "node-cache" );

const myCache = new NodeCache( { stdTTL: 300, checkperiod: 120 } );

var iniconfig = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));

const redisStore = require('connect-redis')(Session);

var rclient = new Redis(iniconfig.redis_port, iniconfig.redis_host);
var rclient2 = rclient.duplicate();

const schemas       = new allSchema.default();

// Models
const AccountModel = mongoose.model('Account', schemas.accountSchema);
const BlockModel = mongoose.model('Block', schemas.blockSchema);
const PeerModel = mongoose.model('Peer', schemas.peerSchema);
const TransactionModel = mongoose.model('Transaction', schemas.transactionSchema);

var session = Session({
  secret: iniconfig.session_secret,
  name: '_pandanite',
  resave: true,
  saveUninitialized: true,
  cookie: { secure: true }, // set to false if not behind cloudflare or other ssl
  store: new redisStore({ client: rclient2 }),
});

var indexRouter = require('./routes/index');

var serverPort = iniconfig.server_port;

var app = express();
var server = http.createServer(app);

i18n.expressBind(app, {
    // setup some locales - other locales default to en silently
    locales: ['en', 'de'],
});

app.set('trust proxy', 1);
app.use(session);

var io = require('socket.io')(server);
io.use(sharedsession(session, { autoSave:true }));

server.listen(serverPort);

////
// Web Stuff

app.use(function(req, res, next) {
    req.i18n.setLocaleFromSessionVar();
    next();
});

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'twig');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(csrf());
app.use(flash());
app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {

  if (err.status != 404)
    console.log(err);

  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

const mongooseOptions = {
            autoIndex: true,
            connectTimeoutMS: 15000,
            socketTimeoutMS: 60000,
            minPoolSize: 20,
            maxPoolSize: 200
        };
        
mongoose.connect(iniconfig.mongo_connection, mongooseOptions, function() {

    // Subscriptions
    
    rclient.subscribe("pandascan:updateStats", "pandascan:newBlock", "pandascan:newTransaction", "pandascan:newAccount", (err, count) => {
      if (err) {
        console.error("Failed to subscribe: %s", err.message);
      } else {
        console.log(
          `Subscribed successfully! This client is currently subscribed to ${count} channels.`
        );
      }
    });
    
    rclient.on("message", (channel, message) => {
    
        (async () => {
    
          console.log(`Received ${message} from ${channel}`);
      
          let parsedMessage = JSON.parse(message);
      
          if (channel === "pandascan:updateStats" && parsedMessage.method == "update")
          {

                // stats
            
                let usdMarketInfo = await got("https://xeggex.com/api/v2/market/getbysymbol/PDN_USDT").json();
        
                let btcMarketInfo = await got("https://xeggex.com/api/v2/market/getbysymbol/PDN_BTC").json();

                let lastBlockInfo = await BlockModel.find({}).sort({blockId: -1}).limit(1);

                let pdnStats = await got(iniconfig.pandanite_node + "/stats").json();
        
                let hashRate = await got(iniconfig.pandanite_node + "/getnetworkhashrate").json();

                let circulation = await got(iniconfig.pandanite_node + "/supply").json();

                let nowTime = Date.now();
        
                let txhistorychart1 = [];
                let txhistorychart2 = [];

                for (let i = 0; i < 14; i++)
                {
        
                    const { start, end } = getStartAndEndOfDay(nowTime);

                    const txcount = await TransactionModel.count({timestamp: {$gte: parseInt(start/1000), $lt: parseInt(end/1000)}});

                    const dayOfMonth = getDayOfMonth(nowTime);
            
                    txhistorychart1.unshift(dayOfMonth);
            
                    txhistorychart2.unshift({meta: '#TX on ' + getDateOnly(nowTime), value: txcount});

                    nowTime = nowTime - 86400000;
        
                }
    
                let statsReply = {
                    pdnpriceusd: Big(usdMarketInfo.lastPrice).toFixed(5),
                    pdnpricebtc: Big(btcMarketInfo.lastPrice).toFixed(8),
                    pdnpricechange: usdMarketInfo.changePercent + "%",
                    marketcap: Big(usdMarketInfo.primaryAsset.usdValue).times(usdMarketInfo.primaryAsset.circulation).toFixed(0),
                    lastblock: lastBlockInfo[0].blockId,
                    lastblocktxs: lastBlockInfo[0].transactionCount,
                    difficulty: pdnStats.difficulty,
                    hashrate: hashRate,
                    circulation: circulation,
                    txhistorychart1: txhistorychart1,
                    txhistorychart2: txhistorychart2
                };
            
                myCache.set( "getstats", statsReply, 300 );
            
                // blocks
            
                let blockReply = [];
                
                let latestBlockInfo = await BlockModel.find({}).populate("minedBy").sort({blockId: -1}).limit(40);

                for (let i = 0; i < latestBlockInfo.length; i++)
                {
        
                    let thisBlock = latestBlockInfo[i];
            
                    let blockInfo = {
                        blockId: thisBlock.blockId,
                        timestamp: thisBlock.timestamp,
                        minedBy: thisBlock.minedBy?thisBlock.minedBy.address:'N/A',
                        transactionCount: thisBlock.transactionCount,
                        totalValue: Big(thisBlock.totalValue||0).div(10**4).toFixed()
                    };
        
                    blockReply.push(blockInfo);
        
                }

                myCache.set( "getlatestblocks", blockReply, 300 );
            
                // txs
                
                let txReply = [];
            
                let latestTxsInfo = await TransactionModel.find({}).populate("fromAccount").populate("toAccount").sort({timestamp: -1, amount: -1}).limit(40);

                for (let i = 0; i < latestTxsInfo.length; i++)
                {
        
                    let thisTx = latestTxsInfo[i];
            
                    let txInfo = {
                        transactionId: thisTx.transactionId,
                        fromAccount: thisTx.fromAccount?thisTx.fromAccount.address:'',
                        toAccount: thisTx.toAccount?thisTx.toAccount.address:'',
                        timestamp: thisTx.timestamp,
                        isGenerate: thisTx.isGenerate,
                        amount: Big(thisTx.amount).div(10**4).toFixed(),
            
                    };
        
                    txReply.push(txInfo);
        
                }

                myCache.set( "getlatesttxs", txReply, 300 );
                
                io.emit('updateStats', statsReply);
      
          }
      
          if (channel === "pandascan:newBlock" && parsedMessage.method == "new")
          {
      
            let thisBlock = await BlockModel.findOne({blockId: parsedMessage.data.blockId}).populate("minedBy");

            let blockInfo = {
                blockId: thisBlock.blockId,
                timestamp: thisBlock.timestamp,
                minedBy: thisBlock.minedBy?thisBlock.minedBy.address:'N/A',
                transactionCount: thisBlock.transactionCount,
                totalValue: Big(thisBlock.totalValue||0).div(10**4).toFixed()
            };
            
            io.emit('newBlock', blockInfo);
      
          }
      
          if (channel === "pandascan:newTransaction" && parsedMessage.method == "new")
          {

            let thisTx = await TransactionModel.findOne({transactionId: parsedMessage.data.transactionId}).populate("fromAccount").populate("toAccount");

            let txInfo = {
                transactionId: thisTx.transactionId,
                fromAccount: thisTx.fromAccount?thisTx.fromAccount.address:'',
                toAccount: thisTx.toAccount?thisTx.toAccount.address:'',
                timestamp: thisTx.timestamp,
                isGenerate: thisTx.isGenerate,
                amount: Big(thisTx.amount).div(10**4).toFixed(),
        
            };
                
            io.emit('newTransaction', txInfo);
      
          }
      
          if (channel === "pandascan:newAccount" && parsedMessage.method == "new")
          {

            let thisAccount = await AccountModel.findOne({address: parsedMessage.data.address});

            io.emit('newAccount', thisAccount);
      
          }
      
      
      
        })();
      
    });


});

////
// Socket IO Stuff

io.on('connection', function (socket) {
    
    var sessionId = socket.handshake.session.id;
    
    // Not using this yet, but here for future reference
    if (socket.handshake.session.user && socket.handshake.session.user.id != '')
    {
        // Logged In User
    

    }
    else
    {
        // Not logged


    }
        

    socket.on('getstats', async function(res) {

        let cachedVal = myCache.get( "getstats" );

        let statsReply = {};

        if ( cachedVal == undefined )
        {

            let usdMarketInfo = await got("https://xeggex.com/api/v2/market/getbysymbol/PDN_USDT").json();
        
            let btcMarketInfo = await got("https://xeggex.com/api/v2/market/getbysymbol/PDN_BTC").json();

            let lastBlockInfo = await BlockModel.find({}).sort({blockId: -1}).limit(1);

            let pdnStats = await got(iniconfig.pandanite_node + "/stats").json();
        
            let hashRate = await got(iniconfig.pandanite_node + "/getnetworkhashrate").json();

            let circulation = await got(iniconfig.pandanite_node + "/supply").json();

            let nowTime = Date.now();
        
            let txhistorychart1 = [];
            let txhistorychart2 = [];

            for (let i = 0; i < 14; i++)
            {
        
                const { start, end } = getStartAndEndOfDay(nowTime);

                const txcount = await TransactionModel.count({timestamp: {$gte: parseInt(start/1000), $lt: parseInt(end/1000)}});

                const dayOfMonth = getDayOfMonth(nowTime);
            
                txhistorychart1.unshift(dayOfMonth);
            
                txhistorychart2.unshift({meta: '#TX on ' + getDateOnly(nowTime), value: txcount});

                nowTime = nowTime - 86400000;
        
            }
    

            statsReply = {
                pdnpriceusd: usdMarketInfo.lastPrice,
                pdnpricebtc: btcMarketInfo.lastPrice,
                pdnpricechange: usdMarketInfo.changePercent + "%",
                marketcap: Big(usdMarketInfo.primaryAsset.usdValue).times(usdMarketInfo.primaryAsset.circulation).toFixed(0),
                lastblock: lastBlockInfo[0].blockId,
                lastblocktxs: lastBlockInfo[0].transactionCount,
                difficulty: pdnStats.difficulty,
                hashrate: hashRate,
                circulation: circulation,
                txhistorychart1: txhistorychart1,
                txhistorychart2: txhistorychart2
            };
            
            myCache.set( "getstats", statsReply, 300 );
        
        }
        else
        {
        
            statsReply = cachedVal;
        
        }
    
        return res(statsReply);
    
    });
    
    socket.on('getlatestblocks', async function(res) {

        let cachedVal = myCache.get( "getlatestblocks" );
        
        let blockReply = [];
        
        if ( cachedVal == undefined )
        {
        
            let latestBlockInfo = await BlockModel.find({}).populate("minedBy").sort({blockId: -1}).limit(40);

            for (let i = 0; i < latestBlockInfo.length; i++)
            {
        
                let thisBlock = latestBlockInfo[i];
            
                let blockInfo = {
                    blockId: thisBlock.blockId,
                    timestamp: thisBlock.timestamp,
                    minedBy: thisBlock.minedBy?thisBlock.minedBy.address:'N/A',
                    transactionCount: thisBlock.transactionCount,
                    totalValue: Big(thisBlock.totalValue||0).div(10**4).toFixed()
                };
        
                blockReply.push(blockInfo);
        
            }

            myCache.set( "getlatestblocks", blockReply, 300 );
        
        }
        else
        {
        
            blockReply = cachedVal;
        
        }
    
        return res(blockReply);
    
    });
    
    socket.on('getlatesttxs', async function(res) {

        let cachedVal = myCache.get( "getlatesttxs" );
        
        let txReply = [];
        
        if ( cachedVal == undefined )
        {
        
            let latestTxsInfo = await TransactionModel.find({}).populate("fromAccount").populate("toAccount").sort({timestamp: -1, amount: -1}).limit(40);

            for (let i = 0; i < latestTxsInfo.length; i++)
            {
        
                let thisTx = latestTxsInfo[i];
            
                let txInfo = {
                    transactionId: thisTx.transactionId,
                    fromAccount: thisTx.fromAccount?thisTx.fromAccount.address:'',
                    toAccount: thisTx.toAccount?thisTx.toAccount.address:'',
                    timestamp: thisTx.timestamp,
                    isGenerate: thisTx.isGenerate,
                    amount: Big(thisTx.amount).div(10**4).toFixed(),
            
                };
        
                txReply.push(txInfo);
        
            }

            myCache.set( "getlatesttxs", txReply, 300 );
        
        }
        else
        {
        
            txReply = cachedVal;
        
        }
        
        return res(txReply);
    
    });
    
    
    socket.on('getBlocks', async function(options, res) {

        var blockReply = [];
        
        const totalBlockCount = await BlockModel.count({totalValue: {$gt: 0}});
        
        const latestBlockInfo = await BlockModel.find({totalValue: {$gt: 0}}).populate("minedBy").sort({blockId: -1}).skip(options.offset).limit(options.limit);

        for (let i = 0; i < latestBlockInfo.length; i++)
        {
    
            let thisBlock = latestBlockInfo[i];
        
            let blockInfo = {
                blockId: thisBlock.blockId,
                timestamp: thisBlock.timestamp,
                minedBy: thisBlock.minedBy?thisBlock.minedBy.address:'N/A',
                transactionCount: thisBlock.transactionCount,
                totalValue: Big(thisBlock.totalValue||0).div(10**4).toFixed(4),
                totalFees: Big(thisBlock.totalFees||0).div(10**4).toFixed(4),
                blockReward: Big(thisBlock.blockReward||0).div(10**4).toFixed(4)
            };
    
            blockReply.push(blockInfo);
    
        }

        return res({results: blockReply, total: totalBlockCount});
    
    });

    socket.on('getRichlist', async function(options, res) {

        var richReply = [];
        
        const totalRichCount = await AccountModel.count({balance: {$gt:0}});
        
        const richInfo = await AccountModel.find({balance: {$gt:0}}).sort({balance: -1}).skip(options.offset).limit(options.limit);

        for (let i = 0; i < richInfo.length; i++)
        {
    
            let thisRich = richInfo[i];
                                
            let richData = {
                address: thisRich.address,
                balanceFormatted: Big(thisRich.balance).div(10**4).toFixed(),
                firstSeenAt: thisRich.firstSeenAt,
                lastSeenAt: thisRich.lastSeenAt,
                txcount: thisRich.txcount,
                label: thisRich.label
            };
    
            richReply.push(richData);
    
        }

        return res({results: richReply, total: totalRichCount});
    
    });

    socket.on('getPeerlist', async function(options, res) {
        
        const dayAgo = parseInt((Date.now() - (86400 * 1000))/1000);
        
        const totalPeerCount = await PeerModel.count({lastSeenAt: {$gt: dayAgo}});
        
        const peerReply = await PeerModel.find({lastSeenAt: {$gt: dayAgo}}).sort({lastSeenAt: -1}).skip(options.offset).limit(options.limit);

        return res({results: peerReply, total: totalPeerCount});
    
    });

    socket.on('doSearch', async function(searchval, res) {
    
        try {
        
            let blockResult = await BlockModel.findOne({blockId: searchval});
            
            if (blockResult)
                return res({result: true, redirect: "/block/" + blockResult.blockId});
    
        } catch (e) {
        
        
        }

        try {
        
            let blockResult2 = await BlockModel.findOne({blockHash: searchval});
            
            if (blockResult2)
                return res({result: true, redirect: "/block/" + blockResult2.blockId});
    
        } catch (e) {
        
        
        }

        try {
        
            let accountResult = await AccountModel.findOne({address: searchval});
            
            if (accountResult)
                return res({result: true, redirect: "/account/" + accountResult.address});
    
        } catch (e) {
        
        
        }
        
        try {
        
            let txResult = await TransactionModel.findOne({transactionId: searchval});
            
            if (txResult)
                return res({result: true, redirect: "/tx/" + txResult.transactionId});
    
        } catch (e) {
        
        
        }

        return res({result: false, redirect: "/404"});
    
    });
    
    socket.on('getTransactions', async function(options, res) {

        var txReply = [];
    
        if (options.blockId && options.blockId != '')
        {
        
            const blockInfo = await BlockModel.findOne({blockId: parseInt(options.blockId)});
        
            const totalTxCount = await TransactionModel.count({block: blockInfo._id});
        
            const latestTxInfo = await TransactionModel.find({block: blockInfo._id}).populate("block").populate("fromAccount").populate("toAccount").sort({timestamp: -1, amount: -1}).skip(options.offset).limit(options.limit);

            for (let i = 0; i < latestTxInfo.length; i++)
            {
    
                let thisTx = latestTxInfo[i];
                
                let amount = Big(thisTx.amount).div(10**4).toFixed(4);
                
                if (thisTx.isGenerate==true)
                {
                    amount = Big(thisTx.amount).plus(thisTx.block.totalFees).div(10**4).toFixed(4);
                }
        
                let txInfo = {
                    transactionId: thisTx.transactionId,
                    fromAccount: thisTx.fromAccount?thisTx.fromAccount.address:'',
                    toAccount: thisTx.toAccount?thisTx.toAccount.address:'',
                    timestamp: thisTx.timestamp,
                    isGenerate: thisTx.isGenerate,
                    method: thisTx.isGenerate==true?'Generate':'Transfer',
                    amount: amount,
                    fee: Big(thisTx.fee).div(10**4).toFixed(4),
                    blockId: thisTx.block.blockId,
                };
    
                txReply.push(txInfo);
    
            }

            return res({results: txReply, total: totalTxCount});
        
        }
        else if (options.accountId && options.accountId != '')
        {


            const totalTxCount = await TransactionModel.count({$or: [{fromAccount: mongoose.Types.ObjectId(options.accountId)}, {toAccount: mongoose.Types.ObjectId(options.accountId)}]});
        
            const latestTxInfo = await TransactionModel.find({$or: [{fromAccount: mongoose.Types.ObjectId(options.accountId)}, {toAccount: mongoose.Types.ObjectId(options.accountId)}]}).populate("block").populate("fromAccount").populate("toAccount").sort({timestamp: -1, amount: -1}).skip(options.offset).limit(options.limit);

            for (let i = 0; i < latestTxInfo.length; i++)
            {
    
                let thisTx = latestTxInfo[i];
                
                let amount = Big(thisTx.amount).div(10**4).toFixed(4);
                
                if (thisTx.isGenerate==true)
                {
                    amount = Big(thisTx.amount).plus(thisTx.block.totalFees).div(10**4).toFixed(4);
                }
        
                let txInfo = {
                    transactionId: thisTx.transactionId,
                    fromAccount: thisTx.fromAccount?thisTx.fromAccount.address:'',
                    toAccount: thisTx.toAccount?thisTx.toAccount.address:'',
                    timestamp: thisTx.timestamp,
                    isGenerate: thisTx.isGenerate,
                    method: thisTx.isGenerate==true?'Generate':'Transfer',
                    amount: amount,
                    fee: Big(thisTx.fee).div(10**4).toFixed(4),
                    blockId: thisTx.block.blockId,
                };
    
                txReply.push(txInfo);
    
            }

            return res({results: txReply, total: totalTxCount});
        
        }
        else
        {
        
            const totalTxCount = await TransactionModel.count({});
        
            const latestTxInfo = await TransactionModel.find({}).populate("block").populate("fromAccount").populate("toAccount").sort({timestamp: -1, amount: -1}).skip(options.offset).limit(options.limit);

            for (let i = 0; i < latestTxInfo.length; i++)
            {
    
                let thisTx = latestTxInfo[i];

                let amount = Big(thisTx.amount).div(10**4).toFixed(4);
                
                if (thisTx.isGenerate==true)
                {
                    amount = Big(thisTx.amount).plus(thisTx.block.totalFees).div(10**4).toFixed(4);
                }
                
                let txInfo = {
                    transactionId: thisTx.transactionId,
                    fromAccount: thisTx.fromAccount?thisTx.fromAccount.address:'',
                    toAccount: thisTx.toAccount?thisTx.toAccount.address:'',
                    timestamp: thisTx.timestamp,
                    isGenerate: thisTx.isGenerate,
                    method: thisTx.isGenerate==true?'Generate':'Transfer',
                    amount: amount,
                    fee: Big(thisTx.fee).div(10**4).toFixed(4),
                    blockId: thisTx.block.blockId,
                };
    
                txReply.push(txInfo);
    
            }
            
            return res({results: txReply, total: totalTxCount});
        
        }

        
    
    });
    
    
    
});

function getStartAndEndOfDay(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = date.getMonth();
    const day = date.getDate();

    const startOfDay = new Date(year, month, day).getTime();
    const endOfDay = new Date(year, month, day + 1).getTime() - 1;

    return {
        start: startOfDay,
        end: endOfDay
    };
}

function getDayOfMonth(timestamp) {
    const date = new Date(timestamp);
    return date.getDate();
}

function getDateOnly(timestamp) {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');

    return `${year}-${month}-${day}`;
}