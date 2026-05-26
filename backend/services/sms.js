const logger = require('../config/logger');

function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendSMS(to, message) {
  logger.info({ to, messageLength: String(message || '').length }, 'SMS queued');
  return { to, message };
}

module.exports = { generateOTP, sendSMS };
