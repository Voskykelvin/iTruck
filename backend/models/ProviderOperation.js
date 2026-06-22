const mongoose = require('mongoose');

const providerOperationSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['refund', 'payout'], required: true },
    provider: { type: String, enum: ['stripe', 'mpesa', 'mtn'], required: true },
    sourceTransaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    amount: { type: Number, required: true, min: 0.01 },
    currency: { type: String, default: 'USD' },
    status: {
      type: String,
      enum: ['processing', 'pending', 'completed', 'failed', 'cancelled'],
      default: 'processing'
    },
    idempotencyKey: { type: String, required: true, trim: true },
    providerReference: String,
    providerStatus: String,
    reason: String,
    destination: String,
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    providerResponse: mongoose.Schema.Types.Mixed,
    callbackPayloads: [mongoose.Schema.Types.Mixed],
    lastError: String,
    completedAt: Date,
    failedAt: Date
  },
  { timestamps: true }
);

providerOperationSchema.index({ idempotencyKey: 1 }, { unique: true });
providerOperationSchema.index({ provider: 1, providerReference: 1 }, { unique: true, sparse: true });
providerOperationSchema.index({ sourceTransaction: 1, type: 1, createdAt: -1 });
providerOperationSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model('ProviderOperation', providerOperationSchema);
