const express = require('express');
const Booking = require('../models/Booking');
const Truck = require('../models/Truck');
const User = require('../models/User');
const matching = require('../services/matching');
const { recordUploadedDocument } = require('../services/documentRecords');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  bookingIdSchema,
  bookingDocumentUploadSchema,
  bookingRatingSchema,
  acceptBidSchema,
  createBookingSchema,
  listBookingsSchema,
  submitBidSchema,
  updateStatusSchema
} = require('../validators/bookings');
const { normalizeBookingDocumentType } = require('../utils/documentTypes');

const router = express.Router();
router.use(protect);

const memoryBookings = [
  {
    _id: 'ITK-2044',
    client: 'demo-client-primary',
    owner: 'demo-owner-primary',
    truck: 'demo-truck-isuzu',
    pickup: 'Nairobi',
    destination: 'Kampala',
    pickupDate: new Date().toISOString(),
    vehicleType: 'Lorry',
    cargo: 'Retail stock',
    weight: '8 tonnes',
    budget: 1260,
    paymentMethod: 'M-Pesa',
    status: 'in_transit',
    bids: [],
    tracking: [{ lat: -0.3031, lng: 36.08, speed: 72, heading: 291, timestamp: new Date().toISOString() }],
    createdAt: new Date().toISOString()
  },
  {
    _id: 'ITK-2031',
    client: 'demo-client-secondary',
    pickup: 'Mombasa',
    destination: 'Dar es Salaam',
    vehicleType: 'Trailer',
    cargo: 'Machine parts',
    weight: '18 tonnes',
    budget: 2860,
    paymentMethod: 'Card escrow',
    status: 'bidding',
    bids: [
      {
        owner: 'demo-owner-secondary',
        amount: 3040,
        message: 'Fleet is available for the requested pickup window.',
        status: 'pending',
        createdAt: new Date().toISOString()
      }
    ],
    tracking: [],
    createdAt: new Date().toISOString()
  }
];

function bookingVisibleTo(user, booking) {
  if (user.role === 'admin') return true;
  if (user.role === 'client') return String(booking.client) === String(user._id);
  if (user.role === 'owner') {
    return (
      String(booking.owner) === String(user._id) ||
      (booking.bids || []).some((bid) => String(bid.owner) === String(user._id))
    );
  }
  return false;
}

function bookingOpenForBids(booking) {
  return ['pending', 'bidding'].includes(booking.status) && !booking.owner;
}

function canManageBookingStatus(user, booking) {
  if (user.role === 'admin') return true;
  return user.role === 'owner' && String(booking.owner) === String(user._id);
}

function canAcceptBid(user, booking) {
  if (user.role === 'admin') return true;
  return user.role === 'client' && String(booking.client?._id || booking.client) === String(user._id);
}

function canConfirmDelivery(user, booking) {
  if (user.role === 'admin') return true;
  return user.role === 'client' && String(booking.client?._id || booking.client) === String(user._id);
}

function findBid(booking, bidId) {
  if (booking.bids?.id) return booking.bids.id(bidId);
  return (booking.bids || []).find((bid) =>
    [bid._id, bid.id, bid.owner, bid.truck].some((value) => value && String(value) === String(bidId))
  );
}

function acceptBidOnBooking(booking, bidId, _ownerUserId) {
  if (booking.status !== 'bidding') {
    const err = new Error('Booking is not ready for bid acceptance');
    err.status = 409;
    throw err;
  }

  const bid = findBid(booking, bidId);
  if (!bid) {
    const err = new Error('Bid not found');
    err.status = 404;
    throw err;
  }

  booking.bids.forEach((item) => {
    const isThis = String(item._id || item.id) === String(bidId);
    item.status = isThis ? 'accepted' : 'rejected';
  });
  bid.status = 'accepted';
  booking.owner = bid.owner;
  if (bid.truck) booking.truck = bid.truck;

  if (typeof booking.transitionTo === 'function') {
    booking.transitionTo('confirmed');
  } else {
    Booking.assertStatusTransition(booking.status, 'confirmed');
    booking.status = 'confirmed';
  }
  return booking;
}

function normalizeOptionalServices(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim())
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  return [];
}

