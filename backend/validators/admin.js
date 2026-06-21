const { body, param, query } = require('express-validator');
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
  body('title').trim().isLength({ min: 1, max: 160 }).withMessage('title is required'),
  body('message').trim().isLength({ min: 1, max: 1000 }).withMessage('message is required'),
  body('priority').optional({ checkFalsy: true }).isIn(['low', 'normal', 'high']).withMessage('priority is invalid'),
  body('roles')
    .optional()
    .isArray({ min: 1, max: 3 })
    .withMessage('roles must be a list')
    .custom((roles) => roles.every((role) => ['client', 'owner', 'admin'].includes(role)))
    .withMessage('roles contains an invalid role'),
  body('userIds')
    .optional()
    .isArray({ min: 1, max: 100 })
    .withMessage('userIds must be a list')
    .custom((ids) => ids.every((id) => /^[a-f0-9]{24}$/i.test(String(id))))
    .withMessage('userIds contains an invalid user id'),
  optionalString('country', 80),
  optionalString('link', 500),
  body('category')
    .optional({ checkFalsy: true })
    .isIn(['bookings', 'tracking', 'documents', 'payments', 'security', 'marketing', 'system'])
    .withMessage('category is invalid')
];

const notificationDeliveryListSchema = [
  query('status')
    .optional({ checkFalsy: true })
    .isIn(['pending', 'processing', 'retry', 'sent', 'failed', 'cancelled'])
    .withMessage('status is invalid'),
  query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 200 }).withMessage('limit is invalid').toInt()
];

const notificationDeliveryRetrySchema = [liveMongoIdParam('id')];

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
  notificationDeliveryListSchema,
  notificationDeliveryRetrySchema,
  userDeletionSchema,
  truckVerificationSchema,
  userStatusSchema,
  userVerificationSchema
};
