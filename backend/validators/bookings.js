const { body, query } = require('express-validator');
const Booking = require('../models/Booking');
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

const createBookingSchema = [
  requiredString('pickup', 160),
  requiredString('destination', 160),
  optionalString('vehicleType', 80),
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

const updateStatusSchema = [
  ...bookingIdSchema,
  body('status').optional({ checkFalsy: true }).isIn(Booking.STATUSES).withMessage('Status is invalid'),
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
    .toFloat()
];

const listBookingsSchema = [
  ...pagination,
  query('status').optional({ checkFalsy: true }).isIn(Booking.STATUSES).withMessage('Status is invalid')
];

module.exports = {
  acceptBidSchema,
  bookingIdSchema,
  createBookingSchema,
  listBookingsSchema,
  submitBidSchema,
  updateStatusSchema
};