function cleanBookingPayload(body) {
  const payload = {
    ...body,
    optionalServices: normalizeOptionalServices(body.optionalServices),
    quoteAcknowledged:
      body.quoteAcknowledged === true || body.quoteAcknowledged === 'true' || body.quoteAcknowledged === 'on'
  };

  if (payload.distance !== undefined && payload.distance !== '') payload.distance = Number(payload.distance);
  if (payload.cargoValue !== undefined && payload.cargoValue !== '') payload.cargoValue = Number(payload.cargoValue);
  if (payload.budget !== undefined && payload.budget !== '') payload.budget = Number(payload.budget);
  if (!payload.truck) delete payload.truck;
  payload.estimate = matching.buildEstimate(payload);
  return payload;
}

function emitBooking(req, bookingId, event, booking) {
  const io = req.app.get('io');
  if (io?.emitToBooking) io.emitToBooking(bookingId, event, booking);
}

function upsertBookingDocument(documents = [], type, patch) {
  const documentType = normalizeBookingDocumentType(type);
  const existing = documents.find((item) => normalizeBookingDocumentType(item.type) === documentType);
  const urls = Array.isArray(patch.urls) && patch.urls.length ? patch.urls : patch.url ? [patch.url] : [];
  const fileNames =
    Array.isArray(patch.fileNames) && patch.fileNames.length ? patch.fileNames : patch.fileName ? [patch.fileName] : [];
  const update = {
    type: documentType,
    url: patch.url || urls[0],
    urls,
    fileName: patch.fileName || fileNames[0],
    fileNames,
    status: 'pending',
    notes: patch.notes || '',
    reviewedAt: undefined,
    generatedAt: new Date()
  };

  if (existing) Object.assign(existing, update);
  else documents.push(update);
  return documents;
}

function averageScore(bookings, path) {
  const scores = bookings
    .map((booking) => path.split('.').reduce((value, key) => value?.[key], booking))
    .map(Number)
    .filter(Number.isFinite);

  return {
    count: scores.length,
    average: scores.length ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2)) : 0
  };
}

async function recomputeTruckRating(truckId) {
  if (!truckId) return null;
  const bookings = await Booking.find({
    truck: truckId,
    status: 'delivered',
    'rating.clientToOwner.score': { $type: 'number' }
  }).select('rating.clientToOwner.score');
  const rating = averageScore(bookings, 'rating.clientToOwner.score');
  return Truck.findByIdAndUpdate(truckId, { ratingAverage: rating.average, ratingCount: rating.count }, { new: true });
}

async function recomputeUserRating(userId, direction) {
  if (!userId) return null;
  const field = direction === 'owner' ? 'rating.clientToOwner.score' : 'rating.ownerToClient.score';
  const query =
    direction === 'owner'
      ? { owner: userId, status: 'delivered', [field]: { $type: 'number' } }
      : { client: userId, status: 'delivered', [field]: { $type: 'number' } };

  const bookings = await Booking.find(query).select(field);
  const rating = averageScore(bookings, field);
  return User.findByIdAndUpdate(userId, { rating: rating.average, ratingCount: rating.count }, { new: true }).select(
    'firstName lastName company role rating ratingCount'
  );
}

function ratingTargetFor(user, booking, requestedTarget) {
  if (user.role === 'admin') return requestedTarget || 'owner';
  if (user.role === 'client' && String(booking.client?._id || booking.client) === String(user._id)) return 'owner';
  if (user.role === 'owner' && String(booking.owner?._id || booking.owner) === String(user._id)) return 'client';
  return null;
}

router.get('/', listBookingsSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.json({
        bookings: memoryBookings.filter((booking) => bookingVisibleTo(req.user, booking)),
        mode: 'memory'
      });
    }

    const q =
      req.user.role === 'client'
        ? { client: req.user._id }
        : req.user.role === 'owner'
          ? { $or: [{ owner: req.user._id }, { 'bids.owner': req.user._id }] }
          : {};

    if (req.query.status) q.status = req.query.status;
    res.json({
      bookings: await Booking.find(q)
        .sort('-createdAt')
        .limit(req.query.limit || 50)
    });
  } catch (err) {
    next(err);
  }
});

