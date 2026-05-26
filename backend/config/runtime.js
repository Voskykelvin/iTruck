const mongoose = require('mongoose');

function isLiveMode() {
  return process.env.LIVE_MODE === 'true' || process.env.NODE_ENV === 'production';
}

function demoModeEnabled() {
  return !isLiveMode() && process.env.DEMO_MODE !== 'false';
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
  ].filter(key => !process.env[key]);

  if (missing.length) {
    throw new Error(`Missing live environment variables: ${missing.join(', ')}`);
  }
  if (process.env.JWT_SECRET === 'dev-secret' || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be a strong production secret of at least 32 characters.');
  }
}

module.exports = {
  demoModeEnabled,
  isLiveMode,
  mongoReady,
  requireDatabase,
  requireLiveSecrets
};
