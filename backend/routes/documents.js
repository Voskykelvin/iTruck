const express = require('express');
const { protect } = require('../middleware/auth');
const { mongoReady, requireDatabase } = require('../config/runtime');
const Booking = require('../models/Booking');
const docs = require('../services/documents');

const router = express.Router();
router.use(protect);

function streamPdf(res, filename, doc) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  doc.pipe(res);
}

function demoBooking(req) {
  return {
    id: req.params.bookingId,
    bookingId: req.params.bookingId,
    route: 'Nairobi to Kampala',
    pickup: 'Nairobi',
    destination: 'Kampala',
    cargo: 'Retail stock',
    vehicle: 'Isuzu FVZ 34',
    driver: 'James Mwangi'
  };
}

async function loadBooking(req, res) {
  if (requireDatabase(req, res)) return null;
  if (!mongoReady()) return demoBooking(req);

  const booking = await Booking.findById(req.params.bookingId).populate('truck owner client');
  if (!booking) {
    res.status(404).json({ message: 'Booking not found' });
    return null;
  }

  return {
    id: booking._id,
    bookingId: booking._id,
    route: `${booking.pickup} to ${booking.destination}`,
    pickup: booking.pickup,
    destination: booking.destination,
    cargo: booking.cargo,
    vehicle: booking.vehicleType || booking.truck?.plateNumber || 'Assigned vehicle',
    driver: booking.owner ? `${booking.owner.firstName || ''} ${booking.owner.lastName || ''}`.trim() : 'Assigned driver',
    amount: booking.budget || booking.estimate?.total || 0,
    paymentMethod: booking.paymentMethod
  };
}

async function renderDocument(req, res, next, type, create) {
  try {
    const booking = await loadBooking(req, res);
    if (!booking) return;
    streamPdf(res, `${req.params.bookingId}-${type}.pdf`, create(booking));
  } catch (err) {
    next(err);
  }
}

router.get('/waybill/:bookingId', (req, res, next) => renderDocument(req, res, next, 'waybill', docs.createWaybill));
router.get('/pod/:bookingId', (req, res, next) => renderDocument(req, res, next, 'pod', docs.createPOD));
router.get('/invoice/:bookingId', (req, res, next) => renderDocument(req, res, next, 'invoice', docs.createInvoice));
router.get('/customs/:bookingId', (req, res, next) => renderDocument(req, res, next, 'customs', docs.createCustoms));

module.exports = router;
