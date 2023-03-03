/*
/
/   © 2023 Pandanite Developers 
/
/   Routes for Pandascan
/
*/

const express           = require('express');
var router              = express.Router();
const mongoose          = require('mongoose');
const AccountModel      = mongoose.model('Account');
const BlockModel        = mongoose.model('Block');
const PeerModel         = mongoose.model('Peer');
const TransactionModel  = mongoose.model('Transaction');
const Big               = require('big.js');
const got               = require('got')

/* GET home page. */
router.get('/', function(req, res, next) {

    if (req.query.locale)
    {
        req.session.locale = req.query.locale;
        req.session.save(); 
        return res.redirect('/');
    }

    res.render('index', { title: 'Pandascan', csrfToken: req.csrfToken(), sessionId: req.session.id, messages: req.flash(), locale: req.session.locale });
  
});

// all transactions page
router.get('/txs', function(req, res, next) {

    if (req.query.locale)
    {
        req.session.locale = req.query.locale;
        req.session.save(); 
        return res.redirect('/');
    }
    
    if (!isNaN(req.query.blockId) && parseInt(Number(req.query.blockId)) == req.query.blockId && !isNaN(parseInt(req.query.blockId, 10)))
    {
    
        res.render('txs', { title: 'Pandascan', blockId: req.query.blockId, csrfToken: req.csrfToken(), sessionId: req.session.id, messages: req.flash(), locale: req.session.locale });

    }   
    else
    {
    
        res.render('txs', { title: 'Pandascan', blockId: null, csrfToken: req.csrfToken(), sessionId: req.session.id, messages: req.flash(), locale: req.session.locale });
    
    }
  
});

// all blocks page
router.get('/blocks', function(req, res, next) {

    if (req.query.locale)
    {
        req.session.locale = req.query.locale;
        req.session.save(); 
        return res.redirect('/');
    }
    

    res.render('blocks', { title: 'Pandascan', csrfToken: req.csrfToken(), sessionId: req.session.id, messages: req.flash(), locale: req.session.locale });
  
});

// account page
router.get('/account/:id', async function(req, res, next) {

    const addCommas = (nStr) => {
        nStr += '';
        c = nStr.split(','); // Split the result on commas
        nStr = c.join('');  // Make it back to a string without the commas
        x = nStr.split('.');
        x1 = x[0];
        x2 = x.length > 1 ? '.' + x[1] : '';
        var rgx = /(\d+)(\d{3})/;
        while (rgx.test(x1)) {
            x1 = x1.replace(rgx, '$1' + ',' + '$2');
        }
        return x1 + x2;
    }

    if (req.query.locale)
    {
        req.session.locale = req.query.locale;
        req.session.save(); 
        return res.redirect('/');
    }
    
    let accountInfo = await AccountModel.findOne({address: req.params.id});

    if (accountInfo)
    {
    
        accountInfo.balanceFormatted = addCommas(Big(accountInfo.balance).div(10**4).toFixed(4));
        
        accountInfo.blocksMined = await BlockModel.count({minedBy: accountInfo._id});
        
        let usdMarketInfo = await got("https://xeggex.com/api/v2/market/getbysymbol/PDN_USDT").json();

        accountInfo.balanceValue = addCommas(Big(accountInfo.balance).div(10**4).times(usdMarketInfo.lastPrice).toFixed(4));
        
        if (accountInfo.label == '') accountInfo.label = "N/A";
    
        res.render('account', { title: 'Pandascan', accountId: accountInfo._id, accountInfo: accountInfo, csrfToken: req.csrfToken(), sessionId: req.session.id, messages: req.flash(), locale: req.session.locale });

    }
    else
    {
    
        res.render('404', { title: 'Pandascan', csrfToken: req.csrfToken(), sessionId: req.session.id, messages: req.flash(), locale: req.session.locale });

    }
    
});

