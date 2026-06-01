const mongoose = require('mongoose');

const loadRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
    status: {
      type: String,
      enum: ['submitted', 'open', 'matched', 'cancelled'],
      default: 'submitted'
    },
    pickup: String,
    destination: String,
    cargo: String,
    vehicleType: String,
    budget: Number,
    payload: { type: mongoose.Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

loadRequestSchema.index({ user: 1, createdAt: -1 });
loadRequestSchema.index({ user: 1, booking: 1, createdAt: -1 });
loadRequestSchema.index({ status: 1, createdAt: -1 });
loadRequestSchema.index({ booking: 1, createdAt: -1 });
loadRequestSchema.index({ createdAt: -1 });

module.exports = mongoose.model('LoadRequest', loadRequestSchema);
