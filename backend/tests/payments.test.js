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

jest.mock('../services/deliveryProof', () => ({
  assertDeliveryProofIntegrity: jest.fn(async () => ({ chain: { valid: true } }))
}));

const Wallet = require('../models/Wallet');
const Transaction = require('../models/Transaction');
const Booking = require('../models/Booking');
const Idempotency = require('../models/Idempotency');
const {
  checkIdempotency,
  generateIdempotencyKey,
  MpesaService,
  MobileMoneyPaymentService,
  PaymentReconciliationService,
  runWithIdempotency,
  WalletService
} = require('../services/payment');

beforeAll(() => {
  process.env.DELIVERY_PROOF_MODE = 'strict';
});

afterAll(() => {
  delete process.env.DELIVERY_PROOF_MODE;
});

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

test('wallet payment release requires approved delivery proof', async () => {
  const booking = {
    _id: 'booking-1',
    client: 'client-1',
    owner: 'owner-1',
    status: 'delivered',
    paymentStatus: 'escrowed',
    paymentAmount: 1291.5,
    paymentBreakdown: {
      carrierAmount: 1260,
      platformFeeRate: 0.025,
      platformFee: 31.5,
      providerFee: 0,
      shipperTotal: 1291.5,
      carrierPayout: 1260,
      currency: 'USD'
    },
    documents: [{ type: 'pod', status: 'pending', url: 'https://example.com/pod.pdf' }]
  };

  Booking.findById.mockResolvedValue(booking);

  const wallet = new WalletService();
  await expect(wallet.releaseBookingPayment('booking-1', 'admin-1')).rejects.toThrow(
    'Receiver-grade delivery proof is required before releasing payment'
  );

  expect(Booking.findOneAndUpdate).not.toHaveBeenCalled();
  expect(Transaction.create).not.toHaveBeenCalled();
});

