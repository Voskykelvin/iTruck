const express = require('express');
const mongoose = require('mongoose');
const Truck = require('../models/Truck');
const Booking = require('../models/Booking');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  archiveTruckSchema,
  createTruckSchema,
  listTrucksSchema,
  ratingSchema,
  truckDocumentSchema,
  truckPhotoSchema,
  truckIdSchema
} = require('../validators/trucks');
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

function normalizePlate(value) {
  return typeof value === 'string' ? value.trim().toUpperCase() : value;
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function createTruckPayload(body, user) {
  const payload = { ...body };
  restrictedCreateFields.forEach((field) => delete payload[field]);
  payload.plateNumber = normalizePlate(payload.plateNumber);
  payload.registrationNumber = normalizePlate(payload.registrationNumber || payload.plateNumber);
  payload.chassisNumber = normalizePlate(payload.chassisNumber);
  payload.routes = normalizeList(payload.routes);
  payload.features = normalizeList(payload.features);
  payload.photos = normalizeList(payload.photos);
  return {
    ...payload,
    owner: user._id,
    isAvailable: true,
    isVerified: false
  };
}

function activeTruckFilter(extra = {}) {
  return { archivedAt: null, ...extra };
}

function filterTrucks(trucks, query) {
  return trucks.filter((truck) => {
    if (truck.archivedAt) return false;
    if (query.type && truck.type !== query.type) return false;
    if ((query.verified === true || query.verified === 'true') && !truck.isVerified) return false;
    if ((query.isAvailable === true || query.isAvailable === 'true') && !truck.isAvailable) return false;
    return true;
  });
}

function upsertDocument(documents = [], type, patch) {
  const existing = documents.find((item) => item.type === type);
  const update = {
    type,
    url: patch.url,
    fileName: patch.fileName,
    status: 'pending',
    notes: patch.notes || '',
    reviewedAt: undefined
  };

  if (existing) Object.assign(existing, update);
  else documents.push(update);
  return documents;
}

async function recomputeTruckRating(truckId) {
  const ratedBookings = await Booking.find({
    truck: truckId,
    status: 'delivered',
    'rating.clientToOwner.score': { $type: 'number' }
  }).select('rating.clientToOwner.score');

  const scores = ratedBookings.map((booking) => Number(booking.rating?.clientToOwner?.score)).filter(Number.isFinite);
  const ratingCount = scores.length;
  const ratingAverage = ratingCount
    ? Number((scores.reduce((sum, score) => sum + score, 0) / ratingCount).toFixed(2))
    : 0;

  return Truck.findByIdAndUpdate(truckId, { ratingAverage, ratingCount }, { new: true });
}

router.get('/', listTrucksSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.json({ trucks: filterTrucks(memoryTrucks, req.query), mode: 'memory' });
    }

    const q = {};
    q.archivedAt = null;
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
      return res.json({
        trucks: memoryTrucks.filter((truck) => truck.owner === req.user._id && !truck.archivedAt),
        mode: 'memory'
      });
    }

    res.json({ trucks: await Truck.find(activeTruckFilter({ owner: req.user._id })) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', truckIdSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const truck = memoryTrucks.find(
        (item) =>
          !item.archivedAt && String(item._id || item.id || item.plateNumber || item.plate) === String(req.params.id)
      );
      if (!truck) return res.status(404).json({ message: 'Truck not found' });
      return res.json({ truck, mode: 'memory' });
    }

    const truck = await Truck.findOne(activeTruckFilter({ _id: req.params.id }));
    if (!truck) return res.status(404).json({ message: 'Truck not found' });
    res.json({ truck });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', protect, archiveTruckSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const truck = memoryTrucks.find(
        (item) =>
          !item.archivedAt && String(item._id || item.id || item.plateNumber || item.plate) === String(req.params.id)
      );
      if (!truck || (req.user.role !== 'admin' && String(truck.owner) !== String(req.user._id))) {
        return res.status(404).json({ message: 'Truck not found' });
      }

      truck.archivedAt = new Date().toISOString();
      truck.archivedBy = req.user._id;
      truck.archiveReason = req.body.reason || '';
      truck.isAvailable = false;
      return res.json({ truck, mode: 'memory' });
    }

    const query = activeTruckFilter({ _id: req.params.id });
    if (req.user.role !== 'admin') query.owner = req.user._id;

    const truck = await Truck.findOneAndUpdate(
      query,
      {
        $set: {
          archivedAt: new Date(),
          archivedBy: req.user._id,
          archiveReason: req.body.reason || '',
          isAvailable: false
        }
      },
      { new: true }
    );
    if (!truck) return res.status(404).json({ message: 'Truck not found' });

    res.json({ truck });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/photos/:photoUrl', protect, restrictTo('owner', 'admin'), async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;

    if (!mongoReady()) {
      const truck = memoryTrucks.find(
        (item) =>
          !item.archivedAt && String(item._id || item.id || item.plateNumber || item.plate) === String(req.params.id)
      );
      if (!truck || (req.user.role !== 'admin' && String(truck.owner) !== String(req.user._id))) {
        return res.status(404).json({ message: 'Truck not found' });
      }

      truck.photos = (truck.photos || []).filter((photo) => photo !== req.params.photoUrl);
      return res.json({ truck, mode: 'memory' });
    }

    const query = activeTruckFilter({ _id: req.params.id });
    if (req.user.role !== 'admin') query.owner = req.user._id;

    const truck = await Truck.findOneAndUpdate(
      query,
      { $pull: { photos: req.params.photoUrl } },
      { new: true }
    );
    if (!truck) return res.status(404).json({ message: 'Truck not found' });

    res.json({ truck });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id/photos',
  protect,
  restrictTo('owner', 'admin'),
  truckPhotoSchema,
  validate,
  async (req, res, next) => {
    try {
      if (requireDatabase(req, res)) return;

      if (!mongoReady()) {
        const truck = memoryTrucks.find(
          (item) =>
            !item.archivedAt && String(item._id || item.id || item.plateNumber || item.plate) === String(req.params.id)
        );
        if (!truck || (req.user.role !== 'admin' && String(truck.owner) !== String(req.user._id))) {
          return res.status(404).json({ message: 'Truck not found' });
        }

        truck.photos = [...new Set([...(truck.photos || []), req.body.url])];
        return res.json({ truck, mode: 'memory' });
      }

      const query = activeTruckFilter({ _id: req.params.id });
      if (req.user.role !== 'admin') query.owner = req.user._id;

      const truck = await Truck.findOneAndUpdate(
        query,
        { $addToSet: { photos: req.body.url } },
        { new: true, runValidators: true }
      );
      if (!truck) return res.status(404).json({ message: 'Truck not found' });

      res.json({ truck });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id/documents/:documentType',
  protect,
  restrictTo('owner', 'admin'),
  truckDocumentSchema,
  validate,
  async (req, res, next) => {
    try {
      if (requireDatabase(req, res)) return;

      if (!mongoReady()) {
        const truck = memoryTrucks.find(
          (item) =>
            !item.archivedAt && String(item._id || item.id || item.plateNumber || item.plate) === String(req.params.id)
        );
        if (!truck || (req.user.role !== 'admin' && String(truck.owner) !== String(req.user._id))) {
          return res.status(404).json({ message: 'Truck not found' });
        }

        truck.documents = upsertDocument(truck.documents || [], req.params.documentType, req.body);
        return res.json({ truck, mode: 'memory' });
      }

      const query = activeTruckFilter({ _id: req.params.id });
      if (req.user.role !== 'admin') query.owner = req.user._id;

      const truck = await Truck.findOne(query);
      if (!truck) return res.status(404).json({ message: 'Truck not found' });

      truck.documents = upsertDocument(truck.documents || [], req.params.documentType, req.body);
      await truck.save();
      res.json({ truck });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/:id/ratings', protect, ratingSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;

    const score = Number(req.body.score);
    const comment = req.body.comment || '';

    if (!mongoReady()) {
      return res.status(409).json({ message: 'Ratings require a delivered synced booking' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: 'Invalid truck id' });
    }

    const truck = await Truck.findOne(activeTruckFilter({ _id: req.params.id }));
    if (!truck) return res.status(404).json({ message: 'Truck not found' });

    const bookingFilter = {
      _id: req.body.bookingId,
      truck: truck._id,
      status: 'delivered'
    };
    if (req.user.role !== 'admin') {
      bookingFilter.client = req.user._id;
    }
    const booking = await Booking.findOne(bookingFilter);
    if (!booking) return res.status(403).json({ message: 'Rate this carrier after a delivered booking' });

    booking.rating = {
      ...(booking.rating || {}),
      clientToOwner: { score, comment, user: req.user._id, createdAt: new Date() }
    };
    await booking.save();

    res.json({ truck: await recomputeTruckRating(truck._id), booking });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
