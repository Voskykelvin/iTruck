const express = require('express');
const Booking = require('../models/Booking');
const DispatchPlan = require('../models/DispatchPlan');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect, restrictTo } = require('../middleware/auth');
const matching = require('../services/matching');
const notifications = require('../services/notifications');
const validate = require('../middleware/validate');
const { bookingMatchSchema, clusterSchema, estimateSchema } = require('../validators/marketplace');
const { isLiveMode } = require('../config/runtime');
const { bookingVisibleTo } = require('../services/bookingAccess');

const router = express.Router();

const paymentMethods = [
  { id: 'wallet', label: 'iTruck Wallet', countries: ['all'], settlement: 'instant' },
  { id: 'mpesa', label: 'M-Pesa', countries: ['Kenya', 'Tanzania'], settlement: 'instant' },
  { id: 'mtn-momo', label: 'MTN MoMo', countries: ['Ghana', 'Uganda', 'Rwanda', 'Cameroon'], settlement: 'instant' },
  {
    id: 'airtel-money',
    label: 'Airtel Money',
    countries: ['Kenya', 'Uganda', 'Tanzania', 'Zambia'],
    settlement: 'instant'
  },
  { id: 'card', label: 'Card', countries: ['all'], settlement: 'escrow' },
  { id: 'cash', label: 'Cash on delivery', countries: ['all'], settlement: 'manual verification' }
];

function visibleDispatchPlan(plan, user, bookingId) {
  if (!plan) return null;
  const value = plan.toObject ? plan.toObject() : { ...plan };
  if (user.role !== 'client') return value;
  value.assignments = (value.assignments || []).filter(
    (assignment) => String(assignment.booking?._id || assignment.booking) === String(bookingId)
  );
  value.stops = (value.stops || []).map((stop) => {
    if (String(stop.booking?._id || stop.booking) === String(bookingId)) return stop;
    return {
      type: stop.type,
      sequence: stop.sequence,
      label: `Shared ${stop.type}`,
      status: stop.status
    };
  });
  return value;
}

router.get('/trust', (req, res) => {
  res.json({
    verification: ['Owner KYC', 'Driver ID', 'Vehicle logbook', 'Insurance', 'Route history'],
    protection: ['Escrow release', 'Proof of delivery', 'Dispute queue', 'Admin audit log'],
    tracking: ['Live GPS', 'Route milestones', 'Driver chat', 'Issue reporting']
  });
});

router.get('/localization', (req, res) => {
  res.json({
    currencies: ['KES', 'GHS', 'NGN', 'TZS', 'UGX', 'ZAR', 'USD'],
    languages: ['English', 'Francais', 'Kiswahili', 'Hausa', 'Yoruba', 'Amharic', 'Arabic'],
    paymentMethods,
    lowDataMode: true,
    notificationChannels: ['push', 'email', 'sms', 'whatsapp']
  });
});

router.post('/estimate', estimateSchema, validate, async (req, res, next) => {
  try {
    let route = null;
    try {
      route = await require('../services/maps').enrichRoute(req.body);
    } catch (err) {
      if (isLiveMode()) throw err;
    }
    const input = route ? { ...req.body, ...route } : req.body;
    res.json({ ...matching.buildEstimate(input), ...(route ? { route } : {}) });
  } catch (err) {
    next(err);
  }
});

