const { paymentProviderReadiness } = require('../services/providerReadiness');

test('provider readiness keeps MTN disabled and defaults to KES', () => {
  const result = paymentProviderReadiness({});
  expect(result.currency).toBe('KES');
  expect(result.providers).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'card', collections: false }),
      expect.objectContaining({ id: 'mpesa', collections: false }),
      expect.objectContaining({ id: 'mtn', collections: false, configured: false })
    ])
  );
});

test('provider readiness recognizes complete Stripe and M-Pesa collection credentials', () => {
  const result = paymentProviderReadiness({
    DEFAULT_CURRENCY: 'KES',
    STRIPE_SECRET_KEY: 'sk_test',
    STRIPE_WEBHOOK_SECRET: 'whsec_test',
    MPESA_CONSUMER_KEY: 'consumer',
    MPESA_CONSUMER_SECRET: 'secret',
    MPESA_SHORTCODE: '174379',
    MPESA_PASSKEY: 'passkey',
    MPESA_CALLBACK_URL: 'https://example.com/mpesa',
    MPESA_WEBHOOK_SECRET: 'callback-secret'
  });

  expect(result.providers.find((provider) => provider.id === 'card')).toEqual(
    expect.objectContaining({ collections: true, refunds: true })
  );
  expect(result.providers.find((provider) => provider.id === 'mpesa')).toEqual(
    expect.objectContaining({ collections: true, configured: true, payouts: false })
  );
});
