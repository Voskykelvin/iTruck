const express = require('express');
const mongoose = require('mongoose');
const Truck = require('../models/Truck');
const Booking = require('../models/Booking');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { createTruckSchema, listTrucksSchema, ratingSchema, truckIdSchema } = require('../validators/trucks');
const { demoTrucks } = require('../data/demo-users');

const router = express.Router();
const memoryTrucks = [...demoTrucks];
const restrictedCreateFields = new Set([
  'owner',
  'isVerified',
  'ratingAverage',
  'ratingCount',
  'completedTrips',
  'documents'
]);

function createTruckPayload(body, user) {
  const payload = { ...body };
  restrictedCreateFields.forEach((field) => delete payload[field]);
  return {
    ...payload,
    owner: user._id,
    isAvailable: true,
    isVerified: false
  };
}

function filterTrucks(trucks, query) {
  return trucks.filter((truck) => {
    if (query.type && truck.type !== query.type) return false;
    if ((query.verified === true || query.verified === 'true') && !truck.isVerified) return false;
    if ((query.isAvailable === true || query.isAvailable === 'true') && !truck.isAvailable) return false;
    return true;
  });
}

router.get('/', listTrucksSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.json({ trucks: filterTrucks(memoryTrucks, req.query), mode: 'memory' });
    }

    const q = {};
    if (req.query.type) q.type = req.query.type;
    if (req.query.verified === true || req.query.verified === 'true') q.isVerified = true;
    if (req.query.isAvailable === true || req.query.isAvailable === 'true') q.isAvailable = true;
    if (req.query.minCapacity !== undefined)
      q.capacityTonnes = { ...(q.capacityTonnes || {}), $gte: req.query.minCapacity };
    if (req.query.maxPrice !== undefined) q.pricePerKm = { $lte: req.query.maxPrice };
    res.json({ trucks: await Truck.find(q).limit(req.query.limit || 50) });
  } catch (err) {
    next(err);
  }
});

router.post('/', protect, restrictTo('owner', 'admin'), createTruckSchema, validate, async (req, res, next) => {
  try {
    const payload = createTruckPayload(req.body, req.user);

    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const truck = { _id: `demo-truck-${Date.now()}`, ...payload };
      memoryTrucks.unshift(truck);
      return res.status(201).json({ truck, mode: 'memory' });
    }

    res.status(201).json({ truck: await Truck.create(payload) });
  } catch (err) {
    next(err);
  }
});

router.get('/fleet', protect, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.json({ trucks: memoryTrucks.filter((truck) => truck.owner === req.user._id), mode: 'memory' });
    }

    res.json({ trucks: await Truck.find({ owner: req.user._id }) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', truckIdSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const truck = memoryTrucks.find(
        (item) => String(item._id || item.id || item.plateNumber || item.plate) === String(req.params.id)
      );
      if (!truck) return res.status(404).json({ message: 'Truck not found' });
      return res.json({ truck, mode: 'memory' });
    }

    const truck = await Truck.findById(req.params.id);
    if (!truck) return res.status(404).json({ message: 'Truck not found' });
    res.json({ truck });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/ratings', protect, ratingSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;

    const score = Number(req.body.score);
    const comment = req.body.comment || '';

    if (!mongoReady()) {
      const truck = memoryTrucks.find(
        (item) => String(item._id || item.id || item.plateNumber || item.plate) === String(req.params.id)
      );
      if (!truck) return res.status(404).json({ message: 'Truck not found' });

      const ratingCount = Number(truck.ratingCount || 0);
      const currentAverage = Number(truck.ratingAverage || truck.rating || 0);
      const nextCount = ratingCount + 1;
      truck.ratingAverage = Number(((currentAverage * ratingCount + score) / nextCount).toFixed(2));
      truck.ratingCount = nextCount;
      truck.rating = truck.ratingAverage;
      return res.json({ truck, mode: 'memory' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid truck id' });
    }

    const truck = await Truck.findById(req.params.id);
    if (!truck) return res.status(404).json({ message: 'Truck not found' });

    const ratingCount = Number(truck.ratingCount || 0);
    const currentAverage = Number(truck.ratingAverage || 0);
    const nextCount = ratingCount + 1;
    truck.ratingAverage = Number(((currentAverage * ratingCount + score) / nextCount).toFixed(2));
    truck.ratingCount = nextCount;
    await truck.save();

    if (req.body.bookingId && mongoose.Types.ObjectId.isValid(req.body.bookingId)) {
      const bookingFilter = { _id: req.body.bookingId, truck: truck._id };
      if (req.user.role !== 'admin') {
        bookingFilter.$or = [{ client: req.user._id }, { owner: req.user._id }, { 'bids.owner': req.user._id }];
      }
      await Booking.findOneAndUpdate(bookingFilter, { rating: { score, comment } });
    }

    res.json({ truck });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
