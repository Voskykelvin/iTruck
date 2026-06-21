const express = require('express');
const Notification = require('../models/Notification');
const User = require('../models/User');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const notifications = require('../services/notifications');
const {
  listNotificationsSchema,
  markReadSchema,
  notificationPreferencesSchema
} = require('../validators/notifications');

const router = express.Router();

router.use(protect);

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
