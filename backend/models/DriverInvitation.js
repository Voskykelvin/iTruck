const mongoose = require('mongoose');

const driverInvitationSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    countryCode: { type: String, default: '+254' },
    country: { type: String, required: true, trim: true },
    tokenHash: { type: String, required: true, unique: true, select: false },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'revoked', 'expired'],
      default: 'pending'
    },
    expiresAt: { type: Date, required: true },
    acceptedAt: Date,
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    revokedAt: Date,
    lastSentAt: Date
  },
  { timestamps: true }
);

driverInvitationSchema.index({ owner: 1, status: 1, createdAt: -1 });
driverInvitationSchema.index({ email: 1, status: 1 });
driverInvitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('DriverInvitation', driverInvitationSchema);
