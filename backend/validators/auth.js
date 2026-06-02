const { body } = require('express-validator');

const registerSchema = [
  body('firstName').trim().isLength({ min: 1, max: 80 }).withMessage('First name is required'),
  body('lastName').trim().isLength({ min: 1, max: 80 }).withMessage('Last name is required'),
  body('email').isEmail().withMessage('Provide a valid email address').normalizeEmail(),
  body('phone').trim().isLength({ min: 6, max: 32 }).withMessage('Phone is required'),
  body('countryCode')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 8 })
    .withMessage('Country code is invalid'),
  body('country').trim().isLength({ min: 2, max: 80 }).withMessage('Country is required'),
  body('password').isLength({ min: 8, max: 128 }).withMessage('Password must be at least 8 characters'),
  body('accountType')
    .optional({ checkFalsy: true })
    .isIn(['personal', 'business', 'ngo'])
    .withMessage('Account type is invalid'),
  body('company').optional({ checkFalsy: true }).trim().isLength({ max: 120 }).withMessage('Company is too long'),
  body('deviceId').optional({ checkFalsy: true }).trim().isUUID().withMessage('deviceId is invalid')
];

const loginSchema = [
  body('email').isEmail().withMessage('Provide a valid email address').normalizeEmail(),
  body('password').isLength({ min: 8, max: 128 }).withMessage('Password must be at least 8 characters'),
  body('deviceId').optional({ checkFalsy: true }).trim().isUUID().withMessage('deviceId is invalid')
];

const forgotPasswordSchema = [body('email').isEmail().withMessage('Provide a valid email address').normalizeEmail()];

const resetPasswordSchema = [
  body('email').isEmail().withMessage('Provide a valid email address').normalizeEmail(),
  body('token').trim().isLength({ min: 20, max: 200 }).withMessage('Reset token is invalid'),
  body('password').isLength({ min: 8, max: 128 }).withMessage('Password must be at least 8 characters')
];

module.exports = { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema };
