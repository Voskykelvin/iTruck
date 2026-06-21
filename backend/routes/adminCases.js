const express = require('express');
const mongoose = require('mongoose');
const IssueReport = require('../models/IssueReport');
const User = require('../models/User');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { recordAdminAudit } = require('../services/audit');
const caseManagement = require('../services/caseManagement');
const { memoryCases, pageOptions } = require('./cases');
const {
  assignCaseSchema,
  caseCommentSchema,
  listCasesSchema,
  reopenCaseSchema,
  resolveCaseSchema,
  updateCaseStatusSchema
} = require('../validators/cases');

const router = express.Router();
router.use(protect, restrictTo('admin'));

function populateCase(query) {
  return query
    .populate('user', 'firstName lastName email phone role')
    .populate('assignedTo', 'firstName lastName email role')
    .populate('participants', 'firstName lastName email role')
    .populate('booking', 'pickup destination cargo status paymentStatus disputeStatusBefore')
    .populate('comments.author', 'firstName lastName email role')
    .populate('timeline.actor', 'firstName lastName email role');
}

router.get('/', listCasesSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const filtered = memoryCases.filter(
        (record) =>
          (!req.query.status || record.status === req.query.status) &&
          (!req.query.kind || record.kind === req.query.kind) &&
          (!req.query.priority || record.priority === req.query.priority) &&
          (!req.query.booking || String(record.booking) === String(req.query.booking)) &&
          (req.query.assignedTo === 'unassigned'
            ? !record.assignedTo
            : !req.query.assignedTo || String(record.assignedTo) === String(req.query.assignedTo))
      );
      const { page, limit, skip } = pageOptions(req.query);
      return res.json({
        cases: filtered.slice(skip, skip + limit),
        pagination: { page, limit, total: filtered.length },
        mode: 'memory'
      });
    }
    const { page, limit, skip } = pageOptions(req.query);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.kind) filter.kind = req.query.kind;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.booking && mongoose.Types.ObjectId.isValid(req.query.booking)) filter.booking = req.query.booking;
    if (req.query.assignedTo === 'unassigned') filter.assignedTo = null;
    else if (req.query.assignedTo && mongoose.Types.ObjectId.isValid(req.query.assignedTo)) {
      filter.assignedTo = req.query.assignedTo;
    }
    const [cases, total] = await Promise.all([
      populateCase(
        IssueReport.find(filter)
          .sort({ priorityRank: -1, resolutionDueAt: 1, lastActivityAt: -1 })
          .skip(skip)
          .limit(limit)
      ),
      IssueReport.countDocuments(filter)
    ]);
    res.json({ cases, pagination: { page, limit, total } });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/assign', assignCaseSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const record = memoryCases.find((item) => item._id === req.params.id);
      if (!record) return res.status(404).json({ message: 'Case not found' });
      if (record.status === 'closed') return res.status(409).json({ message: 'Closed cases cannot be reassigned' });
      record.assignedTo = req.body.assignedTo;
      record.status = record.status === 'open' ? 'triaged' : record.status;
      return res.json({ case: record, mode: 'memory' });
    }
    const [record, assignee] = await Promise.all([
      IssueReport.findById(req.params.id),
      User.findOne({ _id: req.body.assignedTo, role: 'admin', isActive: { $ne: false } })
    ]);
    if (!record) return res.status(404).json({ message: 'Case not found' });
    if (!assignee) return res.status(404).json({ message: 'Active admin assignee not found' });
    await caseManagement.assignCase(record, assignee._id, req.user._id, {
      note: req.body.note,
      io: req.app.get('io')
    });
    await recordAdminAudit(req, 'case.assigned', 'case', record._id, { assignedTo: assignee._id });
    res.json({ case: record });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/status', updateCaseStatusSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const record = memoryCases.find((item) => item._id === req.params.id);
      if (!record) return res.status(404).json({ message: 'Case not found' });
      if (record.status === 'closed') return res.status(409).json({ message: 'Closed cases cannot change status' });
      record.status = req.body.status;
      return res.json({ case: record, mode: 'memory' });
    }
    const record = await IssueReport.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Case not found' });
    await caseManagement.changeCaseStatus(record, req.body.status, req.user._id, {
      note: req.body.note,
      io: req.app.get('io')
    });
    await recordAdminAudit(req, 'case.status.updated', 'case', record._id, {
      status: req.body.status,
      note: req.body.note
    });
    res.json({ case: record });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/comments', caseCommentSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const record = memoryCases.find((item) => item._id === req.params.id);
      if (!record) return res.status(404).json({ message: 'Case not found' });
      if (record.status === 'closed')
        return res.status(409).json({ message: 'Closed cases cannot receive new comments' });
      record.comments.push({
        author: req.user._id,
        body: req.body.body,
        visibility: req.body.visibility || 'participants',
        evidence: (req.body.evidenceUrls || []).map((url, index) => ({
          url,
          fileName: req.body.evidenceFileNames?.[index],
          addedBy: req.user._id,
          createdAt: new Date().toISOString()
        })),
        createdAt: new Date().toISOString()
      });
      return res.status(201).json({ case: record, mode: 'memory' });
    }
    const record = await IssueReport.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Case not found' });
    await caseManagement.addComment(record, req.body, req.user._id, {
      isAdmin: true,
      io: req.app.get('io')
    });
    await recordAdminAudit(req, 'case.comment.added', 'case', record._id, {
      visibility: req.body.visibility || 'participants'
    });
    res.status(201).json({ case: record });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/resolve', resolveCaseSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const record = memoryCases.find((item) => item._id === req.params.id);
      if (!record) return res.status(404).json({ message: 'Case not found' });
      if (!caseManagement.ACTIVE_STATUSES.includes(record.status)) {
        return res.status(409).json({ message: 'Only active cases can be resolved' });
      }
      record.status = req.body.outcome === 'dismissed' ? 'dismissed' : 'resolved';
      record.resolution = {
        outcome: req.body.outcome,
        summary: req.body.summary,
        resolvedBy: req.user._id,
        resolvedAt: new Date().toISOString(),
        evidenceUrls: req.body.evidenceUrls || []
      };
      return res.json({ case: record, mode: 'memory' });
    }
    const record = await IssueReport.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Case not found' });
    await caseManagement.resolveCase(record, req.body, req.user._id, { io: req.app.get('io') });
    await recordAdminAudit(req, 'case.resolved', 'case', record._id, {
      outcome: req.body.outcome,
      summary: req.body.summary,
      booking: record.booking
    });
    res.json({ case: record });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/reopen', reopenCaseSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const record = memoryCases.find((item) => item._id === req.params.id);
      if (!record) return res.status(404).json({ message: 'Case not found' });
      if (!['resolved', 'dismissed'].includes(record.status)) {
        return res.status(409).json({ message: 'Only resolved or dismissed cases can be reopened' });
      }
      record.status = 'in_progress';
      record.reopenCount = Number(record.reopenCount || 0) + 1;
      return res.json({ case: record, mode: 'memory' });
    }
    const record = await IssueReport.findById(req.params.id);
    if (!record) return res.status(404).json({ message: 'Case not found' });
    await caseManagement.reopenCase(record, req.user._id, {
      note: req.body.note,
      io: req.app.get('io')
    });
    await recordAdminAudit(req, 'case.reopened', 'case', record._id, { note: req.body.note });
    res.json({ case: record });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
