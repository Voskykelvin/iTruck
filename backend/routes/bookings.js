const express = require('express');
const Booking = require('../models/Booking');
const matching = require('../services/matching');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  bookingIdSchema,
  createBookingSchema,
  listBookingsSchema,
  submitBidSchema,
  updateStatusSchema
} = require('../validators/bookings');

const router = express.Router();
router.use(protect);

const memoryBookings = [
  {
    _id: 'ITK-2044',
    client: 'demo-client-amina',
    owner: 'demo-owner-james',
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
    client: 'demo-client-tunde',
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
        owner: 'demo-owner-grace',
        amount: 3040,
        message: 'Trailer available tomorrow morning.',
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

router.get('/open', async (req, res, next) => {
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

router.post('/:id/bids', submitBidSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const booking = memoryBookings.find((item) => item._id === req.params.id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });

      booking.bids = booking.bids || [];
      booking.bids.push({ ...req.body, owner: req.user._id, status: 'pending', createdAt: new Date().toISOString() });
      emitBooking(req, booking._id, 'bid-created', booking);
      return res.json({ booking, mode: 'memory' });
    }

    const booking = await Booking.findByIdAndUpdate(
      req.params.id,
      { $push: { bids: { ...req.body, owner: req.user._id } } },
      { new: true }
    );
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    emitBooking(req, booking._id, 'bid-created', booking);
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', updateStatusSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!req.body.status && !req.body.location) {
      return res.status(400).json({ message: 'Status or location is required' });
    }

    if (!mongoReady()) {
      const booking = memoryBookings.find((item) => item._id === req.params.id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });
      if (!bookingVisibleTo(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });

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
    if (!bookingVisibleTo(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });

    if (req.body.status) booking.transitionTo(req.body.status);
    if (req.body.location) booking.tracking.push(req.body.location);
    await booking.save();

    emitBooking(req, booking._id, 'status-update', booking);
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
