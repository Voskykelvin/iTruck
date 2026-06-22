const express = require('express');
const mongoose = require('mongoose');
const Booking = require('../models/Booking');
const Truck = require('../models/Truck');
const User = require('../models/User');
const matching = require('../services/matching');
const bidding = require('../services/bidding');
const { recordUploadedDocument } = require('../services/documentRecords');
const notifications = require('../services/notifications');
const {
  assertDeliveryGeofence,
  assertDeliveryProofForDelivery,
  assertReceiverGradeDeliveryProof,
  assertOwnerCanBid
} = require('../services/operationsPolicy');
const { recordDeliveryConfirmation } = require('../services/deliveryProof');
const { isLiveMode, mongoReady, requireDatabase } = require('../config/runtime');
const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  bookingIdSchema,
  bidActionSchema,
  bookingDocumentUploadSchema,
  bookingRatingSchema,
  confirmDeliverySchema,
  acceptBidSchema,
  counterBidSchema,
  counterResponseSchema,
  createBookingSchema,
  listBookingsSchema,
  rejectBidSchema,
  submitBidSchema,
  trackingBatchSchema,
  trackingLocationSchema,
  updateStatusSchema,
  withdrawBidSchema
} = require('../validators/bookings');
const { normalizeBookingDocumentType } = require('../utils/documentTypes');
const maps = require('../services/maps');
const { bookingQueryForUser, bookingVisibleTo, canManageBookingStatus } = require('../services/bookingAccess');
const { recordAudit } = require('../services/audit');

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

function bookingOpenForBids(booking) {
  return ['pending', 'bidding'].includes(booking.status) && !booking.owner;
}

function canAcceptBid(user, booking) {
  if (user.role === 'admin') return true;
  return user.role === 'client' && String(booking.client?._id || booking.client) === String(user._id);
}

function canConfirmDelivery(user, booking) {
  if (user.role === 'admin') return true;
  return user.role === 'client' && String(booking.client?._id || booking.client) === String(user._id);
}

function acceptBidOnBooking(booking, bidId, _ownerUserId) {
  if (booking.status !== 'bidding') {
    const err = new Error('Booking is not ready for bid acceptance');
    err.status = 409;
    throw err;
  }

  const bid = bidding.acceptBid(booking, bidId, _ownerUserId);
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

function normalizeCoordinates(value) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return { lat, lng };
}

function normalizeTrackingPoint(value = {}) {
  const point = {
    lat: Number(value.lat),
    lng: Number(value.lng),
    timestamp: value.timestamp ? new Date(value.timestamp) : new Date()
  };
  if (value.speed !== undefined && value.speed !== '') point.speed = Number(value.speed);
  if (value.heading !== undefined && value.heading !== '') point.heading = Number(value.heading);
  if (value.accuracy !== undefined && value.accuracy !== '') point.accuracy = Number(value.accuracy);
  return point;
}

