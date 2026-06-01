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
  assertRuntimeConfig,
  demoModeEnabled,
  hostedRuntimeDetected,
  isLiveMode,
  mongoReady,
  requireDatabase,
  requireLiveSecrets,
  runtimeMode
};
