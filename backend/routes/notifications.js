const express = require('express');
const Notification = require('../models/Notification');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { listNotificationsSchema, markReadSchema } = require('../validators/notifications');

const router = express.Router();

router.use(protect);

router.get('/', listNotificationsSchema, validate, async (req, res, next) => {
  try {
    const limit = req.query.limit || 50;
    res.json({ notifications: await Notification.find({ user: req.user._id }).sort('-createdAt').limit(limit) });
  } catch (err) {
    next(err);
  }
});

router.get('/count', async (req, res, next) => {
  try {
    res.json({ count: await Notification.unreadCount(req.user._id) });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/read', markReadSchema, validate, async (req, res, next) => {
  try {
    const notification = await Notification.findByIdAndUpdate(req.params.id, { read: true }, { new: true });
    if (!notification) return res.status(404).json({ message: 'Notification not found' });
    res.json({ notification });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
