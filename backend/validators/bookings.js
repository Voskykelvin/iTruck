const { body, param, query } = require('express-validator');
const Booking = require('../models/Booking');
const { isDocumentUrl } = require('../utils/documentTypes');
const {
  liveMongoIdParam,
  optionalPositiveNumber,
  optionalString,
  pagination,
  positiveAmount,
  requiredString
} = require('./common');

const bookingIdSchema = [liveMongoIdParam('id')];
const acceptBidSchema = [...bookingIdSchema, liveMongoIdParam('bidId')];
const documentTypeParam = param('documentType')
  .trim()
  .matches(/^[a-z0-9][a-z0-9_-]{0,79}$/)
  .withMessage('documentType must be a document slug');

const createBookingSchema = [
  requiredString('pickup', 160),
  requiredString('destination', 160),
  body('pickupCoordinates').optional({ checkFalsy: true }).isObject().withMessage('pickupCoordinates must be an object'),
  body('pickupCoordinates.lat')
    .optional({ checkFalsy: true })
    .isFloat({ min: -90, max: 90 })
    .withMessage('Pickup latitude is invalid')
    .toFloat(),
  body('pickupCoordinates.lng')
    .optional({ checkFalsy: true })
    .isFloat({ min: -180, max: 180 })
    .withMessage('Pickup longitude is invalid')
    .toFloat(),
  body('destinationCoordinates')
    .optional({ checkFalsy: true })
    .isObject()
    .withMessage('destinationCoordinates must be an object'),
  body('destinationCoordinates.lat')
    .optional({ checkFalsy: true })
    .isFloat({ min: -90, max: 90 })
    .withMessage('Destination latitude is invalid')
    .toFloat(),
  body('destinationCoordinates.lng')
    .optional({ checkFalsy: true })
    .isFloat({ min: -180, max: 180 })
    .withMessage('Destination longitude is invalid')
    .toFloat(),
  body('deliveryGeofenceMeters')
    .optional({ checkFalsy: true })
    .isFloat({ min: 25, max: 5000 })
    .withMessage('deliveryGeofenceMeters must be between 25 and 5000')
    .toFloat(),
  optionalString('vehicleType', 80),
  body('loadMode').optional({ checkFalsy: true }).isIn(Booking.LOAD_MODES).withMessage('Load mode is invalid'),
  optionalPositiveNumber('cargoWeightTonnes'),
  optionalPositiveNumber('reservedCapacityTonnes'),
  body().custom((_, { req }) => {
    if (req.body?.loadMode !== 'ltl') return true;
    if (Number(req.body?.cargoWeightTonnes) > 0) return true;
    throw new Error('cargoWeightTonnes is required for LTL bookings');
  }),
  body('consolidationEligible')
    .optional({ checkFalsy: true })
    .isBoolean()
    .withMessage('consolidationEligible must be true or false')
    .toBoolean(),
  requiredString('cargo', 1000),
  optionalPositiveNumber('distance'),
  optionalPositiveNumber('cargoValue'),
  optionalPositiveNumber('budget'),
  optionalString('paymentMethod', 80),
  optionalString('receiverName', 120),
  optionalString('receiverPhone', 32),
  optionalString('pickupWindow', 120),
  optionalString('weight', 80),
  optionalString('requirements', 120),
  optionalString('communicationPreference', 120),
  optionalString('quietHours', 120),
  body('optionalServices')
    .optional({ checkFalsy: true })
    .custom((value) => Array.isArray(value) || typeof value === 'string')
    .withMessage('optionalServices must be a list or comma-separated string'),
  body('quoteAcknowledged')
    .optional({ checkFalsy: true })
    .isBoolean()
    .withMessage('quoteAcknowledged must be true or false')
    .toBoolean()
];

const submitBidSchema = [
  ...bookingIdSchema,
  positiveAmount('amount'),
  optionalString('message', 1000),
  optionalString('truck', 120)
];

