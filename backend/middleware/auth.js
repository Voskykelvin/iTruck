const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { demoModeEnabled, mongoReady } = require('../config/runtime');
const { demoUsers, safeUser } = require('../data/demo-users');

async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Authentication required' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');

    if (!mongoReady()) {
      if (!demoModeEnabled()) {
        return res.status(503).json({ message: 'Database unavailable. Live mode authentication is disabled until MongoDB is connected.' });
      }
      const demoUser = demoUsers.find(user => user._id === decoded.id);
      req.user = demoUser ? safeUser(demoUser) : { _id: decoded.id, role: decoded.role || 'client' };
      return next();
    }

    req.user = await User.findById(decoded.id).select('-password');
    if (!req.user) return res.status(401).json({ message: 'User no longer exists' });

    next();
  } catch (_err) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}

const restrictTo = (...roles) => (req, res, next) => {
  if (roles.includes(req.user?.role)) return next();
  res.status(403).json({ message: 'Forbidden' });
};

module.exports = { protect, restrictTo };
