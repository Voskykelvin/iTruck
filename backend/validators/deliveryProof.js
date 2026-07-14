const { body } = require('express-validator');
const { liveMongoIdParam } = require('./common');
const { strictDeliveryProof } = require('../config/deliveryProofPolicy');

const proofBookingIdSchema = [liveMongoIdParam('id')];

const proofAssetUploadSchema = [
  ...proofBookingIdSchema,
  body().custom((_, { req }) => {
    if (!strictDeliveryProof()) return true;
    const capturedAt = new Date(req.body.capturedAt);
    const lat = Number(req.body.lat);
    const lng = Number(req.body.lng);
    const accuracy = req.body.accuracy;
    if (Number.isNaN(capturedAt.getTime())) throw new Error('capturedAt is required and must be a valid timestamp');
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('Photo latitude is invalid');
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('Photo longitude is invalid');
    if (accuracy !== undefined && accuracy !== '' && (!Number.isFinite(Number(accuracy)) || Number(accuracy) < 0)) {
      throw new Error('Photo GPS accuracy is invalid');
    }
    return true;
  })
];

const finalizeDeliveryProofSchema = [
  ...proofBookingIdSchema,
  body('assetIds').isArray({ min: 1, max: 5 }).withMessage('assetIds must contain between 1 and 5 delivery photos'),
  body('assetIds.*').isMongoId().withMessage('Every delivery photo id must be valid'),
  body().custom((_, { req }) => {
    if (!strictDeliveryProof()) return true;
    const payload = req.body || {};
    if (!/^\d{6}$/.test(String(payload.otp || ''))) throw new Error('otp must be a 6-digit code');
    if (!String(payload.signerName || '').trim()) throw new Error('signerName is required');
    if (!['typed', 'drawn'].includes(payload.signatureType || 'typed')) {
      throw new Error('signatureType must be typed or drawn');
    }
    if (!String(payload.signatureValue || '').trim()) throw new Error('signatureValue is required');
    if (payload.consent !== true) throw new Error('consent is required');
    if (Number.isNaN(new Date(payload.signedAt).getTime())) throw new Error('signedAt must be a valid timestamp');
    if (Number.isNaN(new Date(payload.clientTimestamp).getTime())) {
      throw new Error('clientTimestamp must be a valid timestamp');
    }
    const lat = Number(payload.location?.lat);
    const lng = Number(payload.location?.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error('Delivery latitude is invalid');
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error('Delivery longitude is invalid');
    if (Number.isNaN(new Date(payload.location?.recordedAt).getTime())) {
      throw new Error('Delivery GPS timestamp is required');
    }
    return true;
  })
];

module.exports = {
  finalizeDeliveryProofSchema,
  proofAssetUploadSchema,
  proofBookingIdSchema
};
