const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, required: true },
    title: String,
    message: String,
    category: {
      type: String,
      enum: ['bookings', 'tracking', 'documents', 'payments', 'security', 'marketing', 'system'],
      default: 'system'
    },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    channels: {
      inApp: { type: Boolean, default: true },
      push: { type: Boolean, default: false },
      email: { type: Boolean, default: false },
      sms: { type: Boolean, default: false }
    },
    suppressed: { type: Boolean, default: false },
    suppressionReason: String,
    dedupeKey: { type: String, trim: true },
    read: { type: Boolean, default: false },
    data: Object,
    expiresAt: { type: Date, index: { expires: 0 } }
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ user: 1, type: 1, createdAt: -1 });
notificationSchema.index(
  { user: 1, dedupeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { dedupeKey: { $type: 'string' } }
  }
);

notificationSchema.statics.unreadCount = function unreadCount(user) {
  return this.countDocuments({
    user,
    read: false,
    suppressed: { $ne: true },
    $or: [{ 'channels.inApp': true }, { 'channels.inApp': { $exists: false }, 'channels.push': true }]
  });
};

module.exports = mongoose.model('Notification', notificationSchema);
