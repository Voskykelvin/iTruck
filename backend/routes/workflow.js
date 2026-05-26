const express = require('express');
const mongoose = require('mongoose');
const WorkflowRecord = require('../models/WorkflowRecord');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

const memoryStore = {
  requests: [],
  bids: [],
  messages: [],
  reports: []
};

const typeMap = {
  requests: 'request',
  bids: 'bid',
  messages: 'message',
  reports: 'report'
};

function memoryRecord(collection, req) {
  const item = {
    id: `${collection}-${Date.now()}`,
    type: typeMap[collection],
    user: req.user?._id || 'memory-user',
    payload: req.body,
    status: req.body.status || 'submitted',
    createdAt: new Date().toISOString()
  };
  memoryStore[collection].push(item);
  return item;
}

function bookingIdFrom(body = {}) {
  const id = body.booking || body.bookingId || body.shipmentId;
  return mongoose.Types.ObjectId.isValid(id) ? id : undefined;
}

async function createRecord(collection, req, res, next) {
  try {
    if (requireDatabase(req, res)) return;

    if (!mongoReady()) {
      return res.status(201).json({ item: memoryRecord(collection, req), mode: 'memory' });
    }

    const item = await WorkflowRecord.create({
      type: typeMap[collection],
      user: req.user._id,
      booking: bookingIdFrom(req.body),
      status: req.body.status || 'submitted',
      payload: req.body
    });

    res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
}

async function listRecords(req, res, next) {
  try {
    if (requireDatabase(req, res)) return;

    if (!mongoReady()) return res.json(memoryStore);

    const filter = {};
    if (req.query.type) filter.type = req.query.type;
    if (req.query.booking && mongoose.Types.ObjectId.isValid(req.query.booking)) filter.booking = req.query.booking;
    if (req.user.role !== 'admin') filter.user = req.user._id;

    const items = await WorkflowRecord.find(filter)
      .populate('user', 'firstName lastName email role')
      .populate('booking', 'pickup destination cargo status')
      .sort('-createdAt')
      .limit(100);

    res.json({ items });
  } catch (err) {
    next(err);
  }
}

router.post('/requests', (req, res, next) => createRecord('requests', req, res, next));
router.post('/bids', (req, res, next) => createRecord('bids', req, res, next));
router.post('/messages', (req, res, next) => createRecord('messages', req, res, next));
router.post('/reports', (req, res, next) => createRecord('reports', req, res, next));
router.get('/', listRecords);

module.exports = router;
