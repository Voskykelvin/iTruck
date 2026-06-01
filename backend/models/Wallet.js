const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  balance: { type: Number, default: 0, min: 0 },
  currency: { type: String, default: 'USD' },
  lastTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction' },
  version: { type: Number, default: 0 }
}, { timestamps: true, optimisticConcurrency: true });

walletSchema.index({ user: 1 }, { unique: true });
walletSchema.index({ balance: 1 });
walletSchema.index({ updatedAt: -1 });

module.exports = mongoose.model('Wallet', walletSchema);
