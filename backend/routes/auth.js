const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { demoModeEnabled, isLiveMode, mongoReady, requireDatabase } = require('../config/runtime');
const asyncHandler = require('../config/asyncHandler');
const logger = require('../config/logger');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } = require('../validators/auth');
const { mongoIdParam } = require('../validators/common');
const { sendMail } = require('../services/email');
const AppError = require('../utils/AppError');
const { parseDevice } = require('../utils/deviceParser');
const { demoUsers, safeUser } = require('../data/demo-users');

const router = express.Router();
const memoryUsers = [...demoUsers];
const REFRESH_COOKIE = process.env.REFRESH_COOKIE_NAME || 'itruck_refresh';
const PASSWORD_RESET_MS = 60 * 60 * 1000;
const PASSWORD_RESET_MESSAGE = 'If that email exists, password reset instructions have been sent.';

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
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'dev-secret', {
    expiresIn: accessTokenExpiry()
  });
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

function getDeviceId(req) {
  return req.get('x-device-id') || req.body?.deviceId || null;
}

function frontendBaseUrl(req) {
  return (process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

function requestIp(req) {
  return req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || null;
}

async function createRefreshSession(user, req, options = {}) {
  const deviceId = options.deviceId || getDeviceId(req);
  if (!deviceId) throw AppError.badRequest('deviceId is required');

  const expiresAt = new Date(Date.now() + parseDurationMs(refreshTokenExpiry(), 7 * 24 * 60 * 60 * 1000));
  const parsedDevice = parseDevice(req.get('user-agent') || '', requestIp(req));

  if (options.revokeExisting !== false) {
    await RefreshToken.updateMany({ user: user._id, deviceId, revokedAt: null }, { $set: { revokedAt: new Date() } });
  }

  const session = await RefreshToken.create({
    user: user._id,
    tokenHash: crypto.randomBytes(32).toString('hex'),
    expiresAt,
    deviceId,
    deviceName: options.deviceName || parsedDevice.deviceName,
    deviceType: parsedDevice.deviceType,
    ipAddress: parsedDevice.ipAddress,
    lastUsedAt: new Date(),
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
    const { deviceId: _deviceId, ...userInput } = req.body;
    if (!mongoReady()) {
      if (!demoModeEnabled()) return res.status(503).json({ message: 'Demo registration disabled' });
      const exists = memoryUsers.find((user) => user.email === req.body.email);
      if (exists) return res.status(409).json({ message: 'Email already registered' });

      const user = {
        _id: `demo-${role}-${Date.now()}`,
        ...userInput,
        role,
        isVerified: false,
        walletBalance: 0
      };

      memoryUsers.push(user);
      return res.status(201).json({ token: signToken(user), user: safeUser(user), mode: 'memory' });
    }

    const user = await User.create({ ...userInput, role });
    return sendAuthResponse(user, req, res, 201);
  } catch (err) {
    next(err);
  }
}

router.post('/register/owner', registerSchema, validate, (req, res, next) => register('owner', req, res, next));
router.post('/register/client', registerSchema, validate, (req, res, next) => register('client', req, res, next));

router.post(
  '/login',
  loginSchema,
  validate,
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      if (!demoModeEnabled()) return res.status(503).json({ message: 'Demo login disabled' });
      const user = memoryUsers.find((item) => item.email === req.body.email);
      if (!user || user.password !== req.body.password) {
        return res.status(401).json({ message: 'Invalid email or password' });
      }

      return res.json({ token: signToken(user), user: safeUser(user), mode: 'memory' });
    }

    const user = await User.findOne({ email: req.body.email }).select('+password');
    if (!user || !(await user.comparePassword(req.body.password))) {
      throw AppError.unauthorized('Invalid email or password');
    }

    user.lastLogin = new Date();
    await user.save();
    return sendAuthResponse(user, req, res);
  })
);

router.post(
  '/forgot-password',
  forgotPasswordSchema,
  validate,
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ message: PASSWORD_RESET_MESSAGE, mode: 'memory' });

    const user = await User.findOne({ email: req.body.email });
    if (user && user.isActive !== false) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.passwordResetToken = hashToken(resetToken);
      user.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_MS);
      await user.save({ validateBeforeSave: false });

      const resetUrl = `${frontendBaseUrl(req)}/app/profile?reset=${resetToken}&email=${encodeURIComponent(user.email)}`;
      try {
        await sendMail({
          to: user.email,
          subject: 'Reset your iTruck password',
          text: `Use this secure link to reset your iTruck password: ${resetUrl}`,
          html: `<p>Use this secure link to reset your iTruck password:</p><p><a href="${resetUrl}">Reset password</a></p>`
        });
      } catch (err) {
        logger.warn({ err, userId: user._id }, 'Password reset email failed');
      }
    }

    res.json({ message: PASSWORD_RESET_MESSAGE });
  })
);

