const webpush = require('web-push');

let configured = false;

function configure() {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT;
  if (!vapidPublicKey || !privateKey || !subject) return false;
  if (!configured) {
    webpush.setVapidDetails(subject, vapidPublicKey, privateKey);
    configured = true;
  }
  return true;
}

function publicKey() {
  return configure() ? process.env.VAPID_PUBLIC_KEY : '';
}

async function sendPush(subscription, payload) {
  if (!configure()) {
    const err = new Error('Web push is not configured');
    err.status = 503;
    throw err;
  }
  try {
    const response = await webpush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 60 * 60,
      urgency: payload.priority === 'high' ? 'high' : 'normal'
    });
    return {
      provider: 'web-push',
      id: response.headers?.location,
      statusCode: response.statusCode,
      headers: response.headers
    };
  } catch (err) {
    if ([404, 410].includes(err.statusCode)) err.permanent = true;
    throw err;
  }
}

module.exports = { configure, publicKey, sendPush };
