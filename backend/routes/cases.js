const express = require('express');
const mongoose = require('mongoose');
const IssueReport = require('../models/IssueReport');
const Booking = require('../models/Booking');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const caseManagement = require('../services/caseManagement');
const {
  caseCommentSchema,
  caseIdSchema,
  createCaseSchema,
  listCasesSchema,
  reopenCaseSchema
} = require('../validators/cases');
const { bookingQueryForUser } = require('../services/bookingAccess');

const router = express.Router();
router.use(protect);

const memoryCases = [];

function bookingIdFrom(body = {}) {
  return body.booking || body.bookingId || body.shipmentId;
}

function memoryCase(req) {
  const now = new Date();
  const priority = caseManagement.casePriority(req.body.severity, req.body.priority);
  const record = {
    _id: `case-${Date.now()}`,
    caseNumber: caseManagement.generateCaseNumber(now),
    user: req.user._id,
    booking: bookingIdFrom(req.body),
    kind: req.body.kind || 'support',
    category: req.body.category || 'other',
    title: req.body.title || `${req.body.category || 'support'} case`,
    message: req.body.message,
    severity: req.body.severity || 'normal',
    priority,
    priorityRank: caseManagement.casePriorityRank(priority),
    status: 'open',
    participants: [req.user._id],
    evidence: (req.body.evidenceUrls || []).map((url, index) => ({
      url,
      fileName: req.body.evidenceFileNames?.[index],
      addedBy: req.user._id,
      createdAt: now.toISOString()
    })),
    comments: [],
    timeline: [{ action: 'case.created', actor: req.user._id, toStatus: 'open', createdAt: now.toISOString() }],
    ...caseManagement.slaDeadlines(priority, now),
    openedAt: now.toISOString(),
    lastActivityAt: now.toISOString(),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  memoryCases.unshift(record);
  return record;
}

function memoryCaseVisibleTo(record, user) {
  return (
    user.role === 'admin' ||
    String(record.user) === String(user._id) ||
    (record.participants || []).some((participant) => String(participant?._id || participant) === String(user._id))
  );
}

function visibleMemoryCase(record, user) {
  if (user.role === 'admin') return record;
  return {
    ...record,
    comments: (record.comments || []).filter((comment) => comment.visibility !== 'internal'),
    timeline: (record.timeline || []).filter((event) => event.visibility !== 'internal')
  };
}

function pageOptions(query = {}) {
  const page = Number(query.page) || 1;
  const limit = Number(query.limit) || 100;
  return { page, limit, skip: (page - 1) * limit };
}

async function bookingVisibleToUser(user, bookingId) {
  if (!bookingId || user.role === 'admin') return true;
  if (!mongoose.Types.ObjectId.isValid(bookingId)) return false;
  return Booking.exists({ _id: bookingId, ...bookingQueryForUser(user) });
}

function populateCase(query) {
  return query
    .populate('user', 'firstName lastName email role')
    .populate('assignedTo', 'firstName lastName email role')
    .populate('participants', 'firstName lastName email role')
    .populate('booking', 'pickup destination cargo status paymentStatus')
    .populate('comments.author', 'firstName lastName email role')
    .populate('timeline.actor', 'firstName lastName email role');
}

router.get('/', listCasesSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const booking = req.query.booking;
      const filtered = memoryCases.filter(
        (record) =>
          memoryCaseVisibleTo(record, req.user) &&
          (!booking || String(record.booking) === String(booking)) &&
          (!req.query.status || record.status === req.query.status) &&
          (!req.query.kind || record.kind === req.query.kind) &&
          (!req.query.priority || record.priority === req.query.priority)
      );
      const { page, limit, skip } = pageOptions(req.query);
      const cases = filtered.slice(skip, skip + limit);
      return res.json({
        cases: cases.map((record) => visibleMemoryCase(record, req.user)),
        pagination: { page, limit, total: filtered.length },
        mode: 'memory'
      });
    }

    const { page, limit, skip } = pageOptions(req.query);
    const filter = { ...caseManagement.caseAccessFilter(req.user) };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.kind) filter.kind = req.query.kind;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.booking && mongoose.Types.ObjectId.isValid(req.query.booking)) filter.booking = req.query.booking;
    const [cases, total] = await Promise.all([
      populateCase(IssueReport.find(filter).sort({ priorityRank: -1, lastActivityAt: -1 }).skip(skip).limit(limit)),
      IssueReport.countDocuments(filter)
    ]);
    res.json({
      cases: cases.map((record) => caseManagement.visibleCase(record, req.user)),
      pagination: { page, limit, total }
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', createCaseSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    const booking = bookingIdFrom(req.body);
    if (booking && mongoReady() && !(await bookingVisibleToUser(req.user, booking))) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    if (!mongoReady()) return res.status(201).json({ case: memoryCase(req), mode: 'memory' });

    const record = await caseManagement.createCase(
      {
        ...req.body,
        user: req.user._id,
        booking,
        payload: req.body
      },
      { io: req.app.get('io'), isAdmin: req.user.role === 'admin' }
    );
    res.status(201).json({ case: caseManagement.visibleCase(record, req.user) });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', caseIdSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const record = memoryCases.find((item) => item._id === req.params.id);
      if (!record || !memoryCaseVisibleTo(record, req.user)) return res.status(404).json({ message: 'Case not found' });
      return res.json({ case: visibleMemoryCase(record, req.user), mode: 'memory' });
    }
    const record = await populateCase(
      IssueReport.findOne({ _id: req.params.id, ...caseManagement.caseAccessFilter(req.user) })
    );
    if (!record) return res.status(404).json({ message: 'Case not found' });
    res.json({ case: caseManagement.visibleCase(record, req.user) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/comments', caseCommentSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const record = memoryCases.find((item) => item._id === req.params.id);
      if (!record || !memoryCaseVisibleTo(record, req.user)) return res.status(404).json({ message: 'Case not found' });
      if (record.status === 'closed')
        return res.status(409).json({ message: 'Closed cases cannot receive new comments' });
      if (['resolved', 'dismissed'].includes(record.status)) {
        record.status = 'in_progress';
        record.reopenCount = Number(record.reopenCount || 0) + 1;
        record.reopenedAt = new Date().toISOString();
      }
      if (['waiting_on_user', 'waiting_on_carrier'].includes(record.status)) record.status = 'in_progress';
      record.comments.push({
        author: req.user._id,
        body: req.body.body,
        visibility: 'participants',
        evidence: (req.body.evidenceUrls || []).map((url, index) => ({
          url,
          fileName: req.body.evidenceFileNames?.[index],
          addedBy: req.user._id,
          createdAt: new Date().toISOString()
        })),
        createdAt: new Date().toISOString()
      });
      record.updatedAt = new Date().toISOString();
      return res.status(201).json({ case: visibleMemoryCase(record, req.user), mode: 'memory' });
    }
    const record = await IssueReport.findOne({ _id: req.params.id, ...caseManagement.caseAccessFilter(req.user) });
    if (!record) return res.status(404).json({ message: 'Case not found' });
    await caseManagement.addComment(record, req.body, req.user._id, {
      isAdmin: req.user.role === 'admin',
      io: req.app.get('io')
    });
    res.status(201).json({ case: caseManagement.visibleCase(record, req.user) });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reopen', reopenCaseSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const record = memoryCases.find((item) => item._id === req.params.id);
      if (!record || !memoryCaseVisibleTo(record, req.user)) return res.status(404).json({ message: 'Case not found' });
      if (!['resolved', 'dismissed'].includes(record.status)) {
        return res.status(409).json({ message: 'Only resolved or dismissed cases can be reopened' });
      }
      record.status = 'in_progress';
      record.reopenCount = Number(record.reopenCount || 0) + 1;
      record.reopenedAt = new Date().toISOString();
      return res.json({ case: visibleMemoryCase(record, req.user), mode: 'memory' });
    }
    const record = await IssueReport.findOne({ _id: req.params.id, ...caseManagement.caseAccessFilter(req.user) });
    if (!record) return res.status(404).json({ message: 'Case not found' });
    await caseManagement.reopenCase(record, req.user._id, {
      note: req.body.note,
      io: req.app.get('io')
    });
    res.json({ case: caseManagement.visibleCase(record, req.user) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.memoryCases = memoryCases;
module.exports.pageOptions = pageOptions;
