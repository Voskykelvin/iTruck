const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userDocumentSchema = new mongoose.Schema({
  type: String,
  url: String,
  fileName: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'expired'], default: 'pending' },
  notes: String,
  reviewedAt: Date
});

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true },
    countryCode: { type: String, default: '+254' },
    password: { type: String, required: true, minlength: 8, select: false },
    role: { type: String, enum: ['client', 'owner', 'admin'], required: true },
    country: { type: String, required: true },
    accountType: { type: String, enum: ['personal', 'business', 'ngo'], default: 'personal' },
    company: String,
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    avatar: String,
    rating: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    totalTrips: { type: Number, default: 0 },
    documents: [userDocumentSchema],
    pushSubscription: Object,
    lastLogin: Date,
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false }
  },
  { timestamps: true }
);

userSchema.index({ role: 1, country: 1 });

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  return next();
});

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.password);
};

userSchema.methods.signToken = function signToken() {
  return jwt.sign({ id: this._id, role: this.role }, process.env.JWT_SECRET || 'dev-secret', {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || process.env.JWT_EXPIRES || '7d'
  });
};

module.exports = mongoose.model('User', userSchema);