router.get('/open', restrictTo('owner', 'admin'), async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;

    if (!mongoReady()) {
      return res.json({
        bookings: memoryBookings.filter((booking) => ['pending', 'bidding'].includes(booking.status)),
        mode: 'memory'
      });
    }

    const q = {
      status: { $in: ['pending', 'bidding'] },
      $or: [{ owner: { $exists: false } }, { owner: null }]
    };

    res.json({
      bookings: await Booking.find(q)
        .populate('client', 'firstName lastName company country')
        .sort('-createdAt')
        .limit(100)
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', bookingIdSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const booking = memoryBookings.find((item) => item._id === req.params.id || item.id === req.params.id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });
      if (!bookingVisibleTo(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });
      return res.json({ booking, mode: 'memory' });
    }

    const booking = await Booking.findById(req.params.id).populate('truck owner client');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (!bookingVisibleTo(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

router.post('/', createBookingSchema, validate, async (req, res, next) => {
  try {
    const payload = cleanBookingPayload(req.body);
    if (requireDatabase(req, res)) return;

    if (!mongoReady()) {
      const booking = {
        _id: `ITK-${Date.now().toString().slice(-6)}`,
        ...payload,
        client: req.user._id,
        status: 'bidding',
        bids: [],
        tracking: [],
        createdAt: new Date().toISOString()
      };
      memoryBookings.unshift(booking);
      return res.status(201).json({ booking, mode: 'memory' });
    }

    res.status(201).json({ booking: await Booking.create({ ...payload, client: req.user._id, status: 'bidding' }) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/bids', restrictTo('owner', 'admin'), submitBidSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const booking = memoryBookings.find((item) => item._id === req.params.id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });
      if (!bookingOpenForBids(booking)) return res.status(409).json({ message: 'Booking is not open for bids' });

      booking.bids = booking.bids || [];
      booking.bids.push({ ...req.body, owner: req.user._id, status: 'pending', createdAt: new Date().toISOString() });
      if (booking.status === 'pending') Booking.assertStatusTransition(booking.status, 'bidding');
      if (booking.status === 'pending') booking.status = 'bidding';
      emitBooking(req, booking._id, 'bid-created', booking);
      return res.json({ booking, mode: 'memory' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (!bookingOpenForBids(booking)) return res.status(409).json({ message: 'Booking is not open for bids' });

    booking.bids.push({ ...req.body, owner: req.user._id });
    if (booking.status === 'pending') booking.transitionTo('bidding');
    await booking.save();

    emitBooking(req, booking._id, 'bid-created', booking);
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

router.patch(
  '/:id/bids/:bidId/accept',
  restrictTo('client', 'admin'),
  acceptBidSchema,
  validate,
  async (req, res, next) => {
    try {
      if (requireDatabase(req, res)) return;
      if (!mongoReady()) {
        const booking = memoryBookings.find((item) => item._id === req.params.id);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        if (!canAcceptBid(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });

        acceptBidOnBooking(booking, req.params.bidId, req.user._id);
        emitBooking(req, booking._id, 'bid-accepted', booking);
        return res.json({ booking, mode: 'memory' });
      }

      const booking = await Booking.findById(req.params.id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });
      if (!canAcceptBid(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });

      acceptBidOnBooking(booking, req.params.bidId, req.user._id);
      await booking.save();

      emitBooking(req, booking._id, 'bid-accepted', booking);
      res.json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id/confirm-delivery',
  restrictTo('client', 'admin'),
  bookingIdSchema,
  validate,
  async (req, res, next) => {
    try {
      if (requireDatabase(req, res)) return;
      if (!mongoReady()) {
        const booking = memoryBookings.find((item) => item._id === req.params.id);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        if (!canConfirmDelivery(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });

        Booking.assertStatusTransition(booking.status, 'delivered');
        booking.status = 'delivered';
        booking.deliveredAt = new Date().toISOString();
        emitBooking(req, booking._id, 'delivery-confirmed', booking);
        return res.json({ booking, mode: 'memory' });
      }

      const booking = await Booking.findById(req.params.id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });
      if (!canConfirmDelivery(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });

      booking.transitionTo('delivered');
      booking.deliveredAt = new Date();
      await booking.save();

      emitBooking(req, booking._id, 'delivery-confirmed', booking);
      res.json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

router.post('/:id/ratings', bookingRatingSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;

    const score = Number(req.body.score);
    const comment = req.body.comment || '';

    if (!mongoReady()) {
      const booking = memoryBookings.find((item) => item._id === req.params.id || item.id === req.params.id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });
      if (booking.status !== 'delivered') return res.status(409).json({ message: 'Rate after delivery is confirmed' });

      const target = ratingTargetFor(req.user, booking, req.body.target);
      if (!target) return res.status(403).json({ message: 'Only booking parties can rate this shipment' });

      booking.rating = booking.rating || {};
      booking.rating[target === 'owner' ? 'clientToOwner' : 'ownerToClient'] = {
        score,
        comment,
        user: req.user._id,
        createdAt: new Date().toISOString()
      };
      return res.json({ booking, mode: 'memory' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (booking.status !== 'delivered') return res.status(409).json({ message: 'Rate after delivery is confirmed' });

    const target = ratingTargetFor(req.user, booking, req.body.target);
    if (!target) return res.status(403).json({ message: 'Only booking parties can rate this shipment' });

    const detail = { score, comment, user: req.user._id, createdAt: new Date() };
    if (target === 'owner') {
      if (!booking.owner || !booking.truck) return res.status(409).json({ message: 'Carrier is not assigned' });
      booking.rating = { ...(booking.rating || {}), clientToOwner: detail };
    } else {
      if (!booking.client) return res.status(409).json({ message: 'Shipper is not assigned' });
      booking.rating = { ...(booking.rating || {}), ownerToClient: detail };
    }

    await booking.save();

    const [truck, ratedUser] =
      target === 'owner'
        ? await Promise.all([recomputeTruckRating(booking.truck), recomputeUserRating(booking.owner, 'owner')])
        : await Promise.all([Promise.resolve(null), recomputeUserRating(booking.client, 'client')]);

    res.json({ booking, truck, user: ratedUser });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', restrictTo('owner', 'admin'), updateStatusSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!req.body.status && !req.body.location) {
      return res.status(400).json({ message: 'Status or location is required' });
    }

    if (!mongoReady()) {
      const booking = memoryBookings.find((item) => item._id === req.params.id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });
      if (!canManageBookingStatus(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });

      if (req.body.status) {
        Booking.assertStatusTransition(booking.status, req.body.status);
        booking.status = req.body.status;
      }
      if (req.body.location) {
        booking.tracking = booking.tracking || [];
        booking.tracking.push({ ...req.body.location, timestamp: new Date().toISOString() });
      }
      emitBooking(req, booking._id, 'status-update', booking);
      return res.json({ booking, mode: 'memory' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (!canManageBookingStatus(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });

    if (req.body.status) booking.transitionTo(req.body.status);
    if (req.body.location) booking.tracking.push(req.body.location);
    await booking.save();

    emitBooking(req, booking._id, 'status-update', booking);
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/documents/:documentType', bookingDocumentUploadSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    const documentType = normalizeBookingDocumentType(req.params.documentType);

    if (!mongoReady()) {
      const booking = memoryBookings.find((item) => item._id === req.params.id || item.id === req.params.id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });
      if (!bookingVisibleTo(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });

      booking.documents = upsertBookingDocument(booking.documents || [], documentType, req.body);
      emitBooking(req, booking._id, 'document-updated', booking);
      return res.json({ booking, mode: 'memory' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (!bookingVisibleTo(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });

    booking.documents = upsertBookingDocument(booking.documents || [], documentType, req.body);
    await booking.save();
    await recordUploadedDocument({
      targetType: 'booking',
      targetId: booking._id,
      type: documentType,
      userId: req.user._id,
      uploadedBy: req.user._id,
      bookingId: booking._id,
      patch: req.body,
      metadata: {
        client: booking.client,
        owner: booking.owner,
        truck: booking.truck
      }
    });
    emitBooking(req, booking._id, 'document-updated', booking);
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
