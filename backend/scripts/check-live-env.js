require('dotenv').config({ path: require('path').join(__dirname, '../../.env.production') });
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

process.env.LIVE_MODE = 'true';

const { assertGoLiveIntegrations, assertRuntimeConfig, goLiveIntegrationStatus } = require('../config/runtime');

try {
  assertRuntimeConfig();
  assertGoLiveIntegrations();
  const configured = goLiveIntegrationStatus()
    .filter((item) => item.configured)
    .map((item) => item.name)
    .join(', ');
  console.log('Live environment check passed.');
  console.log(`Configured integrations: ${configured}.`);
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
