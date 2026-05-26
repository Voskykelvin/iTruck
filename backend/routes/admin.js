const express = require('express');
const User = require('../models/User');
const Truck = require('../models/Truck');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect, restrictTo } = require('../middleware/auth');
const { demoUsers, demoTrucks } = require('../data/demo-users');

const router = express.Router();
router.use(protect, restrictTo('admin'));

const demoBookings = [
  ['ITK-2044', 'Nairobi to Kampala', 'In Transit', 'On schedule'],
  ['ITK-2031', 'Mombasa to Dar es Salaam', 'Bidding', '3 offers'],
  ['ITK-2028', 'Accra to Lagos', 'Delivered', 'POD ready']
];

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
      Transaction.aggregate([{ $match: { status: 'completed' } }, { $group: { _id: null, total: { $sum: '$amount' } } }])
    ]);
    res.json({ totalUsers, totalTrucks, totalBookings, totalRevenue: totalRevenue[0]?.total || 0 });
  } catch (err) {
    next(err);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ users: demoUsers.map(({ password, ...user }) => user), mode: 'memory' });
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

router.post('/notify', (req, res) => res.json({ message: 'Broadcast queued', payload: req.body }));

module.exports = router;
