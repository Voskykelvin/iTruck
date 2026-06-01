const { body } = require('express-validator');
const { liveMongoIdParam, optionalString } = require('./common');

const userStatusSchema = [
  liveMongoIdParam('id'),
  body('isActive').isBoolean().withMessage('isActive must be true or false').toBoolean()
];

const truckVerificationSchema = [
  liveMongoIdParam('id'),
  body('isVerified').isBoolean().withMessage('isVerified must be true or false').toBoolean()
];

const notifySchema = [
  optionalString('title', 160),
  optionalString('message', 1000),
  body('priority').optional({ checkFalsy: true }).isIn(['low', 'normal', 'high']).withMessage('priority is invalid')
];

module.exports = { notifySchema, truckVerificationSchema, userStatusSchema };
