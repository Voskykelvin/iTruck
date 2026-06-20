const { body, query } = require('express-validator');
const { liveMongoIdBody, optionalString, optionalPositiveNumber, pagination } = require('./common');
const { isDocumentUrl } = require('../utils/documentTypes');

const workflowStatuses = [
  'submitted',
  'open',
  'matched',
  'cancelled',
  'pending',
  'sent',
  'read',
  'failed',
  'reviewing',
  'resolved',
  'dismissed'
];

const createLoadRequestSchema = [
  liveMongoIdBody(['booking', 'bookingId', 'shipmentId']),
  optionalString('pickup', 160),
  optionalString('destination', 160),
  optionalString('cargo', 1000),
  optionalString('vehicleType', 80),
  optionalPositiveNumber('budget'),
  body().custom((_, { req }) => {
    const booking = req.body?.booking || req.body?.bookingId || req.body?.shipmentId;
    if (booking || (req.body?.pickup && req.body?.destination && req.body?.cargo)) return true;
    throw new Error('Provide a bookingId or pickup, destination, and cargo');
  }),
  body('status')
    .optional({ checkFalsy: true })
    .isIn(['submitted', 'open', 'matched', 'cancelled'])
    .withMessage('Status is invalid')
];

const submitWorkflowBidSchema = [
  liveMongoIdBody(['booking', 'bookingId', 'shipmentId'], { required: true }),
  body('amount').isFloat({ min: 0.01 }).withMessage('Bid amount must be greater than zero').toFloat(),
  optionalString('message', 1000),
  liveMongoIdBody('truck'),
  body('status').optional({ checkFalsy: true }).isIn(workflowStatuses).withMessage('Status is invalid')
];

const createMessageSchema = [
  liveMongoIdBody(['booking', 'bookingId', 'shipmentId']),
  body().custom((_, { req }) => {
    const text = String(req.body?.text || req.body?.message || '').trim();
    if (!text) throw new Error('Message text is required');
    if (text.length > 2000) throw new Error('Message text is too long');
    return true;
  }),
  body('status').optional({ checkFalsy: true }).isIn(['sent', 'read', 'failed']).withMessage('Status is invalid')
];

const createReportSchema = [
  liveMongoIdBody(['booking', 'bookingId', 'shipmentId']),
  body().custom((_, { req }) => {
    const text = String(req.body?.text || req.body?.message || req.body?.description || '').trim();
    if (!text) throw new Error('Report message is required');
    if (text.length > 2000) throw new Error('Report message is too long');
    return true;
  }),
  body('severity').optional({ checkFalsy: true }).isIn(['low', 'normal', 'high']).withMessage('Severity is invalid'),
  body('evidenceUrls')
    .optional({ checkFalsy: true })
    .isArray({ max: 5 })
    .withMessage('evidenceUrls must contain at most 5 files')
    .bail()
    .custom((urls) => urls.every(isDocumentUrl))
    .withMessage('evidenceUrls must contain valid upload URLs'),
  body('status')
    .optional({ checkFalsy: true })
    .isIn(['submitted', 'reviewing', 'resolved', 'dismissed'])
    .withMessage('Status is invalid')
];

const listRecordsSchema = [
  ...pagination,
  query('booking').optional({ checkFalsy: true }).trim().isLength({ max: 80 }).withMessage('booking is invalid'),
  query('bookingId').optional({ checkFalsy: true }).trim().isLength({ max: 80 }).withMessage('bookingId is invalid'),
  query('shipmentId').optional({ checkFalsy: true }).trim().isLength({ max: 80 }).withMessage('shipmentId is invalid'),
  query('type')
    .optional({ checkFalsy: true })
    .isIn(['request', 'requests', 'message', 'messages', 'report', 'reports'])
    .withMessage('type is invalid')
];

module.exports = {
  createLoadRequestSchema,
  createMessageSchema,
  createReportSchema,
  listRecordsSchema,
  submitWorkflowBidSchema
};
