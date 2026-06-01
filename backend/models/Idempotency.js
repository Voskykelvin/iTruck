const mongoose = require('mongoose');

const idempotencySchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      trim: true,
      minlength: 8,
      maxlength: 128
    },
    scope: { type: String, default: 'payment', trim: true, maxlength: 80 },
    requestHash: { type: String, trim: true },
    status: {
      type: String,
      enum: ['processing', 'completed', 'failed'],
      default: 'processing'
    },
    result: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    error: {
      message: String,
      status: Number
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }
    },
    completedAt: Date,
    failedAt: Date
  },
  { timestamps: true }
);

idempotencySchema.index({ key: 1 }, { unique: true });
idempotencySchema.index({ scope: 1, createdAt: -1 });
idempotencySchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model('Idempotency', idempotencySchema);
