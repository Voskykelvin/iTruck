const { body, query } = require('express-validator');
const { liveMongoIdParam, optionalPositiveNumber, optionalString, requiredString } = require('./common');

const VEHICLE_TYPES = ['Matatu', 'Pickup', 'Lorry', 'Large Truck', 'Trailer', 'Bus', 'Specialised'];
const LOAD_MODES = ['full-truck', 'ltl'];

const estimateSchema = [
  requiredString('pickup', 160),
  requiredString('destination', 160),
  body('vehicleType').optional({ checkFalsy: true }).isIn(VEHICLE_TYPES).withMessage('Vehicle type is invalid'),
  body('loadMode').optional({ checkFalsy: true }).isIn(LOAD_MODES).withMessage('Load mode is invalid'),
  optionalPositiveNumber('cargoWeightTonnes'),
  optionalPositiveNumber('reservedCapacityTonnes'),
  body().custom((_, { req }) => {
    if (req.body?.loadMode !== 'ltl') return true;
    if (Number(req.body?.cargoWeightTonnes) > 0) return true;
    throw new Error('cargoWeightTonnes is required for LTL estimates');
  }),
  optionalPositiveNumber('distance'),
  optionalPositiveNumber('cargoValue'),
  optionalString('cargo', 1000),
  optionalString('weight', 80),
  optionalString('requirements', 120),
  body('optionalServices')
    .optional({ checkFalsy: true })
    .custom((value) => Array.isArray(value) || typeof value === 'string')
    .withMessage('optionalServices must be a list or comma-separated string'),
  body('crossBorder')
    .optional({ checkFalsy: true })
    .isBoolean()
    .withMessage('crossBorder must be true or false')
    .toBoolean()
];

const clusterSchema = [
  query('pickup').optional({ checkFalsy: true }).trim().isLength({ max: 160 }).withMessage('pickup is invalid'),
  query('destination')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 160 })
    .withMessage('destination is invalid'),
  query('vehicleType').optional({ checkFalsy: true }).isIn(VEHICLE_TYPES).withMessage('Vehicle type is invalid'),
  query('limit')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 50 })
    .withMessage('limit must be between 1 and 50')
    .toInt()
];

const bookingMatchSchema = [
  liveMongoIdParam('bookingId'),
  query('limit')
    .optional({ checkFalsy: true })
    .isInt({ min: 1, max: 25 })
    .withMessage('limit must be between 1 and 25')
    .toInt()
];

module.exports = { bookingMatchSchema, clusterSchema, estimateSchema };
