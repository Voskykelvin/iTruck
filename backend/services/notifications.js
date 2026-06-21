const Notification = require('../models/Notification');
const NotificationDelivery = require('../models/NotificationDelivery');
const User = require('../models/User');
const logger = require('../config/logger');

const DEFAULT_PREFERENCES = Object.freeze({
  channels: {
    inApp: true,
    email: false,
    sms: false
  },
  categories: {
    bookings: true,
    tracking: true,
    documents: true,
    payments: true,
    security: true,
    marketing: false,
    system: true
  },
  quietHours: {
    enabled: false,
    start: '21:00',
    end: '07:00',
    timezone: 'Africa/Nairobi',
    allowHighPriority: true
  }
});

const CATEGORY_PREFIXES = [
  ['payment.', 'payments'],
  ['booking.', 'bookings'],
  ['bid.', 'bookings'],
  ['shipment.', 'tracking'],
  ['tracking.', 'tracking'],
  ['document.', 'documents'],
  ['profile.', 'documents'],
  ['truck.', 'documents'],
  ['security.', 'security'],
  ['admin.broadcast', 'marketing']
];

function userId(value) {
  return value?._id || value;
}

function plain(value) {
  return value?.toObject ? value.toObject() : value || {};
}

function mergePreferences(value = {}) {
  const preferences = plain(value);
  return {
    channels: { ...DEFAULT_PREFERENCES.channels, ...(preferences.channels || {}) },
    categories: { ...DEFAULT_PREFERENCES.categories, ...(preferences.categories || {}) },
    quietHours: { ...DEFAULT_PREFERENCES.quietHours, ...(preferences.quietHours || {}) }
  };
}

function mergePreferencePatch(current = {}, patch = {}) {
  const base = mergePreferences(current);
  return {
    channels: { ...base.channels, ...(patch.channels || {}) },
    categories: { ...base.categories, ...(patch.categories || {}) },
    quietHours: { ...base.quietHours, ...(patch.quietHours || {}) }
  };
}

function categoryFor(type, explicitCategory) {
  if (explicitCategory && DEFAULT_PREFERENCES.categories[explicitCategory] !== undefined) return explicitCategory;
  const normalized = String(type || '').toLowerCase();
  return CATEGORY_PREFIXES.find(([prefix]) => normalized.startsWith(prefix))?.[1] || 'system';
}

function minuteOfDay(value = '00:00') {
  const [hour, minute] = String(value).split(':').map(Number);
  return hour * 60 + minute;
}

function localMinute(date, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return Number(values.hour) * 60 + Number(values.minute);
  } catch (_err) {
    return date.getUTCHours() * 60 + date.getUTCMinutes();
  }
}

function withinQuietHours(date, quietHours) {
  if (!quietHours?.enabled) return false;
  const now = localMinute(date, quietHours.timezone);
  const start = minuteOfDay(quietHours.start);
  const end = minuteOfDay(quietHours.end);
  if (start === end) return true;
  return start < end ? now >= start && now < end : now >= start || now < end;
}

function nextAllowedDeliveryAt(now, quietHours, priority = 'normal') {
  if (!quietHours?.enabled || (priority === 'high' && quietHours.allowHighPriority)) return now;
  if (!withinQuietHours(now, quietHours)) return now;

  const candidate = new Date(now);
  for (let index = 0; index < 24 * 12; index += 1) {
    candidate.setMinutes(candidate.getMinutes() + 5);
    if (!withinQuietHours(candidate, quietHours)) return candidate;
  }
  return new Date(now.getTime() + 12 * 60 * 60 * 1000);
}

function notificationPayload(notification, type, data) {
  return {
    _id: notification?._id,
    id: notification?._id,
    type,
    title: notification?.title || data.title || type,
    message: notification?.message || data.message || '',
    read: Boolean(notification?.read),
    createdAt: notification?.createdAt || new Date().toISOString(),
    data
  };
}

async function resolveUser(user) {
  if (user && typeof user === 'object' && (user.email || user.phone || user.notificationPreferences)) return user;
  return User.findById(userId(user)).select(
    'firstName lastName email phone countryCode role isActive notificationPreferences'
  );
}

