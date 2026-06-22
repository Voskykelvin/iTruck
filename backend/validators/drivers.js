const { body, param } = require('express-validator');
const { liveMongoIdBody, liveMongoIdParam, optionalString, requiredString } = require('./common');

const invitationToken = param('token')
  .trim()
  .isLength({ min: 40, max: 200 })
  .withMessage('Invitation token is invalid');

const inviteDriverSchema = [
  body('email').isEmail().withMessage('Provide a valid driver email').normalizeEmail(),
  body('phone').trim().isLength({ min: 6, max: 32 }).withMessage('Driver phone is required'),
  body('countryCode')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ min: 2, max: 8 })
    .withMessage('Country code is invalid'),
  requiredString('country', 80),
  optionalString('licenseNumber', 80),
  liveMongoIdBody('ownerId')
];

const acceptDriverInvitationSchema = [
  invitationToken,
  requiredString('firstName', 80),
  requiredString('lastName', 80),
  body('password').isLength({ min: 8, max: 128 }).withMessage('Password must be at least 8 characters'),
  optionalString('licenseNumber', 80)
];

const driverIdSchema = [liveMongoIdParam('driverId')];
const invitationIdSchema = [liveMongoIdParam('invitationId')];
const assignTruckSchema = [...driverIdSchema, liveMongoIdBody('truckId', { required: true })];
const assignBookingDriverSchema = [liveMongoIdParam('bookingId'), liveMongoIdBody('driverId', { required: true })];

module.exports = {
  acceptDriverInvitationSchema,
  assignBookingDriverSchema,
  assignTruckSchema,
  driverIdSchema,
  invitationIdSchema,
  invitationToken,
  inviteDriverSchema
};
