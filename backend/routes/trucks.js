const express = require('express');
const Truck = require('../models/Truck');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect, restrictTo } = require('../middleware/auth');
const { demoTrucks } = require('../data/demo-users');

const router = express.Router();
const memoryTrucks = [...demoTrucks];

function filterTrucks(trucks, query) {
  return trucks.filter(truck => {
    if (query.type && truck.type !== query.type) return false;
    if (query.verified === 'true' && !truck.isVerified) return false;
    return true;
  });
}

router.get('/', async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.json({ trucks: filterTrucks(memoryTrucks, req.query), mode: 'memory' });
    }

    const q = {};
    if (req.query.type) q.type = req.query.type;
    if (req.query.verified === 'true') q.isVerified = true;
    res.json({ trucks: await Truck.find(q).limit(50) });
  } catch (err) {
    next(err);
  }
});

router.post('/', protect, restrictTo('owner', 'admin'), async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const truck = { _id: `demo-truck-${Date.now()}`, ...req.body, owner: req.user._id, isAvailable: true, isVerified: false };
      memoryTrucks.unshift(truck);
      return res.status(201).json({ truck, mode: 'memory' });
    }

    res.status(201).json({ truck: await Truck.create({ ...req.body, owner: req.user._id }) });
  } catch (err) {
    next(err);
  }
});

router.get('/fleet', protect, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.json({ trucks: memoryTrucks.filter(truck => truck.owner === req.user._id), mode: 'memory' });
    }

    res.json({ trucks: await Truck.find({ owner: req.user._id }) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