router.get('/clusters', protect, clusterSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ clusters: [], mode: 'memory' });

    const match = {
      loadMode: 'ltl',
      consolidationEligible: true,
      routeKey: { $type: 'string', $ne: '' },
      status: { $in: ['pending', 'bidding', 'confirmed'] }
    };

    if (req.query.pickup && req.query.destination) {
      match.routeKey = matching.routeKeyFor({
        pickup: req.query.pickup,
        destination: req.query.destination,
        vehicleType: req.query.vehicleType || 'Lorry'
      });
    } else if (req.query.vehicleType) {
      match.vehicleType = req.query.vehicleType;
    }

    const limit = Number(req.query.limit || 20);
    const clusters = await Booking.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$routeKey',
          pickup: { $first: '$pickup' },
          destination: { $first: '$destination' },
          vehicleType: { $first: '$vehicleType' },
          bookingCount: { $sum: 1 },
          totalCargoWeightTonnes: { $sum: { $ifNull: ['$cargoWeightTonnes', 0] } },
          totalReservedCapacityTonnes: { $sum: { $ifNull: ['$reservedCapacityTonnes', 0] } },
          earliestPickupDate: { $min: '$pickupDate' },
          latestUpdatedAt: { $max: '$updatedAt' }
        }
      },
      {
        $project: {
          _id: 0,
          routeKey: '$_id',
          pickup: 1,
          destination: 1,
          vehicleType: 1,
          bookingCount: 1,
          totalCargoWeightTonnes: { $round: ['$totalCargoWeightTonnes', 3] },
          totalReservedCapacityTonnes: { $round: ['$totalReservedCapacityTonnes', 3] },
          earliestPickupDate: 1,
          latestUpdatedAt: 1
        }
      },
      { $sort: { bookingCount: -1, totalCargoWeightTonnes: -1, latestUpdatedAt: -1 } },
      { $limit: limit }
    ]);

    res.json({ clusters });
  } catch (err) {
    next(err);
  }
});

router.get(
  '/matches/:bookingId',
  protect,
  restrictTo('client', 'admin'),
  bookingMatchSchema,
  validate,
  async (req, res, next) => {
    try {
      if (requireDatabase(req, res)) return;
      if (!mongoReady()) return res.json({ matches: [], mode: 'memory' });
      const booking = await Booking.findById(req.params.bookingId);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });
      if (req.user.role !== 'admin' && String(booking.client) !== String(req.user._id)) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const matches = await matching.rankTrucksForBooking(booking, { limit: req.query.limit || 10 });
      res.json({
        matches: matches.map(({ truck, ...match }) => ({
          ...match,
          truck: {
            id: truck._id,
            type: truck.type,
            make: truck.make,
            model: truck.model,
            plateNumber: truck.plateNumber,
            capacityTonnes: truck.capacityTonnes,
            pricePerKm: truck.pricePerKm,
            ratingAverage: truck.ratingAverage,
            ratingCount: truck.ratingCount,
            completedTrips: truck.completedTrips,
            location: truck.location,
            owner: {
              id: truck.owner?._id || truck.owner,
              name: [truck.owner?.firstName, truck.owner?.lastName].filter(Boolean).join(' '),
              company: truck.owner?.company
            }
          }
        }))
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/auto-assign/:bookingId',
  protect,
  restrictTo('client', 'admin'),
  bookingMatchSchema,
  validate,
  async (req, res, next) => {
    try {
      if (requireDatabase(req, res)) return;
      if (!mongoReady()) return res.status(503).json({ message: 'Automatic assignment requires a connected database' });
      const booking = await Booking.findById(req.params.bookingId);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });
      if (req.user.role !== 'admin' && String(booking.client) !== String(req.user._id)) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const result = await matching.autoAssign(booking._id, { actor: req.user });
      await notifications.notifyBookingParties(
        result.booking,
        'booking.auto_assigned',
        {
          title: `${result.booking._id} assigned`,
          message: `${result.truck.plateNumber} was selected with a ${result.match.score}% verified-truck match.`,
          link: '/app/shipments',
          bookingId: result.booking._id,
          truckId: result.truck._id,
          matchScore: result.match.score
        },
        req.app.get('io')
      );
      const io = req.app.get('io');
      if (io?.emitToBooking) io.emitToBooking(result.booking._id, 'booking-auto-assigned', result);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

router.get('/dispatch/:bookingId', protect, bookingMatchSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ dispatchPlan: null, mode: 'memory' });
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    const visible = bookingVisibleTo(req.user, booking);
    if (!visible) return res.status(403).json({ message: 'Forbidden' });
    const plan = booking.dispatchPlan
      ? await DispatchPlan.findById(booking.dispatchPlan).populate('truck owner assignments.booking')
      : null;
    res.json({ dispatchPlan: visibleDispatchPlan(plan, req.user, booking._id) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
