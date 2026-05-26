const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: { type: String, required: true },
  title: String,
  message: String,
  priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
  channels: { push: Boolean, email: Boolean, sms: Boolean },
  read: { type: Boolean, default: false },
  data: Object,
  expiresAt: { type: Date, index: { expires: 0 } }
}, { timestamps: true });

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ user: 1, type: 1, createdAt: -1 });

notificationSchema.statics.unreadCount = function unreadCount(user) {
  return this.countDocuments({ user, read: false });
};

module.exports = mongoose.model('Notification', notificationSchema);
