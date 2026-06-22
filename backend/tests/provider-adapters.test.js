jest.mock('../models/User', () => ({ collection: { findOne: jest.fn() } }));
jest.mock('../models/Wallet', () => ({}));
jest.mock('../models/Transaction', () => ({}));
jest.mock('../models/Booking', () => ({}));
jest.mock('../models/Idempotency', () => ({}));
jest.mock('../models/ProviderOperation', () => ({}));
jest.mock('../services/deliveryProof', () => ({
  assertDeliveryProofIntegrity: jest.fn()
}));

const { MpesaService, MTNMoMoService, StripeService } = require('../services/payment');

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function response(payload = {}, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn().mockResolvedValue(JSON.stringify(payload))
  };
}

test('M-Pesa B2C payout authenticates callbacks and returns the conversation reference', async () => {
  Object.assign(process.env, {
    MPESA_CONSUMER_KEY: 'consumer',
    MPESA_CONSUMER_SECRET: 'secret',
    MPESA_B2C_INITIATOR_NAME: 'initiator',
    MPESA_B2C_SECURITY_CREDENTIAL: 'credential',
    MPESA_B2C_SHORTCODE: '600000',
    MPESA_B2C_RESULT_URL: 'https://api.example.com/api/payments/webhooks/mpesa/b2c/result',
    MPESA_B2C_TIMEOUT_URL: 'https://api.example.com/api/payments/webhooks/mpesa/b2c/timeout',
    MPESA_WEBHOOK_SECRET: 'callback-secret'
  });
  const fetchImpl = jest
    .fn()
    .mockResolvedValueOnce(response({ access_token: 'token' }))
    .mockResolvedValueOnce(response({ OriginatorConversationID: 'origin-1', ConversationID: 'conversation-1' }));

  const result = await new MpesaService({ fetchImpl }).initiateB2CPayout({
    amount: 800,
    phone: '+254700000000',
    remarks: 'Carrier payout'
  });

  const payload = JSON.parse(fetchImpl.mock.calls[1][1].body);
  expect(fetchImpl.mock.calls[1][0]).toContain('/mpesa/b2c/v3/paymentrequest');
  expect(payload.ResultURL).toContain('token=callback-secret');
  expect(payload.PartyB).toBe('254700000000');
  expect(result).toMatchObject({ provider: 'mpesa', providerReference: 'origin-1', status: 'pending' });
});

test('M-Pesa reversal uses the provider receipt rather than an internal checkout id', async () => {
  Object.assign(process.env, {
    MPESA_CONSUMER_KEY: 'consumer',
    MPESA_CONSUMER_SECRET: 'secret',
    MPESA_SHORTCODE: '600000',
    MPESA_REVERSAL_INITIATOR_NAME: 'initiator',
    MPESA_REVERSAL_SECURITY_CREDENTIAL: 'credential',
    MPESA_REVERSAL_RESULT_URL: 'https://api.example.com/api/payments/webhooks/mpesa/reversal/result',
    MPESA_REVERSAL_TIMEOUT_URL: 'https://api.example.com/api/payments/webhooks/mpesa/reversal/timeout'
  });
  const fetchImpl = jest
    .fn()
    .mockResolvedValueOnce(response({ access_token: 'token' }))
    .mockResolvedValueOnce(response({ ConversationID: 'reverse-1' }));

  await new MpesaService({ fetchImpl }).reverseTransaction({
    transactionId: 'QWE123ABC',
    amount: 250,
    remarks: 'Customer refund'
  });

  expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual(
    expect.objectContaining({ TransactionID: 'QWE123ABC', CommandID: 'TransactionReversal', Amount: 250 })
  );
});

test('MTN disbursement transfer uses disbursement credentials and an idempotent provider reference', async () => {
  Object.assign(process.env, {
    APP_URL: 'https://api.example.com',
    MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY: 'disb-subscription',
    MTN_MOMO_DISBURSEMENT_API_USER: 'disb-user',
    MTN_MOMO_DISBURSEMENT_API_KEY: 'disb-key',
    MTN_MOMO_TARGET_ENV: 'sandbox',
    MTN_MOMO_CURRENCY: 'EUR',
    MTN_MOMO_WEBHOOK_SECRET: 'callback-secret'
  });
  const fetchImpl = jest
    .fn()
    .mockResolvedValueOnce(response({ access_token: 'token' }))
    .mockResolvedValueOnce(response({}));

  const result = await new MTNMoMoService({ fetchImpl }).transfer({
    amount: 420,
    phone: '+256770000000',
    externalId: 'withdrawal-1'
  });

  const request = fetchImpl.mock.calls[1];
  expect(request[0]).toContain('/disbursement/v1_0/transfer');
  expect(request[1].headers['Ocp-Apim-Subscription-Key']).toBe('disb-subscription');
  expect(request[1].headers['X-Callback-Url']).toContain('token=callback-secret');
  expect(result.providerReference).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
});

test('Stripe adapters send smallest-unit amounts and stable idempotency keys', async () => {
  const client = {
    refunds: { create: jest.fn().mockResolvedValue({ id: 're_1', status: 'succeeded' }) },
    transfers: { create: jest.fn().mockResolvedValue({ id: 'tr_1' }) }
  };
  const stripe = new StripeService({ client });

  await stripe.refund({
    paymentIntent: 'pi_1',
    amount: 12.34,
    currency: 'USD',
    reason: 'requested_by_customer',
    idempotencyKey: 'refund-key-123',
    metadata: { operationId: 'op-1' }
  });
  await stripe.transfer({
    amount: 50,
    currency: 'USD',
    destination: 'acct_1',
    idempotencyKey: 'payout-key-123',
    metadata: { operationId: 'op-2' }
  });

  expect(client.refunds.create).toHaveBeenCalledWith(
    expect.objectContaining({ payment_intent: 'pi_1', amount: 1234 }),
    { idempotencyKey: 'refund-key-123' }
  );
  expect(client.transfers.create).toHaveBeenCalledWith(
    expect.objectContaining({ destination: 'acct_1', amount: 5000, currency: 'usd' }),
    { idempotencyKey: 'payout-key-123' }
  );
});
