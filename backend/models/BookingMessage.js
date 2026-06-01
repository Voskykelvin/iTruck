const mongoose = require('mongoose');

const bookingMessageSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
  text: { type: String, required: true, trim: true, maxlength: 2000 },
  status: {
    type: String,
    enum: ['sent', 'read', 'failed'],
    default: 'sent'
  },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

bookingMessageSchema.index({ booking: 1, createdAt: 1 });
bookingMessageSchema.index({ user: 1, booking: 1, createdAt: -1 });
bookingMessageSchema.index({ user: 1, createdAt: -1 });
bookingMessageSchema.index({ status: 1, createdAt: -1 });
bookingMessageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BookingMessage', bookingMessageSchema);
