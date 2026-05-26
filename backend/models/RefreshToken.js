const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revokedAt: Date,
  replacedByTokenHash: String,
  userAgent: String,
  ip: String
}, { timestamps: true });

refreshTokenSchema.index({ user: 1, revokedAt: 1, expiresAt: -1 });

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);
