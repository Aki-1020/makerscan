/*
/
/   © 2023 Pandanite Developers 
/
/   Main schema file for Pandascan
/
*/

const mongoose = require('mongoose');

const Schema = mongoose.Schema;
const ObjectId = Schema.ObjectId;
const Mixed = Schema.Types.Mixed;

var allSchema = /** @class */ (function () 
{

    function allSchema() 
    {   

        ////////////////////////////
        //
        // account
        //
        
        this.accountSchema = Schema({
          publicKey: {
            type: String,
            default: ''
          },
          address: String,
          firstSeenAt: {
            type: Number
          },
          lastSeenAt: {
            type: Number
          },
          txcount: {
            type: Number,
            default: 0
          },
          balance: {
            type: Number,
            default: 0
          },
          label: {
            type: String,
            default: ''
          },
          createdAt: {
            type: Number,
            default: Date.now
          },
          updatedAt: {
            type: Number,
            default: Date.now
          }
        }, {
          timestamps: { currentTime: () => Math.floor(Date.now()) },
          collection: 'account'
        });
        
        this.accountSchema.index({ publicKey: 1 }, {background: true });
        this.accountSchema.index({ address: 1 }, {background: true });
        this.accountSchema.index({ balance: -1 }, {background: true });

        ////////////////////////////
        //
        // block
        //

        this.blockSchema = Schema({
          blockId: Number,
          blockHash: String,
          nonce: String,
          difficulty: Number,
          timestamp: Number,
          merkleRoot: String,
          lastBlockHash: String,
          minedBy:
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Account"
          },
          transactionCount: Number,
          totalValue: Number,
          totalFees: Number,
          blockReward: Number,
          createdAt: Number,
          updatedAt: Number
        }, {
          timestamps: { currentTime: () => Math.floor(Date.now()) },
          collection: 'block'
        });

        this.blockSchema.index({ blockId: 1 }, {background: true });
        this.blockSchema.index({ blockHeight: 1 }, {background: true });
        this.blockSchema.index({ blockHash: 1 }, {background: true });
        this.blockSchema.index({ lastBlockHash: 1 }, {background: true });
        this.blockSchema.index({ minedBy: 1 }, {background: true });
        this.blockSchema.index({ totalValue: 1, blockId: -1 }, {background: true });

        ////////////////////////////
        //
        // peers
        //
        
        this.peerSchema = Schema({
          name: String,
          ipAddress: String,
          port: Number,
          version: String,
          currentBlock: Number,
          lastSeenAt: Number,
          createdAt: Number,
          updatedAt: Number
        }, {
          timestamps: { currentTime: () => Math.floor(Date.now()) },
          collection: 'peer'
        });

        this.peerSchema.index({ ipAddress: 1, port: 1 }, {background: true });
        this.peerSchema.index({ version: 1 }, {background: true });
        this.peerSchema.index({ lastSeenAt: -1 }, {background: true });

        
        ////////////////////////////
        //
        // transaction
        //

        this.transactionSchema = Schema({
          block: 
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Block"
          },
          fromAccount:
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Account"
          },
          toAccount: 
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Account"
          },
          timestamp: Number,
          amount: Number,
          fee: Number,
          isGenerate: Boolean,
          transactionId: String,
          signingKey: String,
          signature: String,
          createdAt: Number,
          updatedAt: Number
        }, {
          timestamps: { currentTime: () => Math.floor(Date.now()) },
          collection: 'transaction'
        });

        this.transactionSchema.index({ block: 1 }, {background: true });
        this.transactionSchema.index({ fromAccount: 1 }, {background: true });
        this.transactionSchema.index({ toAccount: 1 }, {background: true });
        this.transactionSchema.index({ transactionId: 1 }, {background: true });
        this.transactionSchema.index({ timestamp: -1, amount: -1 }, {background: true });
        this.transactionSchema.index({ block: 1, timestamp: -1, amount: -1 }, {background: true });
        this.transactionSchema.index({ fromAccount: 1, timestamp: -1, amount: -1 }, {background: true });
        this.transactionSchema.index({ toAccount: 1, timestamp: -1, amount: -1 }, {background: true });

    }
        
    return allSchema;

}());

exports.default = allSchema;