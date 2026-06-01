const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    type: { type: String, enum: ['credit', 'debit', 'payment', 'refund', 'withdrawal'], required: true },
    method: { type: String, enum: ['wallet', 'stripe', 'mpesa', 'mtn', 'cash', 'bank'], default: 'wallet' },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'USD' },
    status: { type: String, enum: ['pending', 'completed', 'failed', 'refunded'], default: 'pending' },
    reference: String,
    provider: String,
    providerEventId: String,
    description: String,
    metadata: Object
  },
  { timestamps: true }
);

transactionSchema.index({ user: 1, createdAt: -1 });
transactionSchema.index({ booking: 1, createdAt: -1 });
transactionSchema.index({ status: 1, type: 1, createdAt: -1 });
transactionSchema.index({ reference: 1 }, { sparse: true });
transactionSchema.index({ provider: 1, providerEventId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Transaction', transactionSchema);
