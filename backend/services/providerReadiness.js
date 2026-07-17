function all(env, keys) {
  return keys.every((key) => Boolean(env[key]));
}

function any(env, keys) {
  return keys.some((key) => Boolean(env[key]));
}

function paymentProviderReadiness(env = process.env, options = {}) {
  const demo = Boolean(options.demo);
  const cardCollections = all(env, ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']);
  const mpesaCollections =
    all(env, [
      'MPESA_CONSUMER_KEY',
      'MPESA_CONSUMER_SECRET',
      'MPESA_SHORTCODE',
      'MPESA_PASSKEY',
      'MPESA_CALLBACK_URL'
    ]) && any(env, ['MPESA_WEBHOOK_SECRET', 'MPESA_CALLBACK_SECRET', 'MPESA_CALLBACK_TOKEN']);
  const mpesaPayouts =
    all(env, [
      'MPESA_CONSUMER_KEY',
      'MPESA_CONSUMER_SECRET',
      'MPESA_B2C_INITIATOR_NAME',
      'MPESA_B2C_SECURITY_CREDENTIAL',
      'MPESA_B2C_RESULT_URL',
      'MPESA_B2C_TIMEOUT_URL'
    ]) && any(env, ['MPESA_WEBHOOK_SECRET', 'MPESA_CALLBACK_SECRET', 'MPESA_CALLBACK_TOKEN']);
  const mpesaRefunds =
    all(env, [
      'MPESA_CONSUMER_KEY',
      'MPESA_CONSUMER_SECRET',
      'MPESA_REVERSAL_INITIATOR_NAME',
      'MPESA_REVERSAL_SECURITY_CREDENTIAL',
      'MPESA_REVERSAL_RESULT_URL',
      'MPESA_REVERSAL_TIMEOUT_URL'
    ]) && any(env, ['MPESA_WEBHOOK_SECRET', 'MPESA_CALLBACK_SECRET', 'MPESA_CALLBACK_TOKEN']);
  const mtnEnabled = String(env.ENABLE_MTN_MOMO || '').toLowerCase() === 'true';

  return {
    currency: String(env.DEFAULT_CURRENCY || 'KES').toUpperCase(),
    providers: [
      {
        id: 'card',
        label: 'Bank card',
        available: demo || cardCollections,
        collections: cardCollections,
        refunds: cardCollections,
        payouts: cardCollections,
        configured: cardCollections,
        message: cardCollections ? 'Hosted card checkout is configured' : 'Add Stripe secret and webhook credentials'
      },
      {
        id: 'mpesa',
        label: 'M-Pesa',
        available: demo || mpesaCollections,
        collections: mpesaCollections,
        refunds: mpesaRefunds,
        payouts: mpesaPayouts,
        configured: mpesaCollections,
        message: mpesaCollections ? 'M-Pesa collections are configured' : 'Complete Daraja collection credentials'
      },
      {
        id: 'mtn',
        label: 'MTN MoMo',
        available: false,
        collections: false,
        refunds: false,
        payouts: false,
        configured: false,
        message: mtnEnabled ? 'Provider credentials are incomplete' : 'Disabled until a later launch phase'
      }
    ]
  };
}

module.exports = { paymentProviderReadiness };