test('wallet payment release credits owner after approved delivery proof', async () => {
  const booking = {
    _id: 'booking-1',
    client: 'client-1',
    owner: 'owner-1',
    status: 'delivered',
    paymentStatus: 'escrowed',
    paymentAmount: 1291.5,
    paymentBreakdown: {
      carrierAmount: 1260,
      platformFeeRate: 0.025,
      platformFee: 31.5,
      providerFee: 0,
      shipperTotal: 1291.5,
      carrierPayout: 1260,
      currency: 'USD'
    },
    documents: [{ type: 'receiver-confirmation', status: 'approved', url: 'https://example.com/receiver.pdf' }],
    deliveryProof: {
      proof: 'proof-1',
      recordHash: 'a'.repeat(64),
      verificationMethod: 'sms_otp',
      verifiedAt: new Date(),
      photoCount: 1
    }
  };
  const reserved = {
    ...booking,
    paymentStatus: 'release_pending',
    save: jest.fn()
  };

  Booking.findById.mockResolvedValue(booking);
  Transaction.findOne.mockReturnValue({
    sort: jest.fn().mockResolvedValue({ _id: 'tx-payment', amount: 1291.5, method: 'wallet', currency: 'USD' })
  });
  Booking.findOneAndUpdate.mockResolvedValue(reserved);
  Wallet.findOneAndUpdate.mockResolvedValue({ _id: 'wallet-owner', balance: 1260 });

  const wallet = new WalletService();
  const result = await wallet.releaseBookingPayment('booking-1', 'admin-1');

  expect(Wallet.findOneAndUpdate).toHaveBeenCalledWith(
    { user: 'owner-1' },
    {
      $inc: { balance: 1260, version: 1 },
      $setOnInsert: { user: 'owner-1', currency: 'USD' }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  expect(reserved.save).toHaveBeenCalled();
  expect(Transaction.create).toHaveBeenCalledWith(
    expect.objectContaining({
      booking: 'booking-1',
      type: 'platform_fee',
      amount: 31.5,
      reference: 'platform-fee:booking-1',
      status: 'completed'
    })
  );
  expect(result.revenueTransaction.amount).toBe(31.5);
  expect(result.booking.paymentStatus).toBe('released');
  expect(result.alreadyReleased).toBe(false);
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

test('mpesa initiation authenticates the generated callback URL', async () => {
  const originalValues = {
    MPESA_CONSUMER_KEY: process.env.MPESA_CONSUMER_KEY,
    MPESA_CONSUMER_SECRET: process.env.MPESA_CONSUMER_SECRET,
    MPESA_SHORTCODE: process.env.MPESA_SHORTCODE,
    MPESA_PASSKEY: process.env.MPESA_PASSKEY,
    MPESA_CALLBACK_URL: process.env.MPESA_CALLBACK_URL,
    MPESA_WEBHOOK_SECRET: process.env.MPESA_WEBHOOK_SECRET
  };

  process.env.MPESA_CONSUMER_KEY = 'consumer-key';
  process.env.MPESA_CONSUMER_SECRET = 'consumer-secret';
  process.env.MPESA_SHORTCODE = '174379';
  process.env.MPESA_PASSKEY = 'passkey';
  process.env.MPESA_CALLBACK_URL = 'https://api.example.com/api/payments/webhooks/mpesa/stk';
  process.env.MPESA_WEBHOOK_SECRET = 'callback-secret';

  const response = (payload) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(payload)
  });
  const fetchImpl = jest
    .fn()
    .mockResolvedValueOnce(response({ access_token: 'access-token' }))
    .mockResolvedValueOnce(
      response({
        MerchantRequestID: 'merchant-callback',
        CheckoutRequestID: 'checkout-callback',
        CustomerMessage: 'Success'
      })
    );

  try {
    await new MpesaService({ fetchImpl }).initiateStkPush({
      amount: 1260,
      phone: '0712345678',
      accountReference: 'ITRUCK',
      description: 'Escrow payment'
    });

    const requestPayload = JSON.parse(fetchImpl.mock.calls[1][1].body);
    expect(requestPayload.CallBackURL).toBe(
      'https://api.example.com/api/payments/webhooks/mpesa/stk?token=callback-secret'
    );
  } finally {
    Object.entries(originalValues).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
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
    status: 'pending',
    reference: 'mpesa:checkout-1',
    metadata: { merchantRequestId: 'merchant-1' }
  };
  const completedTransaction = {
    ...transaction,
    status: 'completed',
    reference: 'mpesa:RCP123',
    metadata: { ...transaction.metadata, mpesaReceipt: 'RCP123' }
  };
  Transaction.findOne.mockResolvedValue(transaction);
  Transaction.findOneAndUpdate.mockResolvedValue(completedTransaction);
  Booking.findByIdAndUpdate.mockResolvedValue({ _id: 'booking-1', paymentStatus: 'escrowed' });

  const service = new PaymentReconciliationService();
  const result = await service.reconcileMpesaCallback({
    Body: {
      stkCallback: {
        MerchantRequestID: 'merchant-1',
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

  expect(Transaction.findOneAndUpdate).toHaveBeenCalledWith(
    { _id: 'tx-mpesa', status: 'pending' },
    {
      $set: expect.objectContaining({
        status: 'completed',
        reference: 'mpesa:RCP123',
        metadata: expect.objectContaining({ mpesaReceipt: 'RCP123' })
      })
    },
    { new: true }
  );
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

test('mpesa callback rejects a successful payment with the wrong amount', async () => {
  Transaction.findOne.mockResolvedValue({
    _id: 'tx-mpesa-mismatch',
    booking: 'booking-1',
    provider: 'mpesa',
    providerEventId: 'checkout-mismatch',
    amount: 1260,
    status: 'pending',
    reference: 'mpesa:checkout-mismatch',
    metadata: { merchantRequestId: 'merchant-mismatch' }
  });

  const service = new PaymentReconciliationService();
  await expect(
    service.reconcileMpesaCallback({
      Body: {
        stkCallback: {
          MerchantRequestID: 'merchant-mismatch',
          CheckoutRequestID: 'checkout-mismatch',
          ResultCode: 0,
          ResultDesc: 'Accepted',
          CallbackMetadata: {
            Item: [
              { Name: 'Amount', Value: 1250 },
              { Name: 'MpesaReceiptNumber', Value: 'RCP-MISMATCH' }
            ]
          }
        }
      }
    })
  ).rejects.toThrow('amount does not match');

  expect(Transaction.findOneAndUpdate).not.toHaveBeenCalled();
  expect(Booking.findByIdAndUpdate).not.toHaveBeenCalled();
});

test('mpesa callback does not regress an already completed transaction', async () => {
  const transaction = {
    _id: 'tx-mpesa-complete',
    booking: 'booking-1',
    provider: 'mpesa',
    providerEventId: 'checkout-complete',
    amount: 1260,
    status: 'completed',
    reference: 'mpesa:RCP-COMPLETE',
    metadata: { mpesaReceipt: 'RCP-COMPLETE' }
  };
  Transaction.findOne.mockResolvedValue(transaction);
  Booking.findByIdAndUpdate.mockResolvedValue({ _id: 'booking-1', paymentStatus: 'escrowed' });

  const service = new PaymentReconciliationService();
  const result = await service.reconcileMpesaCallback({
    Body: {
      stkCallback: {
        CheckoutRequestID: 'checkout-complete',
        ResultCode: 1,
        ResultDesc: 'Late duplicate failure'
      }
    }
  });

  expect(Transaction.findOneAndUpdate).not.toHaveBeenCalled();
  expect(result).toEqual(
    expect.objectContaining({ received: true, matched: true, duplicate: true, status: 'completed' })
  );
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
