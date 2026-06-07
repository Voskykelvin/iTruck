const express = require('express');
const Booking = require('../models/Booking');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect } = require('../middleware/auth');
const matching = require('../services/matching');
const validate = require('../middleware/validate');
const { clusterSchema, estimateSchema } = require('../validators/marketplace');

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

router.post('/estimate', estimateSchema, validate, (req, res) => {
  res.json(matching.buildEstimate(req.body));
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

module.exports = router;
