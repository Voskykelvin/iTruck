const express = require('express');
const User = require('../models/User');
const Truck = require('../models/Truck');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  documentReviewSchema,
  notifySchema,
  truckVerificationSchema,
  userStatusSchema,
  userVerificationSchema
} = require('../validators/admin');
const { demoUsers, demoTrucks } = require('../data/demo-users');

const router = express.Router();
router.use(protect, restrictTo('admin'));

const demoBookings = [
  ['ITK-1001', 'Pickup hub to delivery hub', 'In Transit', 'On schedule'],
  ['ITK-1002', 'Port lane to regional warehouse', 'Bidding', 'Offers pending'],
  ['ITK-1003', 'Distribution center to receiver', 'Delivered', 'POD ready']
];

async function recordAudit(req, action, targetType, targetId, metadata = {}) {
  if (!mongoReady()) return null;
  return AuditLog.create({
    admin: req.user._id,
    action,
    targetType,
    targetId: String(targetId),
    metadata,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
}

function upsertDocument(documents = [], type, patch) {
  const existing = documents.find((item) => item.type === type);
  if (existing) {
    existing.status = patch.status;
    if (patch.url) existing.url = patch.url;
    if (patch.notes) existing.notes = patch.notes;
    existing.reviewedAt = new Date();
    return documents;
  }

  documents.push({
    type,
    status: patch.status,
    url: patch.url,
    notes: patch.notes,
    reviewedAt: new Date()
  });
  return documents;
}

router.get('/stats', async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.json({
        totalUsers: demoUsers.length,
        totalTrucks: demoTrucks.length,
        totalBookings: demoBookings.length,
        totalRevenue: 4820,
        mode: 'memory'
      });
    }

    const [totalUsers, totalTrucks, totalBookings, totalRevenue] = await Promise.all([
      User.countDocuments(),
      Truck.countDocuments(),
      Booking.countDocuments(),
      Transaction.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);
    res.json({ totalUsers, totalTrucks, totalBookings, totalRevenue: totalRevenue[0]?.total || 0 });
  } catch (err) {
    next(err);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady())
      return res.json({ users: demoUsers.map(({ password: _password, ...user }) => user), mode: 'memory' });
    res.json({ users: await User.find().limit(100) });
  } catch (err) {
    next(err);
  }
});

router.get('/trucks', async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ trucks: demoTrucks, mode: 'memory' });
    res.json({ trucks: await Truck.find().limit(100) });
  } catch (err) {
    next(err);
  }
});

router.get('/bookings', async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ bookings: demoBookings, mode: 'memory' });
    res.json({ bookings: await Booking.find().limit(100) });
  } catch (err) {
    next(err);
  }
});

router.get('/payments', async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.json({
        transactions: [
          { id: 'TX-991', method: 'Wallet escrow', amount: 920, status: 'held' },
          { id: 'TX-992', method: 'M-Pesa', amount: 1260, status: 'pending release' },
          { id: 'TX-993', method: 'Card escrow', amount: 780, status: 'paid' }
        ],
        mode: 'memory'
      });
    }
    res.json({ transactions: await Transaction.find().limit(100) });
  } catch (err) {
    next(err);
  }
});

router.get('/audit-logs', async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ logs: [], mode: 'memory' });

    const logs = await AuditLog.find().populate('admin', 'firstName lastName email role').sort('-createdAt').limit(100);

    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

router.patch('/users/:id/status', userStatusSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const user = demoUsers.find((item) => item._id === req.params.id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      user.isActive = req.body.isActive;
      return res.json({ user, mode: 'memory' });
    }

    const user = await User.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found' });

    await recordAudit(req, 'user.status.updated', 'user', user._id, { isActive: user.isActive });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.patch('/users/:id/verification', userVerificationSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const user = demoUsers.find((item) => item._id === req.params.id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      user.isVerified = req.body.isVerified;
      return res.json({ user, mode: 'memory' });
    }

    const user = await User.findByIdAndUpdate(req.params.id, { isVerified: req.body.isVerified }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found' });

    await recordAudit(req, 'user.verification.updated', 'user', user._id, { isVerified: user.isVerified });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.patch('/trucks/:id/verification', truckVerificationSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const truck = demoTrucks.find((item) => item._id === req.params.id);
      if (!truck) return res.status(404).json({ message: 'Truck not found' });
      truck.isVerified = req.body.isVerified;
      return res.json({ truck, mode: 'memory' });
    }

    const truck = await Truck.findByIdAndUpdate(req.params.id, { isVerified: req.body.isVerified }, { new: true });
    if (!truck) return res.status(404).json({ message: 'Truck not found' });

    await recordAudit(req, 'truck.verification.updated', 'truck', truck._id, { isVerified: truck.isVerified });
    res.json({ truck });
  } catch (err) {
    next(err);
  }
});

router.patch('/users/:id/documents/:documentType', documentReviewSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const user = demoUsers.find((item) => item._id === req.params.id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      user.documents = upsertDocument(user.documents || [], req.params.documentType, req.body);
      return res.json({ user, mode: 'memory' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.documents = upsertDocument(user.documents || [], req.params.documentType, req.body);
    await user.save();

    await recordAudit(req, 'user.document.reviewed', 'document', user._id, {
      documentType: req.params.documentType,
      status: req.body.status
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.patch('/trucks/:id/documents/:documentType', documentReviewSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const truck = demoTrucks.find((item) => item._id === req.params.id);
      if (!truck) return res.status(404).json({ message: 'Truck not found' });
      truck.documents = upsertDocument(truck.documents || [], req.params.documentType, req.body);
      return res.json({ truck, mode: 'memory' });
    }

    const truck = await Truck.findById(req.params.id);
    if (!truck) return res.status(404).json({ message: 'Truck not found' });
    truck.documents = upsertDocument(truck.documents || [], req.params.documentType, req.body);
    await truck.save();

    await recordAudit(req, 'truck.document.reviewed', 'document', truck._id, {
      documentType: req.params.documentType,
      status: req.body.status
    });
    res.json({ truck });
  } catch (err) {
    next(err);
  }
});

router.post('/notify', notifySchema, validate, async (req, res, next) => {
  try {
    await recordAudit(req, 'notification.broadcast.queued', 'notification', 'broadcast', { payload: req.body });
    res.json({ message: 'Broadcast queued', payload: req.body });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
