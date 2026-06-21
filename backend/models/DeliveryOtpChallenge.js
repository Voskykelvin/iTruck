const mongoose = require('mongoose');

const deliveryOtpChallengeSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      unique: true
    },
    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    receiverPhone: { type: String, required: true, trim: true },
    receiverPhoneHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    receiverPhoneLast4: { type: String, required: true, minlength: 2, maxlength: 4 },
    otpDigest: { type: String, required: true, select: false, match: /^[a-f0-9]{64}$/ },
    otpSalt: { type: String, required: true, select: false, match: /^[a-f0-9]{32}$/ },
    status: {
      type: String,
      enum: ['active', 'consumed', 'expired', 'locked', 'failed'],
      default: 'active'
    },
    attempts: { type: Number, min: 0, default: 0 },
    maxAttempts: { type: Number, min: 1, max: 10, default: 5 },
    requestedAt: { type: Date, default: Date.now },
    sentAt: Date,
    expiresAt: { type: Date, required: true },
    consumedAt: Date,
    provider: String,
    providerMessageId: String
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret) {
        delete ret.otpDigest;
        delete ret.otpSalt;
        delete ret.receiverPhone;
        return ret;
      }
    }
  }
);

deliveryOtpChallengeSchema.index({ status: 1, expiresAt: 1 });
deliveryOtpChallengeSchema.index({ requestedBy: 1, requestedAt: -1 });

module.exports = mongoose.model('DeliveryOtpChallenge', deliveryOtpChallengeSchema);
