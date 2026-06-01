const mongoose = require('mongoose');

const VALID_MODES = ['live', 'demo', 'offline'];
const HOSTED_ENV_MARKERS = [
  'RENDER',
  'RAILWAY_ENVIRONMENT',
  'FLY_APP_NAME',
  'K_SERVICE',
  'WEBSITE_SITE_NAME',
  'HEROKU_APP_NAME'
];

function runtimeConfigError(message) {
  const err = new Error(message);
  err.code = 'RUNTIME_CONFIG';
  return err;
}

function normalized(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function hostedRuntimeDetected() {
  return HOSTED_ENV_MARKERS.some((key) => {
    const value = process.env[key];
    return value && value !== 'false' && value !== '0';
  });
}

function runtimeMode() {
  const appMode = normalized(process.env.APP_MODE);
  if (appMode) return appMode;
  if (process.env.LIVE_MODE === 'true' || process.env.NODE_ENV === 'production') return 'live';
  if (process.env.DEMO_MODE === 'false') return 'offline';
  return 'demo';
}

function assertKnownMode(mode = runtimeMode()) {
  if (!VALID_MODES.includes(mode)) {
    throw runtimeConfigError(`APP_MODE must be one of ${VALID_MODES.join(', ')}.`);
  }
  return mode;
}

function isLiveMode() {
  return assertKnownMode() === 'live';
}

function demoModeEnabled() {
  return assertKnownMode() === 'demo';
}

function mongoReady() {
  return mongoose.connection.readyState === 1;
}

function requireDatabase(req, res) {
  if (mongoReady()) return false;
  if (isLiveMode()) {
    res.status(503).json({
      message: 'Service temporarily unavailable. Database connection offline.',
      mode: 'live'
    });
    return true;
  }
  if (demoModeEnabled()) return false;

  res.status(503).json({
    message: 'Database unavailable and demo mode is disabled.',
    mode: 'offline'
  });
  return true;
}

function requireLiveSecrets() {
  if (!isLiveMode()) return;
  const missing = [
    'MONGODB_URI',
    'JWT_SECRET',
    'FRONTEND_URL',
    'CLOUDINARY_CLOUD_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET'
  ].filter((key) => !process.env[key]);

  if (missing.length) {
    throw new Error(`Missing live environment variables: ${missing.join(', ')}`);
  }
  if (process.env.JWT_SECRET === 'dev-secret' || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be a strong production secret of at least 32 characters.');
  }
}

function hasAllEnv(keys) {
  return keys.every((key) => Boolean(process.env[key]));
}

function goLiveIntegrationStatus() {
  const stripeReady = hasAllEnv(['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET']);
  const mpesaReady = hasAllEnv([
    'MPESA_CONSUMER_KEY',
    'MPESA_CONSUMER_SECRET',
    'MPESA_SHORTCODE',
    'MPESA_PASSKEY',
    'MPESA_CALLBACK_URL'
  ]);
  const mtnReady = hasAllEnv([
    'MTN_MOMO_SUBSCRIPTION_KEY',
    'MTN_MOMO_API_USER',
    'MTN_MOMO_API_KEY',
    'MTN_MOMO_CALLBACK_URL'
  ]);
  const smsReady =
    Boolean(process.env.SMS_PROVIDER_MODULE) || hasAllEnv(['AFRICASTALKING_API_KEY', 'AFRICASTALKING_USERNAME']);
  const emailReady =
    Boolean(process.env.EMAIL_PROVIDER_MODULE) ||
    Boolean(process.env.SENDGRID_API_KEY) ||
    Boolean(process.env.RESEND_API_KEY);
  const mapsReady = Boolean(process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY);

  return [
    {
      name: 'payments',
      configured: stripeReady || mpesaReady || mtnReady,
      hint: 'configure Stripe webhook secrets, M-Pesa credentials, or MTN MoMo credentials'
    },
    {
      name: 'sms',
      configured: smsReady,
      hint: 'configure SMS_PROVIDER_MODULE or AFRICASTALKING_API_KEY and AFRICASTALKING_USERNAME'
    },
    {
      name: 'email',
      configured: emailReady,
      hint: 'configure EMAIL_PROVIDER_MODULE, SENDGRID_API_KEY, or RESEND_API_KEY'
    },
    {
      name: 'maps',
      configured: mapsReady,
      hint: 'configure GOOGLE_MAPS_API_KEY or VITE_GOOGLE_MAPS_API_KEY'
    }
  ];
}

function assertGoLiveIntegrations() {
  const missing = goLiveIntegrationStatus().filter((item) => !item.configured);
  if (missing.length) {
    throw runtimeConfigError(
      `Missing go-live integrations: ${missing.map((item) => `${item.name} (${item.hint})`).join('; ')}.`
    );
  }
  return true;
}

function assertRuntimeConfig() {
  const mode = assertKnownMode();

  if (process.env.NODE_ENV === 'production' && mode !== 'live') {
    throw runtimeConfigError('NODE_ENV=production requires APP_MODE=live or LIVE_MODE=true.');
  }

  if (hostedRuntimeDetected() && mode !== 'live' && process.env.ALLOW_HOSTED_DEMO !== 'true') {
    throw runtimeConfigError('Hosted deployments must run in live mode. Set APP_MODE=live or LIVE_MODE=true.');
  }

  if (mode === 'live') requireLiveSecrets();
  return mode;
}

module.exports = {
  assertGoLiveIntegrations,
  assertRuntimeConfig,
  demoModeEnabled,
  goLiveIntegrationStatus,
  hostedRuntimeDetected,
  isLiveMode,
  mongoReady,
  requireDatabase,
  requireLiveSecrets,
  runtimeMode
};