// block page
router.get('/block/:id', async function(req, res, next) {

    if (req.query.locale)
    {
        req.session.locale = req.query.locale;
        req.session.save(); 
        return res.redirect('/');
    }
    
    let blockInfo;
    
    if (!isNaN(req.params.id) && parseInt(Number(req.params.id)) == req.params.id && !isNaN(parseInt(req.params.id, 10)))
    {
    
        let blockId = req.params.id;
    
        blockInfo = await BlockModel.findOne({blockId: blockId}).populate("minedBy");
        
    }
    else
    {

        let blockHash = req.params.id;
    
        blockInfo = await BlockModel.findOne({blockHash: blockHash}).populate("minedBy");
    
    }


    if (blockInfo)
    {
    
        let tipBlock = await BlockModel.find({}).sort({blockId: -1}).limit(1);
        
        if (tipBlock[0].blockId == blockInfo.blockId) blockInfo.isTip = true;
        else blockInfo.isTip = false;
    
        blockInfo.blockRewardFormatted = Big(blockInfo.blockReward).div(10**4).toFixed(4);
        blockInfo.totalValueFormatted = Big(blockInfo.totalValue).div(10**4).toFixed(4);
        blockInfo.totalFeesFormatted = Big(blockInfo.totalFees).div(10**4).toFixed(4);
    
        res.render('block', { title: 'Pandascan', blockInfo: blockInfo, csrfToken: req.csrfToken(), sessionId: req.session.id, messages: req.flash(), locale: req.session.locale });
  
    }
    else
    {
    
        res.render('404', { title: 'Pandascan', csrfToken: req.csrfToken(), sessionId: req.session.id, messages: req.flash(), locale: req.session.locale });

    }
    
});

// tx page
router.get('/tx/:id', async function(req, res, next) {

    if (req.query.locale)
    {
        req.session.locale = req.query.locale;
        req.session.save(); 
        return res.redirect('/');
    }

    const txInfo = await TransactionModel.findOne({transactionId: req.params.id}).populate("block").populate("fromAccount").populate("toAccount");

    if (txInfo)
    {
    
        const lastBlock = await BlockModel.find({}).sort({blockId: -1}).limit(1);
        
        txInfo.confirmations = lastBlock[0].blockId - txInfo.block.blockId;
        
        txInfo.feeFormatted = Big(txInfo.fee).div(10**4).toFixed(4);
        
        if (txInfo.isGenerate==true)
        {
        
            txInfo.valueFormatted = Big(txInfo.amount).plus(txInfo.block.totalFees).div(10**4).toFixed(4);
            txInfo.method = "Generate";
            
        }
        else
        {

            txInfo.valueFormatted = Big(txInfo.amount).div(10**4).toFixed(4);
            txInfo.method = "Transfer";
            
        }
        
        txInfo.fromAddress = txInfo.isGenerate==true?'New Coins':txInfo.fromAccount.address;
        txInfo.toAddress = txInfo.toAccount.address;
        
        if (txInfo.signingKey == '') txInfo.signingKey = "N/A";
        if (txInfo.signature == '') txInfo.signature = "N/A";

        res.render('tx', { title: 'Pandascan', txInfo: txInfo, csrfToken: req.csrfToken(), sessionId: req.session.id, messages: req.flash(), locale: req.session.locale });
  
    }
    else
    {
    
        res.render('404', { title: 'Pandascan', csrfToken: req.csrfToken(), sessionId: req.session.id, messages: req.flash(), locale: req.session.locale });
    
    }
  
  
});

// richlist page
router.get('/richlist', function(req, res, next) {

    if (req.query.locale)
    {
        req.session.locale = req.query.locale;
        req.session.save(); 
        return res.redirect('/');
    }
    

    res.render('richlist', { title: 'Pandascan', csrfToken: req.csrfToken(), sessionId: req.session.id, messages: req.flash(), locale: req.session.locale });
  
});

// peers page
router.get('/peers', function(req, res, next) {

    if (req.query.locale)
    {
        req.session.locale = req.query.locale;
        req.session.save(); 
        return res.redirect('/');
    }
    

    res.render('peers', { title: 'Pandascan', csrfToken: req.csrfToken(), sessionId: req.session.id, messages: req.flash(), locale: req.session.locale });
  
});

// 404 not found page
router.get('/404', function(req, res, next) {

    if (req.query.locale)
    {
        req.session.locale = req.query.locale;
        req.session.save(); 
        return res.redirect('/');
    }
    

    res.render('404', { title: 'Pandascan', csrfToken: req.csrfToken(), sessionId: req.session.id, messages: req.flash(), locale: req.session.locale });
  
});

module.exports = router;