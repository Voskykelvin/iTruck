const { body } = require('express-validator');
const { optionalString, requiredString } = require('./common');

const coordinateFields = (prefix) => [
  body(`${prefix}.lat`).optional({ checkFalsy: true }).isFloat({ min: -90, max: 90 }).toFloat(),
  body(`${prefix}.lng`).optional({ checkFalsy: true }).isFloat({ min: -180, max: 180 }).toFloat()
];

const geocodeSchema = [requiredString('address', 240), optionalString('region', 8)];

const routeSchema = [
  optionalString('pickup', 240),
  optionalString('destination', 240),
  ...coordinateFields('origin'),
  ...coordinateFields('destinationCoordinates'),
  body('intermediates').optional({ checkFalsy: true }).isArray({ max: 23 }),
  body('intermediates.*.lat').optional({ checkFalsy: true }).isFloat({ min: -90, max: 90 }).toFloat(),
  body('intermediates.*.lng').optional({ checkFalsy: true }).isFloat({ min: -180, max: 180 }).toFloat(),
  body('intermediates.*.address').optional({ checkFalsy: true }).trim().isLength({ max: 240 }),
  body('optimizeWaypointOrder').optional({ checkFalsy: true }).isBoolean().toBoolean(),
  body().custom((_, { req }) => {
    const hasOrigin = req.body?.pickup || (req.body?.origin?.lat !== undefined && req.body?.origin?.lng !== undefined);
    const hasDestination =
      req.body?.destination ||
      (req.body?.destinationCoordinates?.lat !== undefined && req.body?.destinationCoordinates?.lng !== undefined);
    if (hasOrigin && hasDestination) return true;
    throw new Error('Pickup and destination addresses or coordinates are required');
  })
];

module.exports = { geocodeSchema, routeSchema };
