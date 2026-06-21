const mongoose = require('mongoose');
const { makeImmutable } = require('../utils/immutableRecord');

const locationSchema = new mongoose.Schema(
  {
    lat: { type: Number, min: -90, max: 90, required: true },
    lng: { type: Number, min: -180, max: 180, required: true },
    accuracy: { type: Number, min: 0, max: 10000 }
  },
  { _id: false }
);

const deliveryProofAssetSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    url: { type: String, required: true },
    fileName: { type: String, required: true, trim: true, maxlength: 240 },
    mimeType: {
      type: String,
      enum: ['image/jpeg', 'image/png', 'image/webp'],
      required: true
    },
    size: { type: Number, required: true, min: 1, max: 10 * 1024 * 1024 },
    contentHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    recordHash: { type: String, required: true, unique: true, match: /^[a-f0-9]{64}$/ },
    capturedAt: { type: Date, required: true },
    uploadedAt: { type: Date, default: Date.now, required: true },
    location: { type: locationSchema, required: true }
  },
  { timestamps: true }
);

deliveryProofAssetSchema.index({ booking: 1, createdAt: -1 });
deliveryProofAssetSchema.index({ booking: 1, contentHash: 1 });
deliveryProofAssetSchema.index({ uploadedBy: 1, createdAt: -1 });

makeImmutable(deliveryProofAssetSchema, 'Delivery proof asset');

module.exports = mongoose.model('DeliveryProofAsset', deliveryProofAssetSchema);
