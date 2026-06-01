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
  create: jest.fn((payload) => Promise.resolve({ _id: 'tx-test', ...payload })),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn()
}));

jest.mock('../models/Booking', () => ({
  findByIdAndUpdate: jest.fn()
}));

jest.mock('../models/Idempotency', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn()
}));

const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Booking = require('../models/Booking');
const Idempotency = require('../models/Idempotency');
const {
  checkIdempotency,
  generateIdempotencyKey,
  PaymentReconciliationService,
  runWithIdempotency,
  WalletService
} = require('../services/payment');

beforeEach(() => {
  Wallet.findOneAndUpdate.mockReset();
  Wallet.updateOne.mockReset();
  Transaction.create.mockClear();
  Transaction.findOne.mockReset();
  Transaction.findOneAndUpdate.mockReset();
  Booking.findByIdAndUpdate.mockReset();
  Idempotency.create.mockReset();
  Idempotency.findOne.mockReset();
  Idempotency.findOneAndUpdate.mockReset();
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

test('idempotency keys are deterministic and do not depend on wall-clock time', () => {
  const payload = { userId: 'user-1', bookingId: 'booking-1', amount: 1200, provider: 'mpesa' };

  expect(generateIdempotencyKey(payload)).toBe(
    generateIdempotencyKey({ provider: 'mpesa', amount: 1200, bookingId: 'booking-1', userId: 'user-1' })
  );
});

test('completed idempotency records return the previous result', async () => {
  Idempotency.create.mockRejectedValue({ code: 11000 });
  Idempotency.findOne.mockResolvedValue({
    key: 'pay-key-1',
    status: 'completed',
    result: { reference: 'tx-1' }
  });

  await expect(checkIdempotency('pay-key-1')).resolves.toEqual(
    expect.objectContaining({ exists: true, result: { reference: 'tx-1' } })
  );
});

test('processing idempotency records reject duplicate work', async () => {
  Idempotency.create.mockRejectedValue({ code: 11000 });
  Idempotency.findOne.mockResolvedValue({
    key: 'pay-key-2',
    status: 'processing'
  });

  await expect(checkIdempotency('pay-key-2')).rejects.toThrow('already being processed');
});

test('idempotency keys cannot be reused for a different request payload', async () => {
  Idempotency.create.mockRejectedValue({ code: 11000 });
  Idempotency.findOne.mockResolvedValue({
    key: 'pay-key-3',
    status: 'completed',
    requestHash: 'different-request-hash',
    result: { reference: 'tx-3' }
  });

  await expect(checkIdempotency('pay-key-3', { requestPayload: { amount: 200 } })).rejects.toThrow(
    'different request payload'
  );
});

test('runWithIdempotency marks successful operations complete', async () => {
  Idempotency.create.mockResolvedValue({ key: 'pay-key-4', status: 'processing' });
  Idempotency.findOneAndUpdate.mockResolvedValue({ key: 'pay-key-4', status: 'completed' });
  const operation = jest.fn(async () => ({ reference: 'tx-4' }));

  const result = await runWithIdempotency('pay-key-4', { amount: 400 }, operation);

  expect(result).toEqual({ reference: 'tx-4' });
  expect(operation).toHaveBeenCalledTimes(1);
  expect(Idempotency.findOneAndUpdate).toHaveBeenCalledWith(
    { key: 'pay-key-4' },
    expect.objectContaining({
      $set: expect.objectContaining({
        status: 'completed',
        result: { reference: 'tx-4' }
      })
    }),
    { new: true }
  );
});

test('stripe reconciliation idempotently records completed escrow payments', async () => {
  const bookingId = '507f1f77bcf86cd799439011';
  const userId = '507f1f77bcf86cd799439012';
  Transaction.findOneAndUpdate.mockResolvedValue({
    _id: 'tx-stripe',
    providerEventId: 'evt_1',
    status: 'completed'
  });
  Booking.findByIdAndUpdate.mockResolvedValue({ _id: bookingId, paymentStatus: 'escrowed' });

  const service = new PaymentReconciliationService();
  const result = await service.reconcileStripeEvent({
    id: 'evt_1',
    type: 'payment_intent.succeeded',
    livemode: true,
    data: {
      object: {
        id: 'pi_1',
        amount_received: 126000,
        currency: 'usd',
        metadata: { bookingId, userId }
      }
    }
  });

  expect(result._id).toBe('tx-stripe');
  expect(Transaction.findOneAndUpdate).toHaveBeenCalledWith(
    { provider: 'stripe', providerEventId: 'evt_1' },
    expect.objectContaining({
      $setOnInsert: expect.objectContaining({
        booking: bookingId,
        user: userId,
        amount: 1260,
        method: 'stripe'
      })
    }),
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  expect(Booking.findByIdAndUpdate).toHaveBeenCalledWith(
    bookingId,
    {
      $set: expect.objectContaining({
        paymentStatus: 'escrowed',
        paymentReference: 'pi_1',
        paymentAmount: 1260
      })
    },
    { new: true }
  );
});
