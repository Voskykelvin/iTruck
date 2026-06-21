const mongoose = require('mongoose');
const { body, query } = require('express-validator');
const { mongoReady } = require('../config/runtime');
const { isDocumentUrl } = require('../utils/documentTypes');
const { liveMongoIdBody, liveMongoIdParam, optionalString, pagination } = require('./common');

const CASE_KINDS = ['support', 'dispute'];
const CASE_CATEGORIES = [
  'delay',
  'tracking',
  'delivery',
  'damage',
  'loss',
  'payment',
  'documents',
  'conduct',
  'technical',
  'other'
];
const CASE_STATUSES = [
  'submitted',
  'reviewing',
  'open',
  'triaged',
  'in_progress',
  'waiting_on_user',
  'waiting_on_carrier',
  'resolved',
  'closed',
  'dismissed'
];
const ACTIVE_MANAGEMENT_STATUSES = ['triaged', 'in_progress', 'waiting_on_user', 'waiting_on_carrier'];
const RESOLUTION_OUTCOMES = [
  'resume_booking',
  'cancel_booking',
  'confirm_delivery',
  'refund_required',
  'no_action',
  'dismissed'
];

function evidenceUrls(field = 'evidenceUrls', max = 10) {
  return body(field)
    .optional({ checkFalsy: true })
    .isArray({ max })
    .withMessage(`${field} must contain at most ${max} files`)
    .bail()
    .custom((urls) => urls.every(isDocumentUrl))
    .withMessage(`${field} must contain valid upload URLs`);
}

const createCaseSchema = [
  liveMongoIdBody(['booking', 'bookingId', 'shipmentId']),
  body('kind').optional({ checkFalsy: true }).isIn(CASE_KINDS).withMessage('kind is invalid'),
  body('category').optional({ checkFalsy: true }).isIn(CASE_CATEGORIES).withMessage('category is invalid'),
  optionalString('title', 200),
  body('message').trim().isLength({ min: 5, max: 2000 }).withMessage('message must be 5-2000 characters'),
  body('severity')
    .optional({ checkFalsy: true })
    .isIn(['low', 'normal', 'high', 'critical'])
    .withMessage('severity is invalid'),
  body('priority')
    .optional({ checkFalsy: true })
    .isIn(['low', 'normal', 'high', 'urgent'])
    .withMessage('priority is invalid'),
  evidenceUrls(),
  body('evidenceFileNames')
    .optional({ checkFalsy: true })
    .isArray({ max: 10 })
    .withMessage('evidenceFileNames is invalid'),
  body().custom((_, { req }) => {
    const booking = req.body?.booking || req.body?.bookingId || req.body?.shipmentId;
    if (req.body?.kind !== 'dispute' || booking) return true;
    throw new Error('booking is required for dispute cases');
  })
];

const listCasesSchema = [
  ...pagination,
  query('status').optional({ checkFalsy: true }).isIn(CASE_STATUSES).withMessage('status is invalid'),
  query('kind').optional({ checkFalsy: true }).isIn(CASE_KINDS).withMessage('kind is invalid'),
  query('priority')
    .optional({ checkFalsy: true })
    .isIn(['low', 'normal', 'high', 'urgent'])
    .withMessage('priority is invalid'),
  query('booking')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 80 })
    .withMessage('booking is invalid')
    .bail()
    .custom((value) => {
      if (!mongoReady() || mongoose.Types.ObjectId.isValid(value)) return true;
      throw new Error('booking is invalid');
    }),
  query('assignedTo')
    .optional({ checkFalsy: true })
    .trim()
    .isLength({ max: 80 })
    .withMessage('assignedTo is invalid')
    .bail()
    .custom((value) => {
      if (value === 'unassigned' || !mongoReady() || mongoose.Types.ObjectId.isValid(value)) return true;
      throw new Error('assignedTo is invalid');
    })
];

const caseIdSchema = [liveMongoIdParam('id')];

const caseCommentSchema = [
  liveMongoIdParam('id'),
  body('body').trim().isLength({ min: 1, max: 4000 }).withMessage('body is required'),
  body('visibility')
    .optional({ checkFalsy: true })
    .isIn(['participants', 'internal'])
    .withMessage('visibility is invalid'),
  evidenceUrls(),
  body('evidenceFileNames')
    .optional({ checkFalsy: true })
    .isArray({ max: 10 })
    .withMessage('evidenceFileNames is invalid')
];

const assignCaseSchema = [
  liveMongoIdParam('id'),
  liveMongoIdBody('assignedTo', { required: true }),
  optionalString('note', 1000)
];

const updateCaseStatusSchema = [
  liveMongoIdParam('id'),
  body('status').isIn(ACTIVE_MANAGEMENT_STATUSES).withMessage('status is invalid'),
  optionalString('note', 1000),
  body().custom((_, { req }) => {
    if (!['waiting_on_user', 'waiting_on_carrier'].includes(req.body?.status) || req.body?.note?.trim()) return true;
    throw new Error('note is required when waiting on a participant');
  })
];

const resolveCaseSchema = [
  liveMongoIdParam('id'),
  body('outcome').isIn(RESOLUTION_OUTCOMES).withMessage('outcome is invalid'),
  body('summary').trim().isLength({ min: 5, max: 4000 }).withMessage('summary must be 5-4000 characters'),
  evidenceUrls()
];

const reopenCaseSchema = [liveMongoIdParam('id'), optionalString('note', 1000)];

module.exports = {
  assignCaseSchema,
  caseCommentSchema,
  caseIdSchema,
  createCaseSchema,
  listCasesSchema,
  reopenCaseSchema,
  resolveCaseSchema,
  updateCaseStatusSchema
};
