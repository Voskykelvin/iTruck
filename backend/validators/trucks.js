const { body, query } = require('express-validator');
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
  optionalString('make', 80),
  optionalString('model', 80),
  optionalString('country', 80),
  optionalPositiveNumber('capacityTonnes'),
  optionalPositiveNumber('pricePerKm'),
  routesSchema,
  body('features')
    .optional({ checkFalsy: true })
    .custom((value) => Array.isArray(value) || typeof value === 'string')
    .withMessage('features must be a list or comma-separated string')
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
  liveMongoIdBody('bookingId')
];

module.exports = {
  createTruckSchema,
  listTrucksSchema,
  ratingSchema,
  truckIdSchema
};
