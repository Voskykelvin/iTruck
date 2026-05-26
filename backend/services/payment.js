const User = require('../models/User');
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
  async getBalance(userId) {
    const user = await User.findById(userId);
    return user?.walletBalance || 0;
  }

  async credit(userId, amount, description = 'Wallet credit', reference = 'manual') {
    const amountNum = parsePositiveAmount(amount);
    await User.findByIdAndUpdate(userId, { $inc: { walletBalance: amountNum } });

    return Transaction.create({
      user: userId,
      type: 'credit',
      amount: amountNum,
      description,
      reference,
      status: 'completed'
    });
  }

  async debit(userId, amount, description = 'Wallet debit', reference = 'manual') {
    const amountNum = parsePositiveAmount(amount);
    const user = await User.findOneAndUpdate(
      { _id: userId, walletBalance: { $gte: amountNum } },
      { $inc: { walletBalance: -amountNum } },
      { new: true }
    );

    if (!user) {
      const err = new Error('Insufficient wallet balance');
      err.status = 400;
      throw err;
    }

    return Transaction.create({
      user: userId,
      type: 'debit',
      amount: amountNum,
      description,
      reference,
      status: 'completed'
    });
  }

  async withdraw(userId, amount, method = 'mpesa', payoutDetails = {}, description = 'Owner wallet withdrawal') {
    const amountNum = parsePositiveAmount(amount);
    const user = await User.findOneAndUpdate(
      { _id: userId, walletBalance: { $gte: amountNum } },
      { $inc: { walletBalance: -amountNum } },
      { new: true }
    );

    if (!user) {
      const err = new Error('Insufficient wallet balance');
      err.status = 400;
      throw err;
    }

    return Transaction.create({
      user: userId,
      type: 'withdrawal',
      method,
      amount: amountNum,
      description,
      reference: `wd-${Date.now()}`,
      status: 'pending',
      metadata: {
        payoutDetails,
        requestedAt: new Date().toISOString()
      }
    });
  }
}

module.exports = {
  wallet: new WalletService(),
  StripeService: class {},
  MpesaService: class {},
  MTNMoMoService: class {},
  WalletService
};
