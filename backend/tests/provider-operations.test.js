jest.mock('../models/User', () => ({ collection: { findOne: jest.fn() } }));
jest.mock('../models/Wallet', () => ({
  updateOne: jest.fn()
}));
jest.mock('../models/Transaction', () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn()
}));
jest.mock('../models/Booking', () => ({
  updateOne: jest.fn()
}));
jest.mock('../models/Idempotency', () => ({}));
jest.mock('../models/ProviderOperation', () => ({
  create: jest.fn(),
  findOne: jest.fn(),
  aggregate: jest.fn()
}));
jest.mock('../services/deliveryProof', () => ({
  assertDeliveryProofIntegrity: jest.fn()
}));

const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Booking = require('../models/Booking');
const ProviderOperation = require('../models/ProviderOperation');
const { ProviderOperationsService } = require('../services/payment');

function operation(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439031',
    type: 'refund',
    provider: 'stripe',
    sourceTransaction: '507f1f77bcf86cd799439011',
    amount: 100,
    status: 'processing',
    callbackPayloads: [],
    save: jest.fn().mockImplementation(function save() {
      return Promise.resolve(this);
    }),
    ...overrides
  };
}

function payment(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439011',
    user: '507f1f77bcf86cd799439012',
    booking: '507f1f77bcf86cd799439013',
    type: 'payment',
    method: 'stripe',
    provider: 'stripe',
    status: 'completed',
    amount: 100,
    currency: 'USD',
    reference: 'pi_source',
    metadata: {},
    ...overrides
  };
}

function withdrawal(overrides = {}) {
  return {
    _id: '507f1f77bcf86cd799439021',
    user: '507f1f77bcf86cd799439022',
    type: 'withdrawal',
    method: 'mtn',
    status: 'pending',
    amount: 75,
    currency: 'EUR',
    description: 'Carrier payout',
    metadata: { payoutDetails: { destination: '+256770000000' } },
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  Booking.updateOne.mockResolvedValue({ modifiedCount: 1 });
  Transaction.updateOne.mockResolvedValue({ modifiedCount: 1 });
  Wallet.updateOne.mockResolvedValue({ modifiedCount: 1 });
});

test('completed Stripe refunds finalize the operation, source payment, and booking', async () => {
  const source = payment();
  const record = operation();
  Transaction.findById.mockResolvedValue(source);
  ProviderOperation.aggregate.mockResolvedValueOnce([]).mockResolvedValueOnce([{ amount: 100 }]);
  ProviderOperation.create.mockResolvedValue(record);
  const stripe = {
    refund: jest.fn().mockResolvedValue({
      providerReference: 're_1',
      response: { id: 're_1', status: 'succeeded' },
      status: 'completed'
    })
  };

  const result = await new ProviderOperationsService({ stripe }).executeRefund(source._id, {
    amount: 100,
    reason: 'requested_by_customer',
    idempotencyKey: 'refund-key-123',
    requestedBy: 'admin-1'
  });

  expect(stripe.refund).toHaveBeenCalledWith(
    expect.objectContaining({
      paymentIntent: 'pi_source',
      amount: 100,
      idempotencyKey: 'refund-key-123'
    })
  );
  expect(result).toMatchObject({ status: 'completed', providerReference: 're_1' });
  expect(Transaction.updateOne).toHaveBeenCalledWith({ _id: source._id }, { $set: { status: 'refunded' } });
  expect(Booking.updateOne).toHaveBeenLastCalledWith({ _id: source.booking }, { $set: { paymentStatus: 'refunded' } });
});

test('asynchronous MTN payouts remain pending until a signed callback arrives', async () => {
  const source = withdrawal();
  const record = operation({
    type: 'payout',
    provider: 'mtn',
    sourceTransaction: source._id,
    amount: source.amount
  });
  Transaction.findById.mockResolvedValue(source);
  ProviderOperation.create.mockResolvedValue(record);
  const mtn = {
    transfer: jest.fn().mockResolvedValue({
      providerReference: 'mtn-transfer-1',
      response: {},
      status: 'pending'
    })
  };

  const result = await new ProviderOperationsService({ mtn }).executePayout(source._id, {
    idempotencyKey: 'payout-key-123',
    requestedBy: 'admin-1'
  });

  expect(mtn.transfer).toHaveBeenCalledWith(
    expect.objectContaining({
      amount: 75,
      phone: '+256770000000',
      externalId: source._id
    })
  );
  expect(result).toMatchObject({ status: 'pending', providerReference: 'mtn-transfer-1' });
  expect(Transaction.updateOne).not.toHaveBeenCalled();
});

