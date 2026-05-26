const mongoose = require('mongoose');

const workflowRecordSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['request', 'bid', 'message', 'report'],
    required: true,
    index: true
  },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  status: { type: String, default: 'submitted', index: true },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

workflowRecordSchema.index({ type: 1, createdAt: -1 });
workflowRecordSchema.index({ booking: 1, createdAt: -1 });

module.exports = mongoose.model('WorkflowRecord', workflowRecordSchema);
