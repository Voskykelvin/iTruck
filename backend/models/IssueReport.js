const mongoose = require('mongoose');

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
const CASE_PRIORITIES = ['low', 'normal', 'high', 'urgent'];
const RESOLUTION_OUTCOMES = [
  'resume_booking',
  'cancel_booking',
  'confirm_delivery',
  'refund_required',
  'no_action',
  'dismissed'
];

const evidenceSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true, maxlength: 1000 },
    fileName: { type: String, trim: true, maxlength: 255 },
    contentType: { type: String, trim: true, maxlength: 120 },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const commentSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    visibility: {
      type: String,
      enum: ['participants', 'internal'],
      default: 'participants'
    },
    evidence: { type: [evidenceSchema], default: [] },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const timelineSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true, trim: true, maxlength: 120 },
    fromStatus: String,
    toStatus: String,
    visibility: {
      type: String,
      enum: ['participants', 'internal'],
      default: 'participants'
    },
    note: { type: String, trim: true, maxlength: 1000 },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: true }
);

const resolutionSchema = new mongoose.Schema(
  {
    outcome: { type: String, enum: RESOLUTION_OUTCOMES },
    summary: { type: String, trim: true, maxlength: 4000 },
    bookingStatus: String,
    requiresRefund: { type: Boolean, default: false },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
    evidenceUrls: { type: [String], default: [] }
  },
  { _id: false }
);

const issueReportSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    caseNumber: { type: String, trim: true, uppercase: true },
    kind: { type: String, enum: CASE_KINDS, default: 'support' },
    category: { type: String, enum: CASE_CATEGORIES, default: 'other' },
    title: { type: String, trim: true, maxlength: 200 },
    status: {
      type: String,
      enum: CASE_STATUSES,
      default: 'open'
    },
    severity: { type: String, enum: ['low', 'normal', 'high', 'critical'], default: 'normal' },
    priority: { type: String, enum: CASE_PRIORITIES, default: 'normal' },
    priorityRank: { type: Number, default: 2, min: 1, max: 4 },
    message: { type: String, trim: true, maxlength: 2000 },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    evidence: { type: [evidenceSchema], default: [] },
    comments: { type: [commentSchema], default: [] },
    timeline: { type: [timelineSchema], default: [] },
    resolution: { type: resolutionSchema, default: () => ({}) },
    bookingStatusBeforeDispute: String,
    firstResponseDueAt: Date,
    resolutionDueAt: Date,
    firstRespondedAt: Date,
    firstResponseBreachedAt: Date,
    resolutionBreachedAt: Date,
    slaPausedAt: Date,
    escalationLevel: { type: Number, default: 0, min: 0, max: 5 },
    lastEscalatedAt: Date,
    openedAt: { type: Date, default: Date.now },
    resolvedAt: Date,
    closedAt: Date,
    reopenedAt: Date,
    reopenCount: { type: Number, default: 0, min: 0 },
    lastActivityAt: { type: Date, default: Date.now },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

issueReportSchema.index({ caseNumber: 1 }, { unique: true, sparse: true });
issueReportSchema.index({ user: 1, createdAt: -1 });
issueReportSchema.index({ user: 1, booking: 1, createdAt: -1 });
issueReportSchema.index({ booking: 1, createdAt: -1 });
issueReportSchema.index({ status: 1, priorityRank: -1, createdAt: -1 });
issueReportSchema.index({ assignedTo: 1, status: 1, resolutionDueAt: 1 });
issueReportSchema.index({ status: 1, firstResponseDueAt: 1, resolutionDueAt: 1 });
issueReportSchema.index({ createdAt: -1 });

issueReportSchema.statics.CASE_KINDS = CASE_KINDS;
issueReportSchema.statics.CASE_CATEGORIES = CASE_CATEGORIES;
issueReportSchema.statics.CASE_STATUSES = CASE_STATUSES;
issueReportSchema.statics.CASE_PRIORITIES = CASE_PRIORITIES;
issueReportSchema.statics.RESOLUTION_OUTCOMES = RESOLUTION_OUTCOMES;

module.exports = mongoose.model('IssueReport', issueReportSchema);