test('provider submission failures restore the reserved wallet balance exactly once', async () => {
  const source = withdrawal();
  const record = operation({
    type: 'payout',
    provider: 'mtn',
    sourceTransaction: source._id,
    amount: source.amount
  });
  Transaction.findById.mockResolvedValue(source);
  Transaction.findOneAndUpdate.mockResolvedValue({ ...source, status: 'failed' });
  ProviderOperation.create.mockResolvedValue(record);
  const mtn = { transfer: jest.fn().mockRejectedValue(new Error('provider unavailable')) };

  await expect(
    new ProviderOperationsService({ mtn }).executePayout(source._id, {
      idempotencyKey: 'payout-key-456',
      requestedBy: 'admin-1'
    })
  ).rejects.toThrow('provider unavailable');

  expect(record.status).toBe('failed');
  expect(Transaction.findOneAndUpdate).toHaveBeenCalledWith(
    { _id: source._id, type: 'withdrawal', status: 'pending' },
    expect.objectContaining({ $set: expect.objectContaining({ status: 'failed' }) }),
    { new: true }
  );
  expect(Wallet.updateOne).toHaveBeenCalledWith(
    { user: source.user },
    {
      $inc: { balance: 75, version: 1 },
      $set: { lastTransaction: source._id }
    },
    {}
  );
});

test('successful mobile-money refund callbacks complete pending operations idempotently', async () => {
  const source = payment({ provider: 'mtn', method: 'mtn', reference: 'mtn:payment-1' });
  const record = operation({
    provider: 'mtn',
    sourceTransaction: source._id,
    providerReference: 'refund-1',
    status: 'pending'
  });
  ProviderOperation.findOne.mockResolvedValue(record);
  ProviderOperation.aggregate.mockResolvedValue([{ amount: 100 }]);
  Transaction.findById.mockResolvedValue(source);

  const result = await new ProviderOperationsService().reconcileCallback('mtn', 'refund-1', {
    status: 'SUCCESSFUL',
    financialTransactionId: 'financial-1'
  });

  expect(result).toMatchObject({ received: true, matched: true, duplicate: false, status: 'completed' });
  expect(record.callbackPayloads).toHaveLength(1);
  expect(Transaction.updateOne).toHaveBeenCalledWith({ _id: source._id }, { $set: { status: 'refunded' } });
  expect(Booking.updateOne).toHaveBeenCalledWith({ _id: source.booking }, { $set: { paymentStatus: 'refunded' } });
});

test('failed payout callbacks compensate funds and duplicate callbacks do not compensate twice', async () => {
  const source = withdrawal();
  const record = operation({
    type: 'payout',
    provider: 'mtn',
    sourceTransaction: source._id,
    providerReference: 'transfer-1',
    status: 'pending'
  });
  ProviderOperation.findOne.mockResolvedValue(record);
  Transaction.findById.mockResolvedValue(source);
  Transaction.findOneAndUpdate.mockResolvedValueOnce({ ...source, status: 'failed' }).mockResolvedValueOnce(null);

  const service = new ProviderOperationsService();
  await service.reconcileCallback('mtn', 'transfer-1', { status: 'FAILED', reason: 'PAYEE_NOT_FOUND' });
  record.status = 'pending';
  await service.reconcileCallback('mtn', 'transfer-1', { status: 'FAILED', reason: 'duplicate' });

  expect(Wallet.updateOne).toHaveBeenCalledTimes(1);
  expect(record.lastError).toBe('duplicate');
});

test('operation idempotency returns the original record for a matching retry', async () => {
  const existing = operation({ idempotencyKey: 'refund-key-existing' });
  ProviderOperation.create.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }));
  ProviderOperation.findOne.mockResolvedValue(existing);

  const result = await new ProviderOperationsService().reserveOperation({
    type: 'refund',
    sourceTransaction: existing.sourceTransaction,
    idempotencyKey: existing.idempotencyKey
  });

  expect(result).toEqual({ operation: existing, created: false });
});

test('matching operation retries do not submit a second external payout', async () => {
  const source = withdrawal();
  const existing = operation({
    type: 'payout',
    provider: 'mtn',
    sourceTransaction: source._id,
    status: 'processing',
    idempotencyKey: 'payout-key-existing'
  });
  Transaction.findById.mockResolvedValue(source);
  ProviderOperation.create.mockRejectedValue(Object.assign(new Error('duplicate'), { code: 11000 }));
  ProviderOperation.findOne.mockResolvedValue(existing);
  const mtn = { transfer: jest.fn() };

  const result = await new ProviderOperationsService({ mtn }).executePayout(source._id, {
    idempotencyKey: 'payout-key-existing',
    requestedBy: 'admin-1'
  });

  expect(result).toBe(existing);
  expect(mtn.transfer).not.toHaveBeenCalled();
});
