const { body, param, query } = require('express-validator');
const {
  liveMongoIdBody,
  liveMongoIdParam,
  optionalBooleanQuery,
  optionalPositiveNumber,
  optionalString,
  pagination,
  requiredString
} = require('./common');

const TRUCK_TYPES = ['Matatu', 'Pickup', 'Lorry', 'Large Truck', 'Trailer', 'Bus', 'Specialised'];

const truckIdSchema = [liveMongoIdParam('id')];

const routesSchema = body('routes')
  .optional({ checkFalsy: true })
  .custom((value) => Array.isArray(value) || typeof value === 'string')
  .withMessage('routes must be a list or comma-separated string');

const createTruckSchema = [
  body('type').isIn(TRUCK_TYPES).withMessage('Truck type is invalid'),
  requiredString('plateNumber', 32),
  optionalString('registrationNumber', 32),
  optionalString('chassisNumber', 64),
  optionalString('make', 80),
  optionalString('model', 80),
  optionalString('country', 80),
  body('capacityTonnes')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0.1, max: 100 })
    .withMessage('capacityTonnes must be between 0.1 and 100')
    .toFloat(),
  optionalPositiveNumber('pricePerKm'),
  routesSchema,
  body('features')
    .optional({ checkFalsy: true })
    .custom((value) => Array.isArray(value) || typeof value === 'string')
    .withMessage('features must be a list or comma-separated string'),
  body('photos')
    .optional({ checkFalsy: true })
    .custom((value) => Array.isArray(value) || typeof value === 'string')
    .withMessage('photos must be a list or comma-separated string')
];

const listTrucksSchema = [
  ...pagination,
  query('type').optional({ checkFalsy: true }).isIn(TRUCK_TYPES).withMessage('Truck type is invalid'),
  optionalBooleanQuery('verified'),
  optionalBooleanQuery('isAvailable'),
  query('minCapacity')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('minCapacity must be a positive number')
    .toFloat(),
  query('maxPrice')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0 })
    .withMessage('maxPrice must be a positive number')
    .toFloat()
];

const ratingSchema = [
  ...truckIdSchema,
  body('score').isFloat({ min: 1, max: 5 }).withMessage('Rating score must be between 1 and 5').toFloat(),
  optionalString('comment', 1000),
  liveMongoIdBody('bookingId', { required: true })
];

const archiveTruckSchema = [...truckIdSchema, optionalString('reason', 240)];
const truckDocumentSchema = [
  ...truckIdSchema,
  param('documentType')
    .trim()
    .matches(/^[a-z0-9][a-z0-9-]{0,79}$/)
    .withMessage('documentType must be a document slug'),
  body('url').trim().isURL({ require_protocol: true }).withMessage('url must be a valid document URL'),
  optionalString('fileName', 240)
];
const truckPhotoSchema = [
  ...truckIdSchema,
  body('url').trim().isURL({ require_protocol: true }).withMessage('url must be a valid photo URL'),
  optionalString('fileName', 240)
];

module.exports = {
  archiveTruckSchema,
  createTruckSchema,
  listTrucksSchema,
  ratingSchema,
  truckDocumentSchema,
  truckPhotoSchema,
  truckIdSchema
};
