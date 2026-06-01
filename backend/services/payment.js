const mongoose = require('mongoose');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');

function parsePositiveAmount(amount) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    const err = new Error('Amount must be greater than zero');
    err.status = 400;
    throw err;
  }
  return value;
}

class WalletService {
  async legacyStartingBalance(userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) return 0;
    if (!User.collection?.findOne) return 0;

    const user = await User.collection.findOne(
      { _id: new mongoose.Types.ObjectId(userId) },
      { projection: { walletBalance: 1 } }
    );

    return Number(user?.walletBalance || 0);
  }

  async ensureWallet(userId) {
    const startingBalance = await this.legacyStartingBalance(userId);
    return Wallet.findOneAndUpdate(
      { user: userId },
      {
        $setOnInsert: {
          user: userId,
          balance: startingBalance,
          currency: 'USD'
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }

  async getBalance(userId) {
    const wallet = await this.ensureWallet(userId);
    return wallet?.balance || 0;
  }

  async credit(userId, amount, description = 'Wallet credit', reference = 'manual') {
    const amountNum = parsePositiveAmount(amount);
    const wallet = await Wallet.findOneAndUpdate(
      { user: userId },
      {
        $inc: { balance: amountNum, version: 1 },
        $setOnInsert: { user: userId, currency: 'USD' }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const transaction = await Transaction.create({
      user: userId,
      type: 'credit',
      amount: amountNum,
      description,
      reference,
      status: 'completed',
      metadata: { walletBalance: wallet.balance }
    });

    await Wallet.updateOne({ _id: wallet._id }, { lastTransaction: transaction._id });
    return transaction;
  }

  async debit(userId, amount, description = 'Wallet debit', reference = 'manual') {
    const amountNum = parsePositiveAmount(amount);
    await this.ensureWallet(userId);

    const wallet = await Wallet.findOneAndUpdate(
      { user: userId, balance: { $gte: amountNum } },
      { $inc: { balance: -amountNum, version: 1 } },
      { new: true }
    );

    if (!wallet) {
      const err = new Error('Insufficient wallet balance');
      err.status = 400;
      throw err;
    }

    const transaction = await Transaction.create({
      user: userId,
      type: 'debit',
      amount: amountNum,
      description,
      reference,
      status: 'completed',
      metadata: { walletBalance: wallet.balance }
    });

    await Wallet.updateOne({ _id: wallet._id }, { lastTransaction: transaction._id });
    return transaction;
  }

  async withdraw(userId, amount, method = 'mpesa', payoutDetails = {}, description = 'Owner wallet withdrawal') {
    const amountNum = parsePositiveAmount(amount);
    await this.ensureWallet(userId);

    const wallet = await Wallet.findOneAndUpdate(
      { user: userId, balance: { $gte: amountNum } },
      { $inc: { balance: -amountNum, version: 1 } },
      { new: true }
    );

    if (!wallet) {
      const err = new Error('Insufficient wallet balance');
      err.status = 400;
      throw err;
    }

    const transaction = await Transaction.create({
      user: userId,
      type: 'withdrawal',
      method,
      amount: amountNum,
      description,
      reference: `wd-${Date.now()}`,
      status: 'pending',
      metadata: {
        payoutDetails,
        requestedAt: new Date().toISOString(),
        walletBalance: wallet.balance
      }
    });

    await Wallet.updateOne({ _id: wallet._id }, { lastTransaction: transaction._id });
    return transaction;
  }
}

module.exports = {
  wallet: new WalletService(),
  StripeService: class {},
  MpesaService: class {},
  MTNMoMoService: class {},
  WalletService
};
