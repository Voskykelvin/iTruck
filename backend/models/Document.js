const mongoose = require('mongoose');

const TARGET_MODELS = {
  user: 'User',
  truck: 'Truck',
  booking: 'Booking'
};

const documentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    targetType: {
      type: String,
      enum: Object.keys(TARGET_MODELS),
      required: true
    },
    targetModel: {
      type: String,
      enum: Object.values(TARGET_MODELS),
      required: true
    },
    target: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'targetModel',
      required: true
    },
    type: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      match: /^[a-z0-9-]{2,80}$/
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160
    },
    url: String,
    urls: [String],
    fileName: String,
    fileNames: [String],
    publicId: String,
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'expired'],
      default: 'pending'
    },
    source: {
      type: String,
      enum: ['uploaded', 'generated', 'reviewed', 'imported'],
      default: 'uploaded'
    },
    notes: String,
    reviewNotes: String,
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewedAt: Date,
    generatedAt: Date,
    expiresAt: Date,
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      default: null
    },
    truck: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Truck',
      default: null
    },
    metadata: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

documentSchema.index({ targetType: 1, target: 1, type: 1 }, { unique: true });
documentSchema.index({ user: 1, status: 1, updatedAt: -1 });
documentSchema.index({ status: 1, updatedAt: -1 });
documentSchema.index({ booking: 1, type: 1 });
documentSchema.index({ truck: 1, type: 1 });
documentSchema.index({ source: 1, updatedAt: -1 });
documentSchema.index({ expiresAt: 1 }, { sparse: true });

documentSchema.statics.targetModelFor = function targetModelFor(targetType) {
  return TARGET_MODELS[targetType];
};

module.exports = mongoose.model('Document', documentSchema);
