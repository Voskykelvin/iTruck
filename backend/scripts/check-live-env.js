require('dotenv').config({ path: require('path').join(__dirname, '../../.env.production') });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

process.env.LIVE_MODE = 'true';

const { requireLiveSecrets } = require('../config/runtime');

try {
  requireLiveSecrets();
  console.log('Live environment check passed.');
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
