const { body, param } = require('express-validator');
const { liveMongoIdParam, optionalString } = require('./common');

const userStatusSchema = [
  liveMongoIdParam('id'),
  body('isActive').isBoolean().withMessage('isActive must be true or false').toBoolean()
];

const userVerificationSchema = [
  liveMongoIdParam('id'),
  body('isVerified').isBoolean().withMessage('isVerified must be true or false').toBoolean()
];

const userDeletionSchema = [
  liveMongoIdParam('id'),
  body('reason').trim().isLength({ min: 8, max: 500 }).withMessage('Deletion reason must be 8-500 characters'),
  body('category')
    .optional({ checkFalsy: true })
    .isIn(['duplicate', 'suspicious', 'spam', 'requested', 'other'])
    .withMessage('Deletion category is invalid')
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

const documentReviewSchema = [
  liveMongoIdParam('id'),
  param('documentType').trim().isLength({ min: 2, max: 80 }).withMessage('documentType is invalid'),
  body('status').isIn(['pending', 'approved', 'rejected', 'expired']).withMessage('Document status is invalid'),
  optionalString('url', 1000),
  optionalString('notes', 1000)
];

module.exports = {
  documentReviewSchema,
  notifySchema,
  userDeletionSchema,
  truckVerificationSchema,
  userStatusSchema,
  userVerificationSchema
};
