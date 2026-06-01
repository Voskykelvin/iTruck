const express = require('express');
const User = require('../models/User');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { updatePasswordSchema, updateProfileSchema } = require('../validators/users');

const router = express.Router();
const profileFields = ['firstName', 'lastName', 'phone', 'countryCode', 'country', 'accountType', 'company', 'avatar'];

router.use(protect);

router.get('/profile', (req, res) => res.json({ user: req.user }));

function profileUpdates(body) {
  return profileFields.reduce((updates, field) => {
    if (body[field] !== undefined) updates[field] = body[field];
    return updates;
  }, {});
}

router.patch('/profile', updateProfileSchema, validate, async (req, res, next) => {
  try {
    const updates = profileUpdates(req.body);
    if (!Object.keys(updates).length) return res.status(400).json({ message: 'No profile updates provided' });
    if (requireDatabase(req, res)) return;

    if (!mongoReady()) {
      return res.json({ user: { ...req.user, ...updates }, mode: 'memory' });
    }

    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true }).select(
      '-password'
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.patch('/password', updatePasswordSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ message: 'Password updated', mode: 'memory' });

    const user = await User.findById(req.user._id).select('+password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (!(await user.comparePassword(req.body.currentPassword))) {
      return res.status(401).json({ message: 'Current password is incorrect' });
    }

    user.password = req.body.newPassword;
    await user.save();
    res.json({ message: 'Password updated' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
