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
  find: jest.fn(),
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn()
}));

jest.mock('../models/Booking', () => ({
  findById: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
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
  MobileMoneyPaymentService,
  PaymentReconciliationService,
  runWithIdempotency,
  WalletService
} = require('../services/payment');

beforeEach(() => {
  Wallet.findOneAndUpdate.mockReset();
  Wallet.updateOne.mockReset();
  Transaction.create.mockClear();
  Transaction.find.mockReset();
  Transaction.findOne.mockReset();
  Transaction.findOneAndUpdate.mockReset();
  Booking.findById.mockReset();
  Booking.findOneAndUpdate.mockReset();
  Booking.updateOne.mockReset();
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

test('wallet transaction history is scoped to the current user', async () => {
  const limit = jest.fn().mockResolvedValue([{ _id: 'tx-1' }]);
  const sort = jest.fn(() => ({ limit }));
  Transaction.find.mockReturnValue({ sort });

  const wallet = new WalletService();
  const transactions = await wallet.listTransactions('user-1', { limit: 8 });

  expect(transactions).toEqual([{ _id: 'tx-1' }]);
  expect(Transaction.find).toHaveBeenCalledWith({ user: 'user-1' });
  expect(sort).toHaveBeenCalledWith('-createdAt');
  expect(limit).toHaveBeenCalledWith(8);
});

test('wallet escrow funding debits the shipper and marks booking payment escrowed', async () => {
  const booking = {
    _id: 'booking-1',
    client: 'client-1',
    owner: 'owner-1',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    bids: [{ status: 'accepted', amount: 1260 }]
  };
  const reserved = {
    ...booking,
    paymentStatus: 'pending',
    save: jest.fn()
  };

  Booking.findById.mockResolvedValue(booking);
  Booking.findOneAndUpdate.mockResolvedValue(reserved);
  Wallet.findOneAndUpdate
    .mockResolvedValueOnce({ _id: 'wallet-1', balance: 2000 })
    .mockResolvedValueOnce({ _id: 'wallet-1', balance: 740 });

  const wallet = new WalletService();
  const result = await wallet.fundBookingEscrow('booking-1', 'client-1');

  expect(Booking.findOneAndUpdate).toHaveBeenCalledWith(
    {
      _id: 'booking-1',
      $or: [{ paymentStatus: { $in: ['unpaid', 'pending', 'failed'] } }, { paymentStatus: { $exists: false } }]
    },
    expect.objectContaining({
      $set: expect.objectContaining({
        paymentStatus: 'pending',
        paymentAmount: 1260,
        paymentReference: 'wallet:booking-1'
      })
    }),
    { new: true }
  );
  expect(Wallet.findOneAndUpdate).toHaveBeenNthCalledWith(
    2,
    { user: 'client-1', balance: { $gte: 1260 } },
    { $inc: { balance: -1260, version: 1 } },
    { new: true }
  );
  expect(Transaction.create).toHaveBeenCalledWith(
    expect.objectContaining({
      user: 'client-1',
      booking: 'booking-1',
      type: 'payment',
      method: 'wallet',
      amount: 1260,
      reference: 'escrow:booking-1',
      status: 'completed'
    })
  );
  expect(reserved.save).toHaveBeenCalled();
  expect(result.booking.paymentStatus).toBe('escrowed');
  expect(result.alreadyFunded).toBe(false);
});

test('mobile money initiation reserves booking and stores provider references', async () => {
  const booking = {
    _id: 'booking-1',
    client: 'client-1',
    owner: 'owner-1',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    bids: [{ status: 'accepted', amount: 1260 }]
  };
  const reserved = {
    ...booking,
    paymentStatus: 'pending',
    paymentReference: 'mpesa:pending:booking-1'
  };
  const updatedBooking = {
    ...reserved,
    paymentReference: 'mpesa:checkout-1'
  };
  const updatedTransaction = {
    _id: 'tx-mobile',
    booking: 'booking-1',
    providerEventId: 'checkout-1',
    reference: 'mpesa:checkout-1'
  };
  const mpesa = {
    initiateStkPush: jest.fn(async () => ({
      provider: 'mpesa',
      providerReference: 'checkout-1',
      merchantRequestId: 'merchant-1',
      message: 'M-Pesa STK push sent',
      response: { CheckoutRequestID: 'checkout-1' }
    }))
  };

  Booking.findById.mockResolvedValue(booking);
  Booking.findOneAndUpdate.mockResolvedValueOnce(reserved).mockResolvedValueOnce(updatedBooking);
  Transaction.findOneAndUpdate.mockResolvedValue(updatedTransaction);

  const service = new MobileMoneyPaymentService({ mpesa });
  const result = await service.initiateBookingPayment('booking-1', 'client-1', {
    method: 'mpesa',
    phone: '0712345678',
    amount: 1260
  });

  expect(Booking.findOneAndUpdate).toHaveBeenNthCalledWith(
    1,
    {
      _id: 'booking-1',
      $or: [{ paymentStatus: { $in: ['unpaid', 'failed'] } }, { paymentStatus: { $exists: false } }]
    },
    expect.objectContaining({
      $set: expect.objectContaining({
        paymentStatus: 'pending',
        paymentMethod: 'mpesa',
        paymentAmount: 1260
      })
    }),
    { new: true }
  );
  expect(Transaction.create).toHaveBeenCalledWith(
    expect.objectContaining({
      user: 'client-1',
      booking: 'booking-1',
      type: 'payment',
      method: 'mpesa',
      provider: 'mpesa',
      status: 'pending'
    })
  );
  expect(mpesa.initiateStkPush).toHaveBeenCalledWith(
    expect.objectContaining({
      amount: 1260,
      phone: '0712345678'
    })
  );
  expect(Transaction.findOneAndUpdate).toHaveBeenCalledWith(
    { _id: 'tx-test' },
    expect.objectContaining({
      $set: expect.objectContaining({
        reference: 'mpesa:checkout-1',
        providerEventId: 'checkout-1'
      })
    }),
    { new: true }
  );
  expect(result).toEqual(expect.objectContaining({ success: true, providerReference: 'checkout-1' }));
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

test('mpesa callback completes transaction and marks booking escrowed', async () => {
  const transaction = {
    _id: 'tx-mpesa',
    booking: 'booking-1',
    provider: 'mpesa',
    providerEventId: 'checkout-1',
    amount: 1260,
    reference: 'mpesa:checkout-1',
    metadata: {},
    save: jest.fn(function save() {
      return Promise.resolve(this);
    })
  };
  Transaction.findOne.mockResolvedValue(transaction);
  Booking.findByIdAndUpdate.mockResolvedValue({ _id: 'booking-1', paymentStatus: 'escrowed' });

  const service = new PaymentReconciliationService();
  const result = await service.reconcileMpesaCallback({
    Body: {
      stkCallback: {
        CheckoutRequestID: 'checkout-1',
        ResultCode: 0,
        ResultDesc: 'Accepted',
        CallbackMetadata: {
          Item: [
            { Name: 'Amount', Value: 1260 },
            { Name: 'MpesaReceiptNumber', Value: 'RCP123' }
          ]
        }
      }
    }
  });

  expect(transaction.status).toBe('completed');
  expect(transaction.reference).toBe('mpesa:RCP123');
  expect(transaction.save).toHaveBeenCalled();
  expect(Booking.findByIdAndUpdate).toHaveBeenCalledWith(
    'booking-1',
    {
      $set: expect.objectContaining({
        paymentStatus: 'escrowed',
        paymentReference: 'mpesa:RCP123',
        paymentAmount: 1260
      })
    },
    { new: true }
  );
  expect(result).toEqual(expect.objectContaining({ received: true, matched: true, status: 'completed' }));
});

test('mtn momo callback records failures against the booking', async () => {
  const transaction = {
    _id: 'tx-mtn',
    booking: 'booking-2',
    provider: 'mtn',
    providerEventId: 'mtn-ref-1',
    amount: 900,
    reference: 'mtn:mtn-ref-1',
    metadata: {},
    save: jest.fn(function save() {
      return Promise.resolve(this);
    })
  };
  Transaction.findOne.mockResolvedValue(transaction);
  Booking.findByIdAndUpdate.mockResolvedValue({ _id: 'booking-2', paymentStatus: 'failed' });

  const service = new PaymentReconciliationService();
  const result = await service.reconcileMTNMoMoCallback('mtn-ref-1', {
    status: 'FAILED',
    reason: 'PAYER_NOT_FOUND'
  });

  expect(transaction.status).toBe('failed');
  expect(transaction.save).toHaveBeenCalled();
  expect(Booking.findByIdAndUpdate).toHaveBeenCalledWith(
    'booking-2',
    {
      $set: expect.objectContaining({
        paymentStatus: 'failed',
        paymentReference: 'mtn:mtn-ref-1',
        paymentAmount: 900
      })
    },
    { new: true }
  );
  expect(result).toEqual(expect.objectContaining({ received: true, matched: true, status: 'failed' }));
});
