const logger = require('../config/logger');

const lastSent = new Map();

function cooldownMs() {
  const value = Number(process.env.OPERATIONS_ALERT_COOLDOWN_MS);
  return Number.isFinite(value) && value >= 10_000 ? value : 15 * 60 * 1000;
}

async function sendAlert(key, message, details = {}) {
  const webhookUrl = process.env.OPERATIONS_ALERT_WEBHOOK_URL;
  if (!webhookUrl) return { sent: false, reason: 'not-configured' };

  const now = Date.now();
  const previous = lastSent.get(key) || 0;
  if (now - previous < cooldownMs()) return { sent: false, reason: 'cooldown' };

  const payload = {
    service: 'itruck-backend',
    environment: process.env.NODE_ENV || 'development',
    key,
    message,
    details,
    timestamp: new Date(now).toISOString()
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000)
    });
    if (!response.ok) throw new Error(`Alert webhook returned HTTP ${response.status}`);
    lastSent.set(key, now);
    return { sent: true };
  } catch (err) {
    logger.error({ err, alertKey: key }, 'Operations alert delivery failed');
    return { sent: false, reason: err.message };
  }
}

function resetAlertCooldowns() {
  lastSent.clear();
}

module.exports = { resetAlertCooldowns, sendAlert };