router.post(
  '/reset-password',
  resetPasswordSchema,
  validate,
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) throw AppError.badRequest('Password reset is unavailable until a database session exists');

    const user = await User.findOne({
      email: req.body.email,
      passwordResetToken: hashToken(req.body.token),
      passwordResetExpires: { $gt: new Date() }
    }).select('+password');

    if (!user) throw AppError.unauthorized('Password reset link is invalid or expired');

    user.password = req.body.password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    await RefreshToken.revokeAll(user._id);

    return res.json({ message: 'Password updated. Sign in with your new password.' });
  })
);

router.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) throw AppError.unauthorized('Refresh is unavailable until a database session exists');

    const refreshToken = getRefreshToken(req);
    const deviceId = getDeviceId(req);
    if (!refreshToken) throw AppError.unauthorized('Refresh token required');
    if (!deviceId) throw AppError.unauthorized('Device id required');

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_SECRET || 'dev-secret');
    } catch (_err) {
      throw AppError.unauthorized('Invalid or expired refresh token');
    }

    if (decoded.type !== 'refresh' || !decoded.sid) {
      throw AppError.unauthorized('Invalid refresh token');
    }

    const tokenHash = hashToken(refreshToken);
    const session = await RefreshToken.findActive(tokenHash);

    if (!session || String(session._id) !== String(decoded.sid) || String(session.user) !== String(decoded.id)) {
      const compromised = await RefreshToken.findOne({ _id: decoded.sid, user: decoded.id, tokenHash });
      if (compromised?.revokedAt || compromised?.replacedByTokenHash) {
        await RefreshToken.revokeAll(compromised.user);
        clearRefreshCookie(res);
      }
      throw AppError.unauthorized('Refresh token revoked or expired');
    }

    if (session.deviceId && session.deviceId !== deviceId) {
      await session.revoke();
      clearRefreshCookie(res);
      throw AppError.unauthorized('Device mismatch. Please log in again.');
    }

    const user = await User.findById(decoded.id);
    if (!user || user.isActive === false) {
      throw AppError.unauthorized('User no longer exists');
    }

    session.deviceId = session.deviceId || deviceId;
    session.lastUsedAt = new Date();

    const replacement = await createRefreshSession(user, req, {
      deviceId,
      deviceName: session.deviceName,
      revokeExisting: false
    });
    session.revokedAt = new Date();
    session.replacedByTokenHash = replacement.tokenHash;
    await session.save();

    res.cookie(REFRESH_COOKIE, replacement.refreshToken, refreshCookieOptions());
    return res.json({ token: signToken(user), user: safe(user) });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
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
  })
);

router.get('/me', protect, (req, res) => res.json({ user: req.user }));

router.get(
  '/sessions',
  protect,
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ sessions: [], mode: 'memory' });

    const sessions = await RefreshToken.activeSessions(req.user._id);
    const refreshToken = getRefreshToken(req);
    const current = refreshToken ? await RefreshToken.findActive(hashToken(refreshToken)) : null;
    const currentDeviceId = current?.deviceId || getDeviceId(req);

    res.json({
      sessions: sessions.map((session) => ({
        id: session._id,
        deviceId: session.deviceId,
        deviceName: session.deviceName,
        deviceType: session.deviceType,
        ipAddress: session.ipAddress,
        lastUsedAt: session.lastUsedAt,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
        isCurrent: Boolean(currentDeviceId && session.deviceId === currentDeviceId)
      }))
    });
  })
);

router.delete(
  '/sessions',
  protect,
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ message: 'Sessions cleared', mode: 'memory' });

    const everywhere = req.query.everywhere === 'true';
    const refreshToken = getRefreshToken(req);
    const current = refreshToken ? await RefreshToken.findActive(hashToken(refreshToken)) : null;
    const keepDeviceId = everywhere ? null : current?.deviceId;

    await RefreshToken.revokeAll(req.user._id, keepDeviceId);
    if (everywhere) clearRefreshCookie(res);
    res.json({ message: everywhere ? 'All sessions revoked' : 'All other sessions revoked' });
  })
);

router.delete(
  '/sessions/:sessionId',
  protect,
  mongoIdParam('sessionId'),
  validate,
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ message: 'Session revoked', mode: 'memory' });

    const session = await RefreshToken.findOne({
      _id: req.params.sessionId,
      user: req.user._id,
      revokedAt: null
    });

    if (!session) throw AppError.notFound('Session not found');
    await session.revoke();
    res.json({ message: 'Session revoked' });
  })
);

module.exports = router;
