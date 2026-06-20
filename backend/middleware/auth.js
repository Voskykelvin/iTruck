const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { demoModeEnabled, mongoReady } = require('../config/runtime');
const { demoUsers, safeUser } = require('../data/demo-users');

async function protect(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required' });

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
  } catch (_err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  try {
    if (!mongoReady()) {
      if (!demoModeEnabled()) {
        return res
          .status(503)
          .json({ message: 'Database unavailable. Live mode authentication is disabled until MongoDB is connected.' });
      }
      const demoUser = demoUsers.find((user) => user._id === decoded.id);
      req.user = demoUser ? safeUser(demoUser) : { _id: decoded.id, role: decoded.role || 'client' };
      return next();
    }

    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ message: 'User no longer exists' });
    if (req.user.isActive === false) return res.status(403).json({ message: 'Account is disabled' });

    next();
  } catch (err) {
    next(err);
  }
}

const restrictTo =
  (...roles) =>
  (req, res, next) => {
    if (roles.includes(req.user?.role)) return next();
    res.status(403).json({ message: 'Forbidden' });
  };

module.exports = { protect, restrictTo };
