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

const documentFactories = {
  waybill: docs.createWaybill,
  pod: docs.createPOD,
  invoice: docs.createInvoice,
  customs: docs.createCustoms,
  'receiver-confirmation': docs.createReceiverConfirmation,
  'packing-list': docs.createPackingList
};

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
    weight: booking.weight,
    requirements: booking.requirements,
    cargoValue: booking.cargoValue,
    vehicleType: booking.vehicleType,
    receiverName: booking.receiverName,
    receiverPhone: booking.receiverPhone,
    communicationPreference: booking.communicationPreference,
    vehicle: booking.vehicleType || booking.truck?.plateNumber || 'Assigned vehicle',
    driver: booking.owner
      ? `${booking.owner.firstName || ''} ${booking.owner.lastName || ''}`.trim()
      : 'Assigned driver',
    amount: booking.budget || booking.estimate?.total || 0,
    paymentMethod: booking.paymentMethod
  };
}

function draftPayload(body = {}) {
  return {
    id: 'DRAFT',
    bookingId: 'DRAFT',
    route: body.route || [body.pickup, body.destination].filter(Boolean).join(' to ') || 'Draft route',
    pickup: body.pickup,
    destination: body.destination,
    cargo: body.cargo,
    weight: body.weight,
    requirements: body.requirements,
    cargoValue: body.cargoValue,
    vehicleType: body.vehicleType,
    receiverName: body.receiverName,
    receiverPhone: body.receiverPhone,
    communicationPreference: body.communicationPreference,
    paymentMethod: body.paymentMethod,
    amount: body.budget || body.estimate?.total || 0,
    total: body.estimate?.total ? `${body.estimate.currency || 'USD'} ${body.estimate.total}` : undefined
  };
}

function bookingVisibleTo(user, booking) {
  if (user.role === 'admin') return true;
  if (user.role === 'client') return String(booking.client?._id || booking.client) === String(user._id);
  if (user.role === 'owner') {
    return (
      String(booking.owner?._id || booking.owner) === String(user._id) ||
      (booking.bids || []).some((bid) => String(bid.owner?._id || bid.owner) === String(user._id))
    );
  }
  return false;
}

async function loadBooking(req, res) {
  if (requireDatabase(req, res)) return null;
  if (!mongoReady()) return { payload: demoBooking(req), record: null };

  const booking = await Booking.findById(req.params.bookingId).populate('truck owner client');
  if (!booking) {
    res.status(404).json({ message: 'Booking not found' });
    return null;
  }
  if (!bookingVisibleTo(req.user, booking)) {
    res.status(403).json({ message: 'Forbidden' });
    return null;
  }

  return { payload: bookingPayload(booking), record: booking };
}

function cacheable(record) {
  return ['delivered', 'cancelled'].includes(record?.status);
}

async function cachedDocumentUrl(record, type, create, payload) {
  if (!cacheable(record)) return null;

  const existing = (record.documents || []).find((item) => item.type === type && item.url);
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

router.post('/draft/:type', (req, res, next) => {
  try {
    const create = documentFactories[req.params.type];
    if (!create) return res.status(404).json({ message: 'Document type not found' });

    streamPdf(res, `draft-${req.params.type}.pdf`, create(draftPayload(req.body)));
  } catch (err) {
    next(err);
  }
});

router.get('/waybill/:bookingId', bookingDocumentSchema, validate, (req, res, next) =>
  renderDocument(req, res, next, 'waybill', docs.createWaybill)
);
router.get('/pod/:bookingId', bookingDocumentSchema, validate, (req, res, next) =>
  renderDocument(req, res, next, 'pod', docs.createPOD)
);
router.get('/receiver-confirmation/:bookingId', bookingDocumentSchema, validate, (req, res, next) =>
  renderDocument(req, res, next, 'receiver-confirmation', docs.createReceiverConfirmation)
);
router.get('/invoice/:bookingId', bookingDocumentSchema, validate, (req, res, next) =>
  renderDocument(req, res, next, 'invoice', docs.createInvoice)
);
router.get('/packing-list/:bookingId', bookingDocumentSchema, validate, (req, res, next) =>
  renderDocument(req, res, next, 'packing-list', docs.createPackingList)
);
router.get('/customs/:bookingId', bookingDocumentSchema, validate, (req, res, next) =>
  renderDocument(req, res, next, 'customs', docs.createCustoms)
);

module.exports = router;
