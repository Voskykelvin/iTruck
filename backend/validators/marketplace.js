const { body } = require('express-validator');
const { optionalPositiveNumber, optionalString, requiredString } = require('./common');

const VEHICLE_TYPES = ['Matatu', 'Pickup', 'Lorry', 'Large Truck', 'Trailer', 'Bus', 'Specialised'];

const estimateSchema = [
  requiredString('pickup', 160),
  requiredString('destination', 160),
  body('vehicleType').optional({ checkFalsy: true }).isIn(VEHICLE_TYPES).withMessage('Vehicle type is invalid'),
  optionalPositiveNumber('distance'),
  optionalPositiveNumber('cargoValue'),
  optionalString('cargo', 1000),
  optionalString('weight', 80),
  optionalString('requirements', 120),
  body('optionalServices')
    .optional({ checkFalsy: true })
    .custom(value => Array.isArray(value) || typeof value === 'string')
    .withMessage('optionalServices must be a list or comma-separated string'),
  body('crossBorder').optional({ checkFalsy: true }).isBoolean().withMessage('crossBorder must be true or false').toBoolean()
];

module.exports = { estimateSchema };
