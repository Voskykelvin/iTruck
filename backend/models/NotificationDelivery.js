const mongoose = require('mongoose');

const notificationDeliverySchema = new mongoose.Schema(
  {
    notification: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Notification',
      required: true
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    channel: {
      type: String,
      enum: ['email', 'sms', 'push'],
      required: true
    },
    recipient: { type: String, required: true, trim: true },
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['pending', 'processing', 'retry', 'sent', 'delivered', 'failed', 'cancelled'],
      default: 'pending'
    },
    attempts: { type: Number, default: 0, min: 0 },
    maxAttempts: { type: Number, default: 4, min: 1, max: 10 },
    nextAttemptAt: { type: Date, default: Date.now },
    leaseUntil: Date,
    provider: String,
    providerMessageId: String,
    providerResponse: mongoose.Schema.Types.Mixed,
    lastError: String,
    sentAt: Date,
    failedAt: Date,
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)
    }
  },
  { timestamps: true }
);

notificationDeliverySchema.index({ notification: 1, channel: 1 }, { unique: true });
notificationDeliverySchema.index({ status: 1, nextAttemptAt: 1, leaseUntil: 1 });
notificationDeliverySchema.index({ user: 1, createdAt: -1 });
notificationDeliverySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('NotificationDelivery', notificationDeliverySchema);
