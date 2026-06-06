const { liveMongoIdParam } = require('./common');
const { query } = require('express-validator');

const bookingDocumentSchema = [liveMongoIdParam('bookingId')];

const documentListSchema = [
  query('targetType').optional({ checkFalsy: true }).isIn(['user', 'truck', 'booking']),
  query('status').optional({ checkFalsy: true }).isIn(['pending', 'approved', 'rejected', 'expired']),
  query('source').optional({ checkFalsy: true }).isIn(['uploaded', 'generated', 'reviewed', 'imported']),
  query('limit').optional({ checkFalsy: true }).isInt({ min: 1, max: 100 }).toInt()
];

module.exports = { bookingDocumentSchema, documentListSchema };
