const mongoose = require('mongoose');
const { makeImmutable } = require('../utils/immutableRecord');

const deliveryProofPhotoSchema = new mongoose.Schema(
  {
    asset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DeliveryProofAsset',
      required: true
    },
    url: { type: String, required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    contentHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    recordHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    capturedAt: { type: Date, required: true }
  },
  { _id: false }
);

const deliveryProofSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true,
      unique: true
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    receiver: {
      name: { type: String, required: true, trim: true, maxlength: 120 },
      role: { type: String, trim: true, maxlength: 120 },
      phoneHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
      phoneLast4: { type: String, required: true, minlength: 2, maxlength: 4 }
    },
    verification: {
      method: { type: String, enum: ['sms_otp'], required: true },
      challenge: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DeliveryOtpChallenge',
        required: true
      },
      verifiedAt: { type: Date, required: true },
      provider: String
    },
    signature: {
      type: { type: String, enum: ['typed', 'drawn'], required: true },
      signerName: { type: String, required: true, trim: true, maxlength: 120 },
      signerRole: { type: String, trim: true, maxlength: 120 },
      consentText: { type: String, required: true, maxlength: 500 },
      signedAt: { type: Date, required: true },
      valueHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ }
    },
    location: {
      lat: { type: Number, min: -90, max: 90, required: true },
      lng: { type: Number, min: -180, max: 180, required: true },
      accuracy: { type: Number, min: 0, max: 10000 },
      recordedAt: { type: Date, required: true },
      ingestedAt: { type: Date, required: true },
      distanceToDestinationMeters: { type: Number, min: 0 },
      geofenceMeters: { type: Number, min: 25, max: 5000 },
      destinationLat: { type: Number, min: -90, max: 90 },
      destinationLng: { type: Number, min: -180, max: 180 }
    },
    photos: {
      type: [deliveryProofPhotoSchema],
      validate: {
        validator(value) {
          return Array.isArray(value) && value.length >= 1 && value.length <= 5;
        },
        message: 'Delivery proof requires between 1 and 5 photos'
      }
    },
    clientMetadata: {
      timestamp: Date,
      timezone: { type: String, maxlength: 100 },
      userAgent: { type: String, maxlength: 1000 },
      ipHash: { type: String, match: /^[a-f0-9]{64}$/ }
    },
    previousCustodyHash: { type: String, match: /^[a-f0-9]{64}$/ },
    recordHash: { type: String, required: true, unique: true, match: /^[a-f0-9]{64}$/ }
  },
  { timestamps: true }
);

deliveryProofSchema.index({ submittedBy: 1, createdAt: -1 });
deliveryProofSchema.index({ 'verification.verifiedAt': -1 });
deliveryProofSchema.index({ 'photos.contentHash': 1 });

makeImmutable(deliveryProofSchema, 'Delivery proof');

module.exports = mongoose.model('DeliveryProof', deliveryProofSchema);
