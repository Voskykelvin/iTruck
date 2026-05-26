const express = require('express');
const mongoose = require('mongoose');
const WorkflowRecord = require('../models/WorkflowRecord');
const Booking = require('../models/Booking');
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

    if (collection === 'messages') {
      const io = req.app.get('io');
      if (io && item.booking) io.to(`booking:${item.booking}`).emit('message:new', item);
    }

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

async function listMessages(req, res, next) {
  try {
    if (requireDatabase(req, res)) return;

    const bookingId = req.query.booking || req.query.bookingId || req.query.shipmentId;

    if (!mongoReady()) {
      const items = memoryStore.messages.filter(item => {
        const payload = item.payload || {};
        if (!bookingId) return true;
        return [payload.booking, payload.bookingId, payload.shipmentId].map(String).includes(String(bookingId));
      });
      return res.json({ items, mode: 'memory' });
    }

    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.json({ items: [] });
    }

    if (req.user.role !== 'admin') {
      const canAccess = await Booking.exists({
        _id: bookingId,
        $or: [
          { client: req.user._id },
          { owner: req.user._id },
          { 'bids.owner': req.user._id }
        ]
      });
      if (!canAccess) return res.status(403).json({ message: 'Forbidden' });
    }

    const items = await WorkflowRecord.find({ type: 'message', booking: bookingId })
      .populate('user', 'firstName lastName email role')
      .sort('createdAt')
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
router.get('/messages', listMessages);
router.get('/', listRecords);

module.exports = router;