function orderedTrackingUpdates(updates = []) {
  return [...updates].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

function lastKnownLocation(point, ingestedAt = new Date()) {
  if (!point) return undefined;
  const location = {
    lat: point.lat,
    lng: point.lng,
    recordedAt: point.timestamp || ingestedAt,
    ingestedAt
  };
  ['speed', 'heading', 'accuracy'].forEach((key) => {
    if (point[key] !== undefined) location[key] = point[key];
  });
  return location;
}

function recordLatestLocation(booking, point, ingestedAt = new Date()) {
  const location = lastKnownLocation(point, ingestedAt);
  if (location) booking.lastKnownLocation = location;
  return location;
}

function trackingAllowed(booking) {
  return ['confirmed', 'in_transit', 'delivery_pending'].includes(booking.status);
}

function pushMemoryTracking(booking, updates) {
  booking.tracking = [...(booking.tracking || []), ...updates].slice(-1000);
  recordLatestLocation(booking, updates[updates.length - 1]);
  return booking;
}

function cleanBookingPayload(body) {
  const loadMode = matching.normalizeLoadMode(body.loadMode);
  const payload = {
    ...body,
    loadMode,
    pickupCoordinates: normalizeCoordinates(body.pickupCoordinates),
    destinationCoordinates: normalizeCoordinates(body.destinationCoordinates),
    optionalServices: normalizeOptionalServices(body.optionalServices),
    consolidationEligible:
      loadMode === 'ltl' || body.consolidationEligible === true || body.consolidationEligible === 'true',
    quoteAcknowledged:
      body.quoteAcknowledged === true || body.quoteAcknowledged === 'true' || body.quoteAcknowledged === 'on'
  };

  if (payload.distance !== undefined && payload.distance !== '') payload.distance = Number(payload.distance);
  if (payload.cargoValue !== undefined && payload.cargoValue !== '') payload.cargoValue = Number(payload.cargoValue);
  if (payload.budget !== undefined && payload.budget !== '') payload.budget = Number(payload.budget);
  if (payload.cargoWeightTonnes !== undefined && payload.cargoWeightTonnes !== '') {
    payload.cargoWeightTonnes = Number(payload.cargoWeightTonnes);
  }
  if (payload.reservedCapacityTonnes !== undefined && payload.reservedCapacityTonnes !== '') {
    payload.reservedCapacityTonnes = Number(payload.reservedCapacityTonnes);
  }
  if (payload.deliveryGeofenceMeters !== undefined && payload.deliveryGeofenceMeters !== '') {
    payload.deliveryGeofenceMeters = Number(payload.deliveryGeofenceMeters);
  }
  if (!payload.pickupCoordinates) delete payload.pickupCoordinates;
  if (!payload.destinationCoordinates) delete payload.destinationCoordinates;
  if (!payload.truck) delete payload.truck;
  payload.routeKey = matching.routeKeyFor(payload);
  payload.estimate = matching.buildEstimate(payload);
  return payload;
}

async function enrichBookingPayload(payload) {
  try {
    const route = await maps.enrichRoute(payload);
    const enriched = { ...payload, ...route };
    enriched.routeKey = matching.routeKeyFor(enriched);
    enriched.estimate = matching.buildEstimate(enriched);
    return enriched;
  } catch (err) {
    if (isLiveMode()) throw err;
    return payload;
  }
}

function emitBooking(req, bookingId, event, booking, options = {}) {
  const io = req.app.get('io');
  if (!io?.emitToBooking) return;
  const payload = booking?.toObject ? booking.toObject() : { ...booking };
  if (options.silent) payload.silent = true;
  io.emitToBooking(bookingId, event, payload);
}

function emitTracking(req, booking, updates) {
  const io = req.app.get('io');
  if (!io?.emitToBooking) return;
  io.emitToBooking(booking._id, 'tracking-updated', {
    bookingId: booking._id,
    latest: updates[updates.length - 1],
    updates,
    booking
  });
  io.emitToBooking(booking._id, 'status-update', {
    ...(booking?.toObject ? booking.toObject() : booking),
    silent: true
  });
}

async function biddingTruckForOwner(req) {
  if (req.user.role !== 'owner') return null;

  if (!req.body.truck || !mongoose.Types.ObjectId.isValid(req.body.truck)) {
    assertOwnerCanBid(req.user, null);
  }

  const truck = await Truck.findOne({ _id: req.body.truck, owner: req.user._id });
  if (!truck) return assertOwnerCanBid(req.user, null);
  assertOwnerCanBid(req.user, truck);
  return truck;
}

async function notifyBidOwner(req, booking, bid, type, title, message, extra = {}) {
  await notifications.deliver(
    bid.owner?._id || bid.owner,
    type,
    {
      title,
      message,
      link: '/app/bids',
      bookingId: booking._id,
      bidId: bid._id || bid.id,
      ...extra
    },
    req.app.get('io')
  );
}

function emitBidUpdate(req, booking, event, bid) {
  const io = req.app.get('io');
  if (io?.emitToBooking) io.emitToBooking(booking._id, event, { booking, bid });
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

    const q = bookingQueryForUser(req.user);

    if (req.query.status) q.status = req.query.status;
    res.json({
      bookings: await Booking.find(q)
        .populate('driver', 'firstName lastName email phone role')
        .populate('bids.owner', 'firstName lastName company rating ratingCount isVerified')
        .populate('bids.truck', 'type make model plateNumber capacityTonnes ratingAverage ratingCount isVerified')
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

    const booking = await Booking.findById(req.params.id)
      .populate('truck owner client driver')
      .populate('bids.owner', 'firstName lastName company rating ratingCount isVerified')
      .populate('bids.truck', 'type make model plateNumber capacityTonnes ratingAverage ratingCount isVerified');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (!bookingVisibleTo(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

router.post('/', createBookingSchema, validate, async (req, res, next) => {
  try {
    const payload = await enrichBookingPayload(cleanBookingPayload(req.body));
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

    const truck = await biddingTruckForOwner(req);
    bidding.submitBid(booking, req.user, req.body, truck);
    if (booking.status === 'pending') booking.transitionTo('bidding');
    await booking.save();

    await notifications.deliver(
      booking.client,
      'bid.created',
      {
        title: `New carrier bid on ${booking._id}`,
        message: `${req.user._id} placed a bid for ${booking.pickup || 'pickup'} to ${booking.destination || 'delivery'}.`,
        link: '/app/bids',
        bookingId: booking._id
      },
      req.app.get('io')
    );
    emitBooking(req, booking._id, 'bid-created', booking, { silent: true });
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
      const acceptedBid = bidding.findBid(booking, req.params.bidId);
      let truck = null;
      if (acceptedBid?.truck) {
        const truckQuery = Truck.findOne({ _id: acceptedBid.truck, owner: acceptedBid.owner });
        truck =
          typeof truckQuery?.populate === 'function'
            ? await truckQuery.populate('owner', 'firstName lastName company isVerified documents rating ratingCount')
            : await truckQuery;
      }
      await matching.reserveAssignment(booking, truck, { assignmentMethod: 'manual-bid' });
      await booking.save();

      await Promise.allSettled(
        booking.bids
          .filter(
            (bid) => bid.status === 'rejected' && bid.rejectionReason === 'Another carrier was awarded this booking'
          )
          .map((bid) =>
            notifyBidOwner(
              req,
              booking,
              bid,
              'bid.rejected',
              `Another carrier was awarded ${booking._id}`,
              bid.rejectionReason
            )
          )
      );

      await notifications.deliver(
        booking.owner,
        'bid.accepted',
        {
          title: `Bid accepted on ${booking._id}`,
          message: `Your bid was accepted for ${booking.pickup || 'pickup'} to ${booking.destination || 'delivery'}.`,
          link: '/app/bids',
          bookingId: booking._id
        },
        req.app.get('io')
      );
      emitBooking(req, booking._id, 'bid-accepted', booking, { silent: true });
      res.json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id/bids/:bidId/counter',
  restrictTo('client', 'admin'),
  counterBidSchema,
  validate,
  async (req, res, next) => {
    try {
      if (requireDatabase(req, res)) return;
      if (!mongoReady()) return res.status(503).json({ message: 'Counteroffers require a connected database' });
      const booking = await Booking.findById(req.params.id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });
      if (!canAcceptBid(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });

      const bid = bidding.counterBid(booking, req.params.bidId, req.user, req.body);
      await booking.save();
      await notifyBidOwner(
        req,
        booking,
        bid,
        'bid.countered',
        `Counteroffer on ${booking._id}`,
        `The shipper proposed ${bid.counteroffer.amount}.`,
        { amount: bid.counteroffer.amount, expiresAt: bid.expiresAt }
      );
      emitBidUpdate(req, booking, 'bid-countered', bid);
      res.json({ booking, bid });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id/bids/:bidId/respond-counter',
  restrictTo('owner', 'admin'),
  counterResponseSchema,
  validate,
  async (req, res, next) => {
    try {
      if (requireDatabase(req, res)) return;
      if (!mongoReady()) return res.status(503).json({ message: 'Counteroffers require a connected database' });
      const booking = await Booking.findById(req.params.id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });

      const bid = bidding.respondToCounter(booking, req.params.bidId, req.user, req.body);
      await booking.save();
      await notifications.deliver(
        booking.client,
        req.body.decision === 'accept' ? 'bid.counter.accepted' : 'bid.counter.rejected',
        {
          title: `Counteroffer ${req.body.decision}ed on ${booking._id}`,
          message:
            req.body.decision === 'accept'
              ? `Carrier accepted the revised amount of ${bid.amount}.`
              : bid.rejectionReason,
          link: '/app/bids',
          bookingId: booking._id,
          bidId: bid._id
        },
        req.app.get('io')
      );
      emitBidUpdate(req, booking, 'bid-counter-responded', bid);
      res.json({ booking, bid });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id/bids/:bidId/reject',
  restrictTo('client', 'admin'),
  rejectBidSchema,
  validate,
  async (req, res, next) => {
    try {
      if (requireDatabase(req, res)) return;
      if (!mongoReady()) return res.status(503).json({ message: 'Bid rejection requires a connected database' });
      const booking = await Booking.findById(req.params.id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });
      if (!canAcceptBid(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });

      const bid = bidding.rejectBid(booking, req.params.bidId, req.user, req.body.reason);
      await booking.save();
      await notifyBidOwner(req, booking, bid, 'bid.rejected', `Bid rejected on ${booking._id}`, req.body.reason);
      emitBidUpdate(req, booking, 'bid-rejected', bid);
      res.json({ booking, bid });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id/bids/:bidId/withdraw',
  restrictTo('owner', 'admin'),
  withdrawBidSchema,
  validate,
  async (req, res, next) => {
    try {
      if (requireDatabase(req, res)) return;
      if (!mongoReady()) return res.status(503).json({ message: 'Bid withdrawal requires a connected database' });
      const booking = await Booking.findById(req.params.id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });

      const bid = bidding.withdrawBid(booking, req.params.bidId, req.user, req.body.reason);
      await booking.save();
      await notifications.deliver(
        booking.client,
        'bid.withdrawn',
        {
          title: `Carrier withdrew a bid on ${booking._id}`,
          message: bid.withdrawalReason || 'Carrier withdrew the offer.',
          link: '/app/bids',
          bookingId: booking._id,
          bidId: bid._id
        },
        req.app.get('io')
      );
      emitBidUpdate(req, booking, 'bid-withdrawn', bid);
      res.json({ booking, bid });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id/bids/:bidId/acknowledge',
  restrictTo('owner', 'admin'),
  bidActionSchema,
  validate,
  async (req, res, next) => {
    try {
      if (requireDatabase(req, res)) return;
      if (!mongoReady()) return res.status(503).json({ message: 'Bid acknowledgement requires a connected database' });
      const booking = await Booking.findById(req.params.id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });

      const bid = bidding.acknowledgeBid(booking, req.params.bidId, req.user);
      await booking.save();
      emitBidUpdate(req, booking, 'bid-acknowledged', bid);
      res.json({ booking, bid });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  '/:id/confirm-delivery',
  restrictTo('client', 'admin'),
  confirmDeliverySchema,
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

      assertDeliveryGeofence(booking, req.body.location);
      assertReceiverGradeDeliveryProof(booking);
      if (req.body.location) {
        const location = normalizeTrackingPoint(req.body.location);
        booking.tracking.push(location);
        recordLatestLocation(booking, location);
      }
      booking.transitionTo('delivered');
      booking.deliveredAt = new Date();
      await booking.save();
      await recordDeliveryConfirmation({ booking, actor: req.user });
      await booking.save();
      await matching.releaseAssignment(booking, 'delivered').catch((err) => {
        req.log?.error({ err, bookingId: booking._id }, 'Dispatch capacity release failed after delivery');
      });

      await notifications.notifyBookingParties(
        booking,
        'shipment.delivered',
        {
          title: `${booking._id} delivered`,
          message: `${booking.pickup || 'Pickup'} to ${booking.destination || 'delivery'} was confirmed delivered.`,
          link: '/app/tracking',
          bookingId: booking._id
        },
        req.app.get('io')
      );
      emitBooking(req, booking._id, 'delivery-confirmed', booking, { silent: true });
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

router.patch(
  '/:id/status',
  restrictTo('owner', 'driver', 'admin'),
  updateStatusSchema,
  validate,
  async (req, res, next) => {
    try {
      if (requireDatabase(req, res)) return;
      if (!req.body.status && !req.body.location) {
        return res.status(400).json({ message: 'Status or location is required' });
      }

      if (!mongoReady()) {
        const booking = memoryBookings.find((item) => item._id === req.params.id);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        if (!canManageBookingStatus(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });
        if (req.body.status === 'delivered' && req.user.role !== 'admin') {
          return res.status(403).json({ message: 'The shipper or an administrator must confirm final delivery' });
        }

        if (req.body.status === 'delivery_pending') {
          assertDeliveryGeofence(booking, req.body.location);
          assertDeliveryProofForDelivery(booking);
        }
        if (req.body.status) {
          Booking.assertStatusTransition(booking.status, req.body.status);
          booking.status = req.body.status;
        }
        if (req.body.location) {
          const location = normalizeTrackingPoint(req.body.location);
          booking.tracking = booking.tracking || [];
          booking.tracking.push(location);
          recordLatestLocation(booking, location);
        }
        emitBooking(req, booking._id, 'status-update', booking);
        return res.json({ booking, mode: 'memory' });
      }

      const booking = await Booking.findById(req.params.id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });
      if (!canManageBookingStatus(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });
      if (req.body.status === 'delivered' && req.user.role !== 'admin') {
        return res.status(403).json({ message: 'The shipper or an administrator must confirm final delivery' });
      }

      if (req.body.status === 'delivery_pending') {
        assertDeliveryGeofence(booking, req.body.location);
        assertDeliveryProofForDelivery(booking);
      }
      if (req.body.status === 'delivered') {
        assertDeliveryGeofence(booking, req.body.location);
        assertReceiverGradeDeliveryProof(booking);
      }
      if (req.body.status) booking.transitionTo(req.body.status);
      if (req.body.location) {
        const location = normalizeTrackingPoint(req.body.location);
        booking.tracking.push(location);
        recordLatestLocation(booking, location);
      }
      await booking.save();
      await recordAudit?.(req, 'booking.status.updated', 'booking', booking._id, {
        status: booking.status,
        locationRecorded: Boolean(req.body.location)
      });
      if (req.body.status === 'delivered') {
        await recordDeliveryConfirmation({ booking, actor: req.user });
        await booking.save();
      }
      if (['delivered', 'cancelled'].includes(req.body.status)) {
        await matching.releaseAssignment(booking, req.body.status).catch((err) => {
          req.log?.error({ err, bookingId: booking._id }, 'Dispatch capacity release failed after status update');
        });
      }

      await notifications.notifyBookingParties(
        booking,
        'shipment.status',
        {
          title: `${booking._id} ${booking.status.replaceAll('_', ' ')}`,
          message: `${booking.pickup || 'Pickup'} to ${booking.destination || 'delivery'} status changed.`,
          link: '/app/tracking',
          bookingId: booking._id,
          status: booking.status
        },
        req.app.get('io')
      );
      emitBooking(req, booking._id, 'status-update', booking, { silent: true });
      res.json({ booking });
    } catch (err) {
      next(err);
    }
  }
);

async function appendTrackingUpdates(req, res, next, updates) {
  try {
    const orderedUpdates = orderedTrackingUpdates(updates);
    if (requireDatabase(req, res)) return;

    if (!mongoReady()) {
      const booking = memoryBookings.find((item) => item._id === req.params.id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });
      if (!canManageBookingStatus(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });
      if (!trackingAllowed(booking)) {
        return res
          .status(409)
          .json({ message: 'Tracking updates are only accepted for active or handover-pending bookings' });
      }

      pushMemoryTracking(booking, orderedUpdates);
      const routeUpdate = maps.routeTelemetry(booking, orderedUpdates[orderedUpdates.length - 1]);
      if (routeUpdate) {
        booking.eta = routeUpdate.eta;
        booking.routeDeviation = routeUpdate.routeDeviation;
      }
      emitTracking(req, booking, orderedUpdates);
      return res.json({ booking, updates: orderedUpdates, accepted: orderedUpdates.length, mode: 'memory' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (!canManageBookingStatus(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });
    if (!trackingAllowed(booking)) {
      return res
        .status(409)
        .json({ message: 'Tracking updates are only accepted for active or handover-pending bookings' });
    }

    const query = { _id: booking._id, status: { $in: ['confirmed', 'in_transit', 'delivery_pending'] } };
    if (req.user.role !== 'admin') query.owner = req.user._id;
    const ingestedAt = new Date();
    const latest = orderedUpdates[orderedUpdates.length - 1];
    const routeUpdate = maps.routeTelemetry(booking, latest, ingestedAt);
    const set = { lastKnownLocation: lastKnownLocation(latest, ingestedAt) };
    if (routeUpdate) {
      set.eta = routeUpdate.eta;
      set.routeDeviation = routeUpdate.routeDeviation;
    }

    const updatedBooking = await Booking.findOneAndUpdate(
      query,
      {
        $push: { tracking: { $each: orderedUpdates, $slice: -1000 } },
        $set: set
      },
      { new: true, runValidators: true }
    );
    if (!updatedBooking) return res.status(409).json({ message: 'Tracking update could not be applied' });

    if (routeUpdate?.shouldAlert || routeUpdate?.recovered) {
      const deviated = routeUpdate.shouldAlert;
      await notifications.notifyBookingParties(
        updatedBooking,
        deviated ? 'tracking.route_deviation' : 'tracking.route_recovered',
        {
          title: deviated ? `${updatedBooking._id} left the planned route` : `${updatedBooking._id} returned to route`,
          message: deviated
            ? `Vehicle is about ${routeUpdate.routeDeviation.distanceMeters} metres from the planned road route.`
            : 'Vehicle has returned within the planned route corridor.',
          link: '/app/tracking',
          priority: deviated ? 'high' : 'normal',
          bookingId: updatedBooking._id,
          distanceMeters: routeUpdate.routeDeviation.distanceMeters,
          thresholdMeters: routeUpdate.routeDeviation.thresholdMeters,
          dedupeKey: `${deviated ? 'route-deviation' : 'route-recovered'}:${updatedBooking._id}:${ingestedAt.toISOString().slice(0, 13)}`
        },
        req.app.get('io')
      );
      const io = req.app.get('io');
      if (io?.emitToBooking) {
        io.emitToBooking(updatedBooking._id, deviated ? 'route-deviation' : 'route-recovered', {
          bookingId: updatedBooking._id,
          routeDeviation: routeUpdate.routeDeviation,
          eta: routeUpdate.eta
        });
      }
    }

    emitTracking(req, updatedBooking, orderedUpdates);
    return res.json({ booking: updatedBooking, updates: orderedUpdates, accepted: orderedUpdates.length });
  } catch (err) {
    return next(err);
  }
}

router.post(
  '/:id/tracking',
  restrictTo('owner', 'driver', 'admin'),
  trackingLocationSchema,
  validate,
  (req, res, next) => appendTrackingUpdates(req, res, next, [normalizeTrackingPoint(req.body)])
);

router.post(
  '/:id/tracking/batch',
  restrictTo('owner', 'driver', 'admin'),
  trackingBatchSchema,
  validate,
  (req, res, next) =>
    appendTrackingUpdates(
      req,
      res,
      next,
      req.body.updates.map((item) => normalizeTrackingPoint(item))
    )
);

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
