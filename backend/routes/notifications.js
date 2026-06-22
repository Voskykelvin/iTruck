const express = require('express');
const crypto = require('crypto');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const notifications = require('../services/notifications');
const NotificationDelivery = require('../models/NotificationDelivery');
const push = require('../services/push');
const {
  listNotificationsSchema,
  markReadSchema,
  notificationPreferencesSchema,
  pushSubscriptionSchema
} = require('../validators/notifications');

const router = express.Router();

function receiptAuthorized(req) {
  const expected = process.env.NOTIFICATION_RECEIPT_SECRET;
  if (!expected) return false;
  const provided = req.get('x-itruck-webhook-secret') || req.get('x-webhook-secret') || req.query.token || '';
  const providedBuffer = Buffer.from(String(provided));
  const expectedBuffer = Buffer.from(String(expected));
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

router.post('/receipts/:provider', async (req, res, next) => {
  try {
    if (!receiptAuthorized(req)) return res.status(401).json({ message: 'Invalid notification receipt secret' });
    if (requireDatabase(req, res)) return;
    const providerMessageId =
      req.body.providerMessageId || req.body.messageId || req.body.id || req.body.trackingId || req.body.MessageId;
    if (!providerMessageId) return res.status(400).json({ message: 'providerMessageId is required' });
    const rawStatus = String(req.body.status || req.body.deliveryStatus || '').toLowerCase();
    const delivered = ['delivered', 'success', 'successful', 'read'].includes(rawStatus);
    const failed = ['failed', 'rejected', 'undeliverable', 'expired'].includes(rawStatus);
    const delivery = await NotificationDelivery.findOneAndUpdate(
      { providerMessageId: String(providerMessageId) },
      {
        $set: {
          status: delivered ? 'delivered' : failed ? 'failed' : 'sent',
          provider: req.params.provider,
          providerResponse: req.body,
          ...(delivered ? { sentAt: new Date() } : {}),
          ...(failed ? { failedAt: new Date(), lastError: req.body.reason || rawStatus } : {})
        }
      },
      { new: true }
    );
    res.json({ received: true, matched: Boolean(delivery), status: delivery?.status });
  } catch (err) {
    next(err);
  }
});

router.use(protect);

router.get('/push/config', (_req, res) => {
  const publicKey = push.publicKey();
  res.status(publicKey ? 200 : 503).json({ configured: Boolean(publicKey), publicKey });
});

router.post('/push/subscribe', pushSubscriptionSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ subscribed: true, mode: 'memory' });
    await User.updateOne(
      { _id: req.user._id },
      {
        $set: {
          pushSubscription: req.body.subscription,
          'notificationPreferences.channels.push': true
        }
      }
    );
    res.status(201).json({ subscribed: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/push/subscribe', async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ subscribed: false, mode: 'memory' });
    await User.updateOne(
      { _id: req.user._id },
      {
        $unset: { pushSubscription: 1 },
        $set: { 'notificationPreferences.channels.push': false }
      }
    );
    res.json({ subscribed: false });
  } catch (err) {
    next(err);
  }
});

router.get('/', listNotificationsSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ notifications: [], mode: 'memory' });

    const limit = req.query.limit || 50;
    res.json({
      notifications: await Notification.find({
        user: req.user._id,
        suppressed: { $ne: true },
        $or: [{ 'channels.inApp': true }, { 'channels.inApp': { $exists: false }, 'channels.push': true }]
      })
        .sort('-createdAt')
        .limit(limit)
    });
  } catch (err) {
    next(err);
  }
});

router.get('/count', async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ count: 0, mode: 'memory' });

    res.json({ count: await Notification.unreadCount(req.user._id) });
  } catch (err) {
    next(err);
  }
});

router.get('/preferences', async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.json({
        preferences: notifications.mergePreferences(req.user.notificationPreferences),
        mode: 'memory'
      });
    }

    const user = await User.findById(req.user._id).select('notificationPreferences');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ preferences: notifications.mergePreferences(user.notificationPreferences) });
  } catch (err) {
    next(err);
  }
});

router.patch('/preferences', notificationPreferencesSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    const preferences = notifications.mergePreferencePatch(req.user.notificationPreferences, req.body);
    if (!mongoReady()) return res.json({ preferences, mode: 'memory' });

    const currentUser = await User.findById(req.user._id).select('notificationPreferences');
    if (!currentUser) return res.status(404).json({ message: 'User not found' });
    currentUser.notificationPreferences = notifications.mergePreferencePatch(
      currentUser.notificationPreferences,
      req.body
    );
    const user = await currentUser.save();
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ preferences: notifications.mergePreferences(user.notificationPreferences) });
  } catch (err) {
    next(err);
  }
});

router.post('/test', async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.json({ message: 'Test notification accepted in demo mode', mode: 'memory' });
    }
    const notification = await notifications.deliver(
      req.user._id,
      'system.test',
      {
        title: 'iTruck notification test',
        message: 'Your notification preferences are connected correctly.',
        link: '/app/profile',
        priority: 'normal'
      },
      req.app.get('io')
    );
    res.status(201).json({ notification });
  } catch (err) {
    next(err);
  }
});

router.patch('/read-all', async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ updated: 0, mode: 'memory' });
    const result = await Notification.updateMany(
      {
        user: req.user._id,
        read: false,
        suppressed: { $ne: true },
        $or: [{ 'channels.inApp': true }, { 'channels.inApp': { $exists: false }, 'channels.push': true }]
      },
      { $set: { read: true } }
    );
    res.json({ updated: result.modifiedCount || 0 });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', markReadSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.status(404).json({ message: 'Notification not found', mode: 'memory' });

    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { read: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.json({ notification });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
