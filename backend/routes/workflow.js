const express = require('express');
const mongoose = require('mongoose');
const LoadRequest = require('../models/LoadRequest');
const BookingMessage = require('../models/BookingMessage');
const IssueReport = require('../models/IssueReport');
const Booking = require('../models/Booking');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const {
  createLoadRequestSchema,
  createMessageSchema,
  createReportSchema,
  listRecordsSchema,
  submitWorkflowBidSchema
} = require('../validators/workflow');

const router = express.Router();
router.use(protect);

const memoryStore = {
  requests: [],
  bids: [],
  messages: [],
  reports: []
};

function memoryRecord(collection, req) {
  const item = {
    id: `${collection}-${Date.now()}`,
    type: collection.slice(0, -1),
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

function messageTextFrom(body = {}) {
  return String(body.text || body.message || '').trim();
}

function serialize(type, item) {
  const value = item?.toObject ? item.toObject() : item;
  return {
    ...value,
    type,
    payload: value.payload || {}
  };
}

async function bookingVisibleToUser(user, bookingId) {
  if (user.role === 'admin') return true;
  return Booking.exists({
    _id: bookingId,
    $or: [{ client: user._id }, { owner: user._id }, { 'bids.owner': user._id }]
  });
}

function bookingOpenForBids(booking) {
  return ['pending', 'bidding'].includes(booking.status) && !booking.owner;
}

async function createLoadRequest(req, res, next) {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.status(201).json({ item: memoryRecord('requests', req), mode: 'memory' });
    }

    const booking = bookingIdFrom(req.body);
    if (booking && !(await bookingVisibleToUser(req.user, booking))) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const item = await LoadRequest.create({
      user: req.user._id,
      booking,
      status: req.body.status || 'submitted',
      pickup: req.body.pickup,
      destination: req.body.destination,
      cargo: req.body.cargo,
      vehicleType: req.body.vehicleType,
      budget: Number(req.body.budget) || undefined,
      payload: req.body
    });

    res.status(201).json({ item: serialize('request', item) });
  } catch (err) {
    next(err);
  }
}

async function submitBid(req, res, next) {
  try {
    if (!['owner', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only fleet owners can submit bids' });
    }

    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.status(201).json({ item: memoryRecord('bids', req), mode: 'memory' });
    }

    const bookingId = bookingIdFrom(req.body);
    if (!bookingId) return res.status(400).json({ message: 'A valid bookingId is required for bids' });

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (!bookingOpenForBids(booking)) return res.status(409).json({ message: 'Booking is not open for bids' });

    const amount = Number(req.body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ message: 'Bid amount must be greater than zero' });
    }

    const bid = {
      owner: req.user._id,
      amount,
      message: req.body.message || '',
      status: 'pending',
      createdAt: new Date()
    };
    if (mongoose.Types.ObjectId.isValid(req.body.truck)) bid.truck = req.body.truck;

    booking.bids.push(bid);
    if (booking.status === 'pending') booking.transitionTo('bidding');
    await booking.save();

    const item = {
      type: 'bid',
      user: req.user._id,
      booking: booking._id,
      status: 'pending',
      payload: { ...req.body, amount }
    };

    res.status(201).json({ item, booking });
  } catch (err) {
    next(err);
  }
}

async function createMessage(req, res, next) {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.status(201).json({ item: memoryRecord('messages', req), mode: 'memory' });
    }

    const booking = bookingIdFrom(req.body);
    if (booking && !(await bookingVisibleToUser(req.user, booking))) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const text = messageTextFrom(req.body);
    if (!text) return res.status(400).json({ message: 'Message text is required' });

    const item = await BookingMessage.create({
      user: req.user._id,
      booking,
      text,
      status: req.body.status || 'sent',
      payload: req.body
    });

    const io = req.app.get('io');
    if (io && item.booking) io.to(`booking:${item.booking}`).emit('message:new', serialize('message', item));

    res.status(201).json({ item: serialize('message', item) });
  } catch (err) {
    next(err);
  }
}

async function createReport(req, res, next) {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.status(201).json({ item: memoryRecord('reports', req), mode: 'memory' });
    }

    const booking = bookingIdFrom(req.body);
    if (booking && !(await bookingVisibleToUser(req.user, booking))) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const item = await IssueReport.create({
      user: req.user._id,
      booking,
      status: req.body.status || 'submitted',
      severity: req.body.severity || 'normal',
      message: messageTextFrom(req.body),
      payload: req.body
    });

    res.status(201).json({ item: serialize('report', item) });
  } catch (err) {
    next(err);
  }
}

async function queryItems(Model, type, filter) {
  const items = await Model.find(filter)
    .populate('user', 'firstName lastName email role')
    .populate('booking', 'pickup destination cargo status')
    .sort('-createdAt')
    .limit(100);

  return items.map((item) => serialize(type, item));
}

async function listRecords(req, res, next) {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json(memoryStore);

    const filter = {};
    const bookingId = req.query.booking || req.query.bookingId || req.query.shipmentId;
    if (bookingId && mongoose.Types.ObjectId.isValid(bookingId)) filter.booking = bookingId;
    if (req.user.role !== 'admin') filter.user = req.user._id;

    const type = String(req.query.type || '').replace(/s$/, '');
    const sources = [
      ['request', LoadRequest],
      ['message', BookingMessage],
      ['report', IssueReport]
    ].filter(([sourceType]) => !type || type === sourceType);

    const items = (await Promise.all(sources.map(([sourceType, Model]) => queryItems(Model, sourceType, filter))))
      .flat()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 100);

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
      const items = memoryStore.messages.filter((item) => {
        const payload = item.payload || {};
        if (!bookingId) return true;
        return [payload.booking, payload.bookingId, payload.shipmentId].map(String).includes(String(bookingId));
      });
      return res.json({ items, mode: 'memory' });
    }

    if (!bookingId || !mongoose.Types.ObjectId.isValid(bookingId)) {
      return res.json({ items: [] });
    }

    if (!(await bookingVisibleToUser(req.user, bookingId))) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const items = await BookingMessage.find({ booking: bookingId })
      .populate('user', 'firstName lastName email role')
      .sort('createdAt')
      .limit(100);

    res.json({ items: items.map((item) => serialize('message', item)) });
  } catch (err) {
    next(err);
  }
}

router.post('/requests', createLoadRequestSchema, validate, createLoadRequest);
router.post('/bids', submitWorkflowBidSchema, validate, submitBid);
router.post('/messages', createMessageSchema, validate, createMessage);
router.post('/reports', createReportSchema, validate, createReport);
router.get('/messages', listRecordsSchema, validate, listMessages);
router.get('/', listRecordsSchema, validate, listRecords);

module.exports = router;
