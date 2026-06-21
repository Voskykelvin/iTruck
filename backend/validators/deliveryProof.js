const { body } = require('express-validator');
const { liveMongoIdParam, optionalString, requiredString } = require('./common');

const proofBookingIdSchema = [liveMongoIdParam('id')];

const proofAssetUploadSchema = [
  ...proofBookingIdSchema,
  body('capturedAt').isISO8601().withMessage('capturedAt is required and must be a valid timestamp').toDate(),
  body('lat').isFloat({ min: -90, max: 90 }).withMessage('Photo latitude is invalid').toFloat(),
  body('lng').isFloat({ min: -180, max: 180 }).withMessage('Photo longitude is invalid').toFloat(),
  body('accuracy')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 10000 })
    .withMessage('Photo GPS accuracy is invalid')
    .toFloat()
];

const finalizeDeliveryProofSchema = [
  ...proofBookingIdSchema,
  body('otp')
    .trim()
    .matches(/^\d{6}$/)
    .withMessage('otp must be a 6-digit code'),
  body('assetIds').isArray({ min: 1, max: 5 }).withMessage('assetIds must contain between 1 and 5 delivery photos'),
  body('assetIds.*').isMongoId().withMessage('Every delivery photo id must be valid'),
  requiredString('signerName', 120),
  optionalString('signerRole', 120),
  body('signatureType')
    .optional({ checkFalsy: true })
    .isIn(['typed', 'drawn'])
    .withMessage('signatureType must be typed or drawn'),
  requiredString('signatureValue', 200),
  body('consent')
    .isBoolean()
    .withMessage('consent must be true')
    .toBoolean()
    .equals('true')
    .withMessage('consent is required'),
  body('signedAt').isISO8601().withMessage('signedAt must be a valid timestamp').toDate(),
  body('clientTimestamp').isISO8601().withMessage('clientTimestamp must be a valid timestamp').toDate(),
  optionalString('timezone', 100),
  body('location').isObject().withMessage('location is required'),
  body('location.lat').isFloat({ min: -90, max: 90 }).withMessage('Delivery latitude is invalid').toFloat(),
  body('location.lng').isFloat({ min: -180, max: 180 }).withMessage('Delivery longitude is invalid').toFloat(),
  body('location.accuracy')
    .optional({ checkFalsy: true })
    .isFloat({ min: 0, max: 10000 })
    .withMessage('Delivery GPS accuracy is invalid')
    .toFloat(),
  body('location.recordedAt').isISO8601().withMessage('Delivery GPS timestamp is required').toDate()
];

module.exports = {
  finalizeDeliveryProofSchema,
  proofAssetUploadSchema,
  proofBookingIdSchema
};
