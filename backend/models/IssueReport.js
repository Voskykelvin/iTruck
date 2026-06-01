const mongoose = require('mongoose');

const issueReportSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  status: {
    type: String,
    enum: ['submitted', 'reviewing', 'resolved', 'dismissed'],
    default: 'submitted'
  },
  severity: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
  message: { type: String, trim: true, maxlength: 2000 },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

issueReportSchema.index({ user: 1, createdAt: -1 });
issueReportSchema.index({ user: 1, booking: 1, createdAt: -1 });
issueReportSchema.index({ booking: 1, createdAt: -1 });
issueReportSchema.index({ status: 1, severity: 1, createdAt: -1 });
issueReportSchema.index({ createdAt: -1 });

module.exports = mongoose.model('IssueReport', issueReportSchema);
