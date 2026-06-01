const { body } = require('express-validator');
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
  body('currentPassword')
    .optional({ checkFalsy: true })
    .isLength({ min: 8, max: 128 })
    .withMessage('currentPassword is invalid'),
  body('newPassword')
    .optional({ checkFalsy: true })
    .isLength({ min: 8, max: 128 })
    .withMessage('newPassword is invalid')
];

module.exports = { updatePasswordSchema, updateProfileSchema };