function deliveryPayload(channel, recipient, notification, data) {
  if (channel === 'email') {
    const title = escapeHtml(notification.title || 'iTruck update');
    const message = escapeHtml(notification.message || '');
    const text = [notification.title, notification.message, data.link ? `Open iTruck: ${data.link}` : '']
      .filter(Boolean)
      .join('\n\n');
    return {
      recipient,
      payload: {
        subject: notification.title || 'iTruck update',
        text,
        html: `<p><strong>${title}</strong></p><p>${message}</p>`
      }
    };
  }

  return {
    recipient,
    payload: {
      message: [notification.title, notification.message].filter(Boolean).join(': ').slice(0, 480)
    }
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function smsRecipient(user) {
  const phone = String(user.phone || '').trim();
  if (!phone || phone.startsWith('+')) return phone;
  const countryCode = String(user.countryCode || '').trim();
  if (!countryCode) return phone;
  return `${countryCode}${phone.replace(/^0/, '')}`;
}

async function createDelivery(notification, user, channel, scheduledFor, data) {
  const recipient = channel === 'email' ? user.email : smsRecipient(user);
  if (!recipient) return null;
  const content = deliveryPayload(channel, recipient, notification, data);

  try {
    return await NotificationDelivery.create({
      notification: notification._id,
      user: user._id,
      channel,
      recipient: content.recipient,
      payload: content.payload,
      nextAttemptAt: scheduledFor
    });
  } catch (err) {
    if (err.code === 11000) return NotificationDelivery.findOne({ notification: notification._id, channel });
    throw err;
  }
}

async function createNotification(payload) {
  try {
    return { notification: await Notification.create(payload), created: true };
  } catch (err) {
    if (err.code === 11000 && payload.dedupeKey) {
      return {
        notification: await Notification.findOne({ user: payload.user, dedupeKey: payload.dedupeKey }),
        created: false
      };
    }
    throw err;
  }
}

async function deliver(userInput, type, data = {}, io) {
  const user = await resolveUser(userInput);
  if (!user || user.isActive === false) return null;

  const preferences = mergePreferences(user.notificationPreferences);
  const category = categoryFor(type, data.category);
  const categoryEnabled = preferences.categories[category] !== false;
  const priority = data.priority || 'normal';
  const channels = {
    inApp: categoryEnabled && preferences.channels.inApp !== false,
    push: false,
    email: categoryEnabled && preferences.channels.email === true && Boolean(user.email),
    sms: categoryEnabled && preferences.channels.sms === true && Boolean(user.phone)
  };
  const suppressed = !categoryEnabled || !Object.values(channels).some(Boolean);
  const state = await createNotification({
    user: user._id,
    type,
    category,
    title: data.title || type,
    message: data.message || '',
    priority,
    channels,
    suppressed,
    suppressionReason: !categoryEnabled
      ? `${category} notifications are disabled`
      : suppressed
        ? 'No channel enabled'
        : undefined,
    dedupeKey: data.dedupeKey,
    data
  });
  const notification = state.notification;
  if (!notification) return null;
  if (!state.created) return notification;

  if (channels.inApp && io?.emitToUser) {
    io.emitToUser(user._id, 'notification:new', notificationPayload(notification, type, data));
  }

  const scheduledFor = nextAllowedDeliveryAt(new Date(), preferences.quietHours, priority);
  await Promise.all(
    ['email', 'sms']
      .filter((channel) => channels[channel])
      .map((channel) => createDelivery(notification, user, channel, scheduledFor, data))
  );

  return notification;
}

async function notifyBookingParties(booking, type, data, io) {
  const uniqueUsers = new Map();
  [booking.client, booking.owner].filter(Boolean).forEach((value) => {
    uniqueUsers.set(String(userId(value)), value);
  });
  return Promise.all([...uniqueUsers.values()].map((user) => deliver(user, type, data, io)));
}

async function broadcast({ users, type = 'admin.broadcast', data = {}, io }) {
  const results = [];
  const batchSize = 25;
  for (let offset = 0; offset < users.length; offset += batchSize) {
    const batch = users.slice(offset, offset + batchSize);
    const settled = await Promise.allSettled(batch.map((user) => deliver(user, type, data, io)));
    settled.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        logger.error(
          { err: result.reason, userId: userId(batch[index]), type },
          'Notification broadcast recipient failed'
        );
      }
    });
    if (offset + batchSize < users.length) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }
  return {
    targeted: users.length,
    created: results.filter(Boolean).length
  };
}

module.exports = {
  DEFAULT_PREFERENCES,
  broadcast,
  categoryFor,
  deliver,
  mergePreferences,
  mergePreferencePatch,
  nextAllowedDeliveryAt,
  notifyBookingParties,
  withinQuietHours
};
