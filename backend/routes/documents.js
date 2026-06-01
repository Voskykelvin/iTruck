const express = require('express');
const { protect } = require('../middleware/auth');
const { mongoReady, requireDatabase } = require('../config/runtime');
const Booking = require('../models/Booking');
const docs = require('../services/documents');
const cloudinary = require('../services/cloudinary');
const validate = require('../middleware/validate');
const { bookingDocumentSchema } = require('../validators/documents');

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

function bookingPayload(booking) {
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

async function loadBooking(req, res) {
  if (requireDatabase(req, res)) return null;
  if (!mongoReady()) return { payload: demoBooking(req), record: null };

  const booking = await Booking.findById(req.params.bookingId).populate('truck owner client');
  if (!booking) {
    res.status(404).json({ message: 'Booking not found' });
    return null;
  }

  return { payload: bookingPayload(booking), record: booking };
}

function cacheable(record) {
  return ['delivered', 'cancelled'].includes(record?.status);
}

async function cachedDocumentUrl(record, type, create, payload) {
  if (!cacheable(record)) return null;

  const existing = (record.documents || []).find(item => item.type === type && item.url);
  if (existing) return existing.url;
  if (!cloudinary.isConfigured()) return null;

  const buffer = await docs.toBuffer(create(payload));
  const url = await cloudinary.uploadBuffer(buffer, {
    folder: 'itruck/documents',
    resource_type: 'raw',
    public_id: `booking-${record._id}-${type}`,
    overwrite: true
  });

  record.documents.push({ type, url, generatedAt: new Date() });
  await record.save();
  return url;
}

async function renderDocument(req, res, next, type, create) {
  try {
    const loaded = await loadBooking(req, res);
    if (!loaded) return;

    const cachedUrl = await cachedDocumentUrl(loaded.record, type, create, loaded.payload);
    if (cachedUrl) return res.redirect(302, cachedUrl);

    streamPdf(res, `${req.params.bookingId}-${type}.pdf`, create(loaded.payload));
  } catch (err) {
    next(err);
  }
}

router.get('/waybill/:bookingId', bookingDocumentSchema, validate, (req, res, next) => renderDocument(req, res, next, 'waybill', docs.createWaybill));
router.get('/pod/:bookingId', bookingDocumentSchema, validate, (req, res, next) => renderDocument(req, res, next, 'pod', docs.createPOD));
router.get('/invoice/:bookingId', bookingDocumentSchema, validate, (req, res, next) => renderDocument(req, res, next, 'invoice', docs.createInvoice));
router.get('/customs/:bookingId', bookingDocumentSchema, validate, (req, res, next) => renderDocument(req, res, next, 'customs', docs.createCustoms));

module.exports = router;
