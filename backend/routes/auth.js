const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const { body } = require('express-validator');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { demoModeEnabled, isLiveMode, mongoReady, requireDatabase } = require('../config/runtime');
const asyncHandler = require('../config/asyncHandler');
const logger = require('../config/logger');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { demoUsers, safeUser } = require('../data/demo-users');

const router = express.Router();
const memoryUsers = [...demoUsers];
const REFRESH_COOKIE = process.env.REFRESH_COOKIE_NAME || 'itruck_refresh';

const registerValidation = [
  body('firstName').trim().isLength({ min: 1, max: 80 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1, max: 80 }).withMessage('Last name is required'),
  body('email').isEmail().withMessage('Provide a valid email address').normalizeEmail(),
  body('phone').trim().isLength({ min: 6, max: 32 }).withMessage('Phone is required'),
  body('countryCode').optional({ checkFalsy: true }).trim().isLength({ min: 2, max: 8 }).withMessage('Country code is invalid'),
  body('country').trim().isLength({ min: 2, max: 80 }).withMessage('Country is required'),
  body('password').isLength({ min: 8, max: 128 }).withMessage('Password must be at least 8 characters'),
  body('accountType').optional({ checkFalsy: true }).isIn(['personal', 'business', 'ngo']).withMessage('Account type is invalid'),
  body('company').optional({ checkFalsy: true }).trim().isLength({ max: 120 }).withMessage('Company is too long'),
  validate
];

const loginValidation = [
  body('email').isEmail().withMessage('Provide a valid email address').normalizeEmail(),
  body('password').isLength({ min: 8, max: 128 }).withMessage('Password must be at least 8 characters'),
  validate
];

function parseDurationMs(value, fallbackMs) {
  const input = String(value || '').trim();
  const match = input.match(/^(\d+)(ms|s|m|h|d)?$/);
  if (!match) return fallbackMs;

  const amount = Number(match[1]);
  const unit = match[2] || 'ms';
  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000
  };

  return amount * multipliers[unit];
}

function accessTokenExpiry() {
  return process.env.JWT_ACCESS_EXPIRES || process.env.JWT_EXPIRES || '7d';
}

function refreshTokenExpiry() {
  return process.env.JWT_REFRESH_EXPIRES || '7d';
}

function signToken(user) {
  return jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: accessTokenExpiry() }
  );
}

function signRefreshToken(user, sessionId) {
  return jwt.sign(
    { id: user._id, role: user.role, sid: sessionId, type: 'refresh' },
    process.env.JWT_SECRET || 'dev-secret',
    { expiresIn: refreshTokenExpiry() }
  );
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function safe(user) {
  const output = user.toObject ? user.toObject() : { ...user };
  delete output.password;
  return output;
}

function refreshCookieOptions() {
  const maxAge = parseDurationMs(refreshTokenExpiry(), 7 * 24 * 60 * 60 * 1000);
  return {
    httpOnly: true,
    secure: isLiveMode(),
    sameSite: process.env.REFRESH_COOKIE_SAMESITE || (isLiveMode() ? 'none' : 'lax'),
    path: '/api/auth',
    maxAge
  };
}

function clearRefreshCookie(res) {
  const options = refreshCookieOptions();
  delete options.maxAge;
  res.clearCookie(REFRESH_COOKIE, options);
}

function getRefreshToken(req) {
  return req.cookies?.[REFRESH_COOKIE] || req.body?.refreshToken || null;
}

async function createRefreshSession(user, req) {
  const expiresAt = new Date(Date.now() + parseDurationMs(refreshTokenExpiry(), 7 * 24 * 60 * 60 * 1000));
  const session = await RefreshToken.create({
    user: user._id,
    tokenHash: crypto.randomBytes(32).toString('hex'),
    expiresAt,
    userAgent: req.get('user-agent'),
    ip: req.ip
  });

  const refreshToken = signRefreshToken(user, session._id);
  const tokenHash = hashToken(refreshToken);
  session.tokenHash = tokenHash;
  await session.save();

  return { refreshToken, tokenHash };
}

async function sendAuthResponse(user, req, res, status = 200) {
  const token = signToken(user);
  const { refreshToken } = await createRefreshSession(user, req);
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  res.status(status).json({ token, user: safe(user) });
}

async function register(role, req, res, next) {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      if (!demoModeEnabled()) return res.status(503).json({ message: 'Demo registration disabled' });
      const exists = memoryUsers.find(user => user.email === req.body.email);
      if (exists) return res.status(409).json({ message: 'Email already registered' });

      const user = {
        _id: `demo-${role}-${Date.now()}`,
        ...req.body,
        role,
        isVerified: false,
        walletBalance: 0
      };

      memoryUsers.push(user);
      return res.status(201).json({ token: signToken(user), user: safeUser(user), mode: 'memory' });
    }

    const user = await User.create({ ...req.body, role });
    return sendAuthResponse(user, req, res, 201);
  } catch (err) {
    next(err);
  }
}

router.post('/register/owner', registerValidation, (req, res, next) => register('owner', req, res, next));
router.post('/register/client', registerValidation, (req, res, next) => register('client', req, res, next));

router.post('/login', loginValidation, asyncHandler(async (req, res) => {
  if (requireDatabase(req, res)) return;
  if (!mongoReady()) {
    if (!demoModeEnabled()) return res.status(503).json({ message: 'Demo login disabled' });
    const user = memoryUsers.find(item => item.email === req.body.email);
    if (!user || user.password !== req.body.password) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    return res.json({ token: signToken(user), user: safeUser(user), mode: 'memory' });
  }

  const user = await User.findOne({ email: req.body.email }).select('+password');
  if (!user || !(await user.comparePassword(req.body.password))) {
    return res.status(401).json({ message: 'Invalid email or password' });
  }

  user.lastLogin = new Date();
  await user.save();
  return sendAuthResponse(user, req, res);
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  if (requireDatabase(req, res)) return;

  const refreshToken = getRefreshToken(req);
  if (!refreshToken) return res.status(401).json({ message: 'Refresh token required' });

  let decoded;
  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'dev-secret');
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }

  if (decoded.type !== 'refresh' || !decoded.sid) {
    return res.status(401).json({ message: 'Invalid refresh token' });
  }

  const tokenHash = hashToken(refreshToken);
  const session = await RefreshToken.findOne({
    _id: decoded.sid,
    user: decoded.id,
    tokenHash,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  });

  if (!session) return res.status(401).json({ message: 'Refresh token revoked or expired' });

  const user = await User.findById(decoded.id);
  if (!user || user.isActive === false) {
    return res.status(401).json({ message: 'User no longer exists' });
  }

  const replacement = await createRefreshSession(user, req);
  session.revokedAt = new Date();
  session.replacedByTokenHash = replacement.tokenHash;
  await session.save();

  res.cookie(REFRESH_COOKIE, replacement.refreshToken, refreshCookieOptions());
  return res.json({ token: signToken(user), user: safe(user) });
}));

router.post('/logout', asyncHandler(async (req, res) => {
  const refreshToken = getRefreshToken(req);

  if (mongoReady() && refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'dev-secret');
      if (decoded.type === 'refresh' && decoded.sid) {
        await RefreshToken.updateOne(
          { _id: decoded.sid, tokenHash: hashToken(refreshToken), revokedAt: null },
          { $set: { revokedAt: new Date() } }
        );
      }
    } catch (err) {
      logger.warn({ err }, 'Refresh token logout cleanup skipped');
    }
  }

  clearRefreshCookie(res);
  res.json({ message: 'Logged out' });
}));

router.get('/me', protect, (req, res) => res.json({ user: req.user }));

module.exports = router;
