const express = require('express');
const { protect } = require('../middleware/auth');
const { mongoReady, requireDatabase } = require('../config/runtime');
const Booking = require('../models/Booking');
const Truck = require('../models/Truck');
const Document = require('../models/Document');
const docs = require('../services/documents');
const { recordGeneratedDocument, syncEmbeddedDocumentRecords } = require('../services/documentRecords');
const { assertDeliveryGeofence } = require('../services/operationsPolicy');
const cloudinary = require('../services/cloudinary');
const validate = require('../middleware/validate');
const { bookingDocumentSchema, documentListSchema } = require('../validators/documents');
const { normalizeBookingDocumentType } = require('../utils/documentTypes');

const router = express.Router();
router.use(protect);

const documentFactories = {
  waybill: docs.createWaybill,
  pod: docs.createPOD,
  'proof-of-delivery': docs.createPOD,
  invoice: docs.createInvoice,
  'commercial-invoice': docs.createInvoice,
  customs: docs.createCustoms,
  'customs-declaration': docs.createCustoms,
  'receiver-confirmation': docs.createReceiverConfirmation,
  'packing-list': docs.createPackingList,
  'cargo-value-declaration': docs.createCargoValueDeclaration
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
    driver: 'Assigned driver'
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

async function visibleDocumentFilter(user) {
  if (user.role === 'admin') return {};

  const bookingQuery =
    user.role === 'client' ? { client: user._id } : { $or: [{ owner: user._id }, { 'bids.owner': user._id }] };
  const [bookings, trucks] = await Promise.all([
    Booking.find(bookingQuery).select('_id').limit(500),
    user.role === 'owner' ? Truck.find({ owner: user._id }).select('_id').limit(500) : []
  ]);
  const bookingIds = bookings.map((booking) => booking._id);
  const truckIds = trucks.map((truck) => truck._id);

  return {
    $or: [
      { user: user._id },
      { uploadedBy: user._id },
      { targetType: 'user', target: user._id },
      ...(bookingIds.length ? [{ booking: { $in: bookingIds } }] : []),
      ...(truckIds.length ? [{ truck: { $in: truckIds } }] : [])
    ]
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
  if (!bookingVisibleTo(req.user, booking)) {
    res.status(403).json({ message: 'Forbidden' });
    return null;
  }

  return { payload: bookingPayload(booking), record: booking };
}

function cacheable(record) {
  return ['delivered', 'cancelled'].includes(record?.status);
}

async function cachedDocumentUrl(req, record, type, create, payload) {
  if (!cacheable(record)) return null;
  const documentType = normalizeBookingDocumentType(type);

  const existing = (record.documents || []).find(
    (item) => normalizeBookingDocumentType(item.type) === documentType && item.url
  );
  if (existing) return existing.url;
  if (!cloudinary.isConfigured()) return null;

  const buffer = await docs.toBuffer(create(payload));
  const url = await cloudinary.uploadBuffer(buffer, {
    folder: 'itruck/documents',
    resource_type: 'raw',
    public_id: `booking-${record._id}-${type}`,
    overwrite: true
  });

  const document = (record.documents || []).find((item) => normalizeBookingDocumentType(item.type) === documentType);
  const update = { type: documentType, url, generatedAt: new Date(), status: 'approved' };
  if (document) Object.assign(document, update);
  else record.documents.push(update);
  await record.save();
  await recordGeneratedDocument({
    targetType: 'booking',
    targetId: record._id,
    type: documentType,
    userId: req.user._id,
    uploadedBy: req.user._id,
    bookingId: record._id,
    patch: update,
    metadata: {
      cached: true,
      client: record.client,
      owner: record.owner,
      truck: record.truck
    }
  });
  return url;
}

async function markEmbeddedDocumentGenerated(record, documentType) {
  if (!record) return null;

  const generatedAt = new Date();
  record.documents = record.documents || [];
  const existing = record.documents.find((item) => normalizeBookingDocumentType(item.type) === documentType);
  const update = { type: documentType, generatedAt, status: 'approved' };

  if (existing) Object.assign(existing, update);
  else record.documents.push(update);

  await record.save();
  return generatedAt;
}

async function renderDocument(req, res, next, type, create) {
  try {
    const loaded = await loadBooking(req, res);
    if (!loaded) return;

    const documentType = normalizeBookingDocumentType(type);
    if (loaded.record && documentType === 'pod') assertDeliveryGeofence(loaded.record);
    const cachedUrl = await cachedDocumentUrl(req, loaded.record, type, create, loaded.payload);
    if (cachedUrl) return res.redirect(302, cachedUrl);

    if (loaded.record) {
      const generatedAt = await markEmbeddedDocumentGenerated(loaded.record, documentType);
      await recordGeneratedDocument({
        targetType: 'booking',
        targetId: loaded.record._id,
        type: documentType,
        userId: req.user._id,
        uploadedBy: req.user._id,
        bookingId: loaded.record._id,
        patch: { generatedAt },
        metadata: {
          cached: false,
          client: loaded.record.client,
          owner: loaded.record.owner,
          truck: loaded.record.truck
        }
      });
    }

    streamPdf(res, `${req.params.bookingId}-${type}.pdf`, create(loaded.payload));
  } catch (err) {
    next(err);
  }
}

router.get('/', documentListSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ documents: [], mode: 'memory' });

    const sync = await syncEmbeddedDocumentRecords(req.user);
    const filter = await visibleDocumentFilter(req.user);
    if (req.query.targetType) filter.targetType = req.query.targetType;
    if (req.query.status) filter.status = req.query.status;
    if (req.query.source) filter.source = req.query.source;

    const documents = await Document.find(filter)
      .populate('user uploadedBy reviewedBy', 'firstName lastName email role')
      .sort('-updatedAt')
      .limit(req.query.limit || 50);

    res.json({ documents, sync });
  } catch (err) {
    next(err);
  }
});

router.post('/draft/:type', async (req, res, next) => {
  try {
    const create = documentFactories[req.params.type];
    if (!create) return res.status(404).json({ message: 'Document type not found' });

    // Keep draft generation bounded
    const safeBody = {
      pickup: req.body?.pickup,
      destination: req.body?.destination,
      cargo: req.body?.cargo,
      weight: req.body?.weight,
      requirements: req.body?.requirements,
      cargoValue: req.body?.cargoValue,
      vehicleType: req.body?.vehicleType,
      receiverName: req.body?.receiverName,
      receiverPhone: req.body?.receiverPhone,
      communicationPreference: req.body?.communicationPreference,
      paymentMethod: req.body?.paymentMethod,
      budget: req.body?.budget,
      route: req.body?.route
    };

    streamPdf(res, `draft-${req.params.type}.pdf`, create(draftPayload(safeBody)));
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
router.get('/cargo-value-declaration/:bookingId', bookingDocumentSchema, validate, (req, res, next) =>
  renderDocument(req, res, next, 'cargo-value-declaration', docs.createCargoValueDeclaration)
);

module.exports = router;
