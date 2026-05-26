jest.mock('../models/User', () => ({
  findById: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findOneAndUpdate: jest.fn()
}));

jest.mock('../models/Transaction', () => ({
  create: jest.fn(payload => Promise.resolve({ _id: 'tx-test', ...payload }))
}));

const User = require('../models/User');
const Transaction = require('../models/Transaction');
const { WalletService } = require('../services/payment');

beforeEach(() => {
  User.findById.mockReset();
  User.findByIdAndUpdate.mockReset();
  User.findOneAndUpdate.mockReset();
  Transaction.create.mockClear();
});

test('wallet credit increments balance and creates a transaction', async () => {
  const wallet = new WalletService();
  await wallet.credit('user-1', 120, 'Top up', 'ref-1');
  expect(User.findByIdAndUpdate).toHaveBeenCalledWith('user-1', { $inc: { walletBalance: 120 } });
  expect(Transaction.create).toHaveBeenCalledWith(expect.objectContaining({ type: 'credit', amount: 120, status: 'completed' }));
});

test('wallet debit rejects insufficient balance', async () => {
  User.findOneAndUpdate.mockResolvedValue(null);
  const wallet = new WalletService();
  await expect(wallet.debit('user-1', 80)).rejects.toThrow('Insufficient wallet balance');
});

test('wallet debit atomically checks balance and decrements', async () => {
  User.findOneAndUpdate.mockResolvedValue({ _id: 'user-1', walletBalance: 20 });

  const wallet = new WalletService();
  await wallet.debit('user-1', 80, 'Freight debit', 'ref-2');

  expect(User.findOneAndUpdate).toHaveBeenCalledWith(
    { _id: 'user-1', walletBalance: { $gte: 80 } },
    { $inc: { walletBalance: -80 } },
    { new: true }
  );
  expect(Transaction.create).toHaveBeenCalledWith(expect.objectContaining({
    user: 'user-1',
    type: 'debit',
    amount: 80,
    status: 'completed'
  }));
});
