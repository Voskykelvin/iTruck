const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
    revokedAt: Date,
    replacedByTokenHash: String,
    userAgent: String,
    ip: String,
    deviceId: { type: String, trim: true, index: true },
    deviceName: { type: String, trim: true, maxlength: 120, default: 'Unknown device' },
    deviceType: { type: String, enum: ['mobile', 'tablet', 'desktop', 'unknown'], default: 'unknown' },
    ipAddress: String,
    lastUsedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

refreshTokenSchema.index({ user: 1, revokedAt: 1, expiresAt: -1 });
refreshTokenSchema.index({ user: 1, deviceId: 1, revokedAt: 1 });

refreshTokenSchema.methods.isActive = function isActive() {
  return !this.revokedAt && this.expiresAt > new Date();
};

refreshTokenSchema.methods.revoke = function revoke(replacedByTokenHash) {
  this.revokedAt = new Date();
  if (replacedByTokenHash) this.replacedByTokenHash = replacedByTokenHash;
  return this.save();
};

refreshTokenSchema.statics.findActive = function findActive(tokenHash) {
  return this.findOne({
    tokenHash,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  });
};

refreshTokenSchema.statics.activeSessions = function activeSessions(userId) {
  return this.find({
    user: userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() }
  })
    .select('deviceId deviceName deviceType ipAddress lastUsedAt createdAt expiresAt')
    .sort({ lastUsedAt: -1 });
};

refreshTokenSchema.statics.revokeAll = function revokeAll(userId, exceptDeviceId = null) {
  const filter = { user: userId, revokedAt: null };
  if (exceptDeviceId) filter.deviceId = { $ne: exceptDeviceId };
  return this.updateMany(filter, { $set: { revokedAt: new Date() } });
};

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
