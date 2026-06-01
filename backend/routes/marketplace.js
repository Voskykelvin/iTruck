const express = require('express');
const matching = require('../services/matching');
const validate = require('../middleware/validate');
const { estimateSchema } = require('../validators/marketplace');

const router = express.Router();

const paymentMethods = [
  { id: 'wallet', label: 'iTruck Wallet', countries: ['all'], settlement: 'instant' },
  { id: 'mpesa', label: 'M-Pesa', countries: ['Kenya', 'Tanzania'], settlement: 'instant' },
  { id: 'mtn-momo', label: 'MTN MoMo', countries: ['Ghana', 'Uganda', 'Rwanda', 'Cameroon'], settlement: 'instant' },
  { id: 'airtel-money', label: 'Airtel Money', countries: ['Kenya', 'Uganda', 'Tanzania', 'Zambia'], settlement: 'instant' },
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

module.exports = router;