const locationSchema = [
  body('location').optional({ checkFalsy: true }).isObject().withMessage('location must be an object'),
  body('location.lat')
    .optional({ checkFalsy: true })
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude is invalid')
    .toFloat(),
  body('location.lng')
    .optional({ checkFalsy: true })
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude is invalid')
    .toFloat(),
  body('location.speed')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 180 })
    .withMessage('Speed is invalid')
    .toFloat(),
  body('location.heading')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 360 })
    .withMessage('Heading is invalid')
    .toFloat(),
  body('location.accuracy')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 10000 })
    .withMessage('Location accuracy is invalid')
    .toFloat()
];

const trackingPointSchema = (prefix = '') => [
  body(`${prefix}lat`)
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude is invalid')
    .toFloat(),
  body(`${prefix}lng`)
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude is invalid')
    .toFloat(),
  body(`${prefix}speed`)
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 180 })
    .withMessage('Speed is invalid')
    .toFloat(),
  body(`${prefix}heading`)
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 360 })
    .withMessage('Heading is invalid')
    .toFloat(),
  body(`${prefix}accuracy`)
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 10000 })
    .withMessage('Location accuracy is invalid')
    .toFloat(),
  body(`${prefix}timestamp`)
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Timestamp is invalid')
    .toDate()
];

const updateStatusSchema = [
  ...bookingIdSchema,
  body('status').optional({ checkFalsy: true }).isIn(Booking.STATUSES).withMessage('Status is invalid'),
  ...locationSchema
];

const confirmDeliverySchema = [...bookingIdSchema, ...locationSchema];
const trackingLocationSchema = [...bookingIdSchema, ...trackingPointSchema()];
const trackingBatchSchema = [
  ...bookingIdSchema,
  body('updates')
    .isArray({ min: 1, max: 250 })
    .withMessage('updates must contain between 1 and 250 tracking points'),
  body('updates.*.lat')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude is invalid')
    .toFloat(),
  body('updates.*.lng')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude is invalid')
    .toFloat(),
  body('updates.*.speed')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 180 })
    .withMessage('Speed is invalid')
    .toFloat(),
  body('updates.*.heading')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 360 })
    .withMessage('Heading is invalid')
    .toFloat(),
  body('updates.*.accuracy')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 10000 })
    .withMessage('Location accuracy is invalid')
    .toFloat(),
  body('updates.*.timestamp')
    .optional({ checkFalsy: true })
    .isISO8601()
    .withMessage('Timestamp is invalid')
    .toDate()
];

const bookingDocumentUploadSchema = [
  ...bookingIdSchema,
  documentTypeParam,
  body('url').trim().custom(isDocumentUrl).withMessage('url must be a valid document URL'),
  body('urls')
    .optional({ checkFalsy: true })
    .custom((value) => Array.isArray(value) && value.every(isDocumentUrl))
    .withMessage('urls must be valid document URLs'),
  optionalString('fileName', 240),
  body('fileNames')
    .optional({ checkFalsy: true })
    .custom((value) => Array.isArray(value) && value.every((item) => String(item || '').length <= 240))
    .withMessage('fileNames must be a list of file names'),
  optionalString('notes', 1000)
];

const bookingRatingSchema = [
  ...bookingIdSchema,
  body('score').isFloat({ min: 1, max: 5 }).withMessage('Rating score must be between 1 and 5').toFloat(),
  body('target')
    .optional({ checkFalsy: true })
    .isIn(['owner', 'client'])
    .withMessage('Rating target must be owner or client'),
  optionalString('comment', 1000)
];

const listBookingsSchema = [
  ...pagination,
  query('status').optional({ checkFalsy: true }).isIn(Booking.STATUSES).withMessage('Status is invalid')
];

module.exports = {
  acceptBidSchema,
  bookingDocumentUploadSchema,
  bookingRatingSchema,
  bookingIdSchema,
  confirmDeliverySchema,
  createBookingSchema,
  listBookingsSchema,
  submitBidSchema,
  trackingBatchSchema,
  trackingLocationSchema,
  updateStatusSchema
};
