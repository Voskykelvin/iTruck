const express = require('express');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { updatePasswordSchema, updateProfileSchema } = require('../validators/users');

const router = express.Router();

router.use(protect);

router.get('/profile', (req, res) => res.json({ user: req.user }));

router.patch('/profile', updateProfileSchema, validate, (req, res) => {
  res.json({ message: 'Profile update endpoint ready', updates: req.body });
});

router.patch('/password', updatePasswordSchema, validate, (req, res) => {
  res.json({ message: 'Password update endpoint ready' });
});

module.exports = router;
