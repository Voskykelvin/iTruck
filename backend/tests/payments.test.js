jest.mock('../models/User', () => ({
  collection: {
    findOne: jest.fn()
  }
}));

jest.mock('../models/Wallet', () => ({
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn()
}));

jest.mock('../models/Transaction', () => ({
  create: jest.fn((payload) => Promise.resolve({ _id: 'tx-test', ...payload }))
}));

const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const { WalletService } = require('../services/payment');

beforeEach(() => {
  Wallet.findOneAndUpdate.mockReset();
  Wallet.updateOne.mockReset();
  Transaction.create.mockClear();
});

test('wallet credit increments wallet balance and creates a transaction', async () => {
  Wallet.findOneAndUpdate.mockResolvedValue({ _id: 'wallet-1', balance: 120 });

  const wallet = new WalletService();
  await wallet.credit('user-1', 120, 'Top up', 'ref-1');

  expect(Wallet.findOneAndUpdate).toHaveBeenCalledWith(
    { user: 'user-1' },
    {
      $inc: { balance: 120, version: 1 },
      $setOnInsert: { user: 'user-1', currency: 'USD' }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  expect(Transaction.create).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'credit', amount: 120, status: 'completed' })
  );
  expect(Wallet.updateOne).toHaveBeenCalledWith({ _id: 'wallet-1' }, { lastTransaction: 'tx-test' });
});

test('wallet debit rejects insufficient balance', async () => {
  Wallet.findOneAndUpdate.mockResolvedValueOnce({ _id: 'wallet-1', balance: 0 }).mockResolvedValueOnce(null);

  const wallet = new WalletService();
  await expect(wallet.debit('user-1', 80)).rejects.toThrow('Insufficient wallet balance');
});

test('wallet debit atomically checks balance and decrements', async () => {
  Wallet.findOneAndUpdate
    .mockResolvedValueOnce({ _id: 'wallet-1', balance: 100 })
    .mockResolvedValueOnce({ _id: 'wallet-1', balance: 20 });

  const wallet = new WalletService();
  await wallet.debit('user-1', 80, 'Freight debit', 'ref-2');

  expect(Wallet.findOneAndUpdate).toHaveBeenNthCalledWith(
    2,
    { user: 'user-1', balance: { $gte: 80 } },
    { $inc: { balance: -80, version: 1 } },
    { new: true }
  );
  expect(Transaction.create).toHaveBeenCalledWith(
    expect.objectContaining({
      user: 'user-1',
      type: 'debit',
      amount: 80,
      status: 'completed',
      metadata: { walletBalance: 20 }
    })
  );
});

test('wallet withdrawal atomically reserves funds and creates pending payout', async () => {
  Wallet.findOneAndUpdate
    .mockResolvedValueOnce({ _id: 'wallet-1', balance: 420 })
    .mockResolvedValueOnce({ _id: 'wallet-1', balance: 170 });

  const wallet = new WalletService();
  await wallet.withdraw('owner-1', 250, 'mpesa', { destination: '+254700000000' });

  expect(Wallet.findOneAndUpdate).toHaveBeenNthCalledWith(
    2,
    { user: 'owner-1', balance: { $gte: 250 } },
    { $inc: { balance: -250, version: 1 } },
    { new: true }
  );
  expect(Transaction.create).toHaveBeenCalledWith(
    expect.objectContaining({
      user: 'owner-1',
      type: 'withdrawal',
      method: 'mpesa',
      amount: 250,
      status: 'pending'
    })
  );
});
