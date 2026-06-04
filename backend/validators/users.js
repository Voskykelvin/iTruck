const { body, param } = require('express-validator');
const { optionalString } = require('./common');

const updateProfileSchema = [
  optionalString('firstName', 80),
  optionalString('lastName', 80),
  optionalString('phone', 32),
  optionalString('countryCode', 8),
  optionalString('country', 80),
  body('accountType')
    .optional({ checkFalsy: true })
    .isIn(['personal', 'business', 'ngo'])
    .withMessage('accountType is invalid'),
  optionalString('company', 120)
];

const updatePasswordSchema = [
  body('currentPassword').isLength({ min: 8, max: 128 }).withMessage('currentPassword is invalid'),
  body('newPassword').isLength({ min: 8, max: 128 }).withMessage('newPassword is invalid')
];

const documentUploadSchema = [
  param('documentType')
    .trim()
    .matches(/^[a-z0-9][a-z0-9-]{0,79}$/)
    .withMessage('documentType must be a document slug'),
  body('url')
    .trim()
    .optional({ checkFalsy: true })
    .isURL({ require_protocol: true })
    .withMessage('url must be a valid document URL'),
  optionalString('fileName', 240),
  optionalString('notes', 1000)
];

module.exports = { documentUploadSchema, updatePasswordSchema, updateProfileSchema };
