const express = require('express');
const mongoose = require('mongoose');
const multer = require('multer');
const Booking = require('../models/Booking');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect, restrictTo } = require('../middleware/auth');
const { deliveryOtpLimiter } = require('../middleware/security');
const validate = require('../middleware/validate');
const cloudinary = require('../services/cloudinary');
const deliveryProof = require('../services/deliveryProof');
const notifications = require('../services/notifications');
const matching = require('../services/matching');
const { deliveryProofPolicy, strictDeliveryProof } = require('../config/deliveryProofPolicy');
const { ensureAllowedFile, fileExtensions, imageUploadTypes } = require('../utils/uploadValidation');
const {
  finalizeDeliveryProofSchema,
  proofAssetUploadSchema,
  proofBookingIdSchema
} = require('../validators/deliveryProof');
const { bookingVisibleTo, canCaptureDeliveryProof } = require('../services/bookingAccess');

const { memoryBookings } = require('../data/demo-bookings');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 }
});

router.use(protect);

router.get('/delivery-proof/policy', (req, res) => {
  res.json({ ...deliveryProofPolicy(), directShipperConfirmation: !mongoReady() });
});

function requireProofDatabase(req, res) {
  return requireDatabase(req, res);
}

async function bookingForProof(req, res) {
  const booking = await Booking.findById(req.params.id);
  if (!booking) {
    res.status(404).json({ message: 'Booking not found' });
    return null;
  }
  return booking;
}

router.get('/:id/delivery-proof', proofBookingIdSchema, validate, async (req, res, next) => {
  try {
    if (requireProofDatabase(req, res)) return;
    if (!mongoReady()) {
      const booking = memoryBookings.find((item) => item._id === req.params.id || item.id === req.params.id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });
      if (!bookingVisibleTo(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });
      return res.json({
        booking,
        proof: booking.deliveryProof || null,
        assets: booking.deliveryProofAssets || [],
        mode: 'memory'
      });
    }

    const booking = await bookingForProof(req, res);
    if (!booking) return;
    if (!bookingVisibleTo(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });

    const bundle = await deliveryProof.deliveryProofBundle(booking._id);
    res.json(bundle);
  } catch (err) {
    next(err);
  }
});

router.post(
  '/:id/delivery-proof/otp',
  restrictTo('owner', 'driver', 'admin'),
  deliveryOtpLimiter,
  proofBookingIdSchema,
  validate,
  async (req, res, next) => {
    try {
      if (requireProofDatabase(req, res)) return;
      if (!mongoReady()) {
        const booking = memoryBookings.find((item) => item._id === req.params.id || item.id === req.params.id);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        if (!canCaptureDeliveryProof(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });
        return res.status(201).json({
          challenge: {
            id: `otp-demo-${Date.now()}`,
            status: 'pending',
            receiverPhoneLast4: '3344',
            expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            sentAt: new Date().toISOString()
          },
          mode: 'memory'
        });
      }

      const booking = await bookingForProof(req, res);
      if (!booking) return;
      if (!canCaptureDeliveryProof(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });

      const challenge = await deliveryProof.requestReceiverOtp({ booking, actor: req.user });
      res.status(201).json({
        challenge: {
          id: challenge._id,
          status: challenge.status,
          receiverPhoneLast4: challenge.receiverPhoneLast4,
          expiresAt: challenge.expiresAt,
          sentAt: challenge.sentAt
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/delivery-proof/assets',
  restrictTo('owner', 'driver', 'admin'),
  upload.array('files', 5),
  proofAssetUploadSchema,
  validate,
  async (req, res, next) => {
    try {
      if (requireProofDatabase(req, res)) return;
      const files = (req.files || []).filter((file) => file?.buffer);
      if (!files.length) return res.status(400).json({ message: 'At least one delivery photo is required.' });
      files.forEach((file) => ensureAllowedFile(file, imageUploadTypes, 'Delivery proof'));

      if (!mongoReady()) {
        const booking = memoryBookings.find((item) => item._id === req.params.id || item.id === req.params.id);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        if (!canCaptureDeliveryProof(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });

        const assets = files.map((file) => {
          const assetId = new mongoose.Types.ObjectId().toHexString();
          return {
            _id: assetId,
            url: `/api/uploads/local/delivery-proof-${Date.now()}.png`,
            fileName: file.originalname || 'proof.png',
            contentHash: 'a'.repeat(64),
            recordHash: 'b'.repeat(64),
            capturedAt: new Date().toISOString(),
            location: { lat: -1.286389, lng: 36.817223 }
          };
        });
        booking.deliveryProofAssets = [...(booking.deliveryProofAssets || []), ...assets];
        return res.status(201).json({
          assets: assets.map((asset) => ({
            id: asset._id,
            url: asset.url,
            fileName: asset.fileName,
            contentHash: asset.contentHash,
            recordHash: asset.recordHash,
            capturedAt: asset.capturedAt,
            location: asset.location
          })),
          mode: 'memory'
        });
      }

      const booking = await bookingForProof(req, res);
      if (!booking) return;
      if (!canCaptureDeliveryProof(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });

      const assets = [];
      for (const file of files) {
        const url = await cloudinary.uploadBuffer(file.buffer, {
          folder: `itruck/delivery-proof/${booking._id}`,
          localExtension: fileExtensions[file.mimetype]
        });
        assets.push(
          await deliveryProof.createProofAsset({
            booking,
            actor: req.user,
            file,
            uploadUrl: url,
            capturedAt: req.body.capturedAt,
            location: {
              lat: req.body.lat,
              lng: req.body.lng,
              accuracy: req.body.accuracy
            }
          })
        );
      }

      res.status(201).json({
        assets: assets.map((asset) => ({
          id: asset._id,
          url: asset.url,
          fileName: asset.fileName,
          contentHash: asset.contentHash,
          recordHash: asset.recordHash,
          capturedAt: asset.capturedAt,
          location: asset.location
        }))
      });
    } catch (err) {
      next(err);
    }
  }
);

router.post(
  '/:id/delivery-proof/finalize',
  restrictTo('owner', 'driver', 'admin'),
  finalizeDeliveryProofSchema,
  validate,
  async (req, res, next) => {
    try {
      if (requireProofDatabase(req, res)) return;
      if (!mongoReady()) {
        const booking = memoryBookings.find((item) => item._id === req.params.id || item.id === req.params.id);
        if (!booking) return res.status(404).json({ message: 'Booking not found' });
        if (!canCaptureDeliveryProof(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });

        booking.status = 'delivered';
        booking.deliveredAt = new Date().toISOString();
        booking.deliveryProof = {
          proof: true,
          recordHash: 'c'.repeat(64),
          verificationMethod: 'photo',
          verifiedAt: new Date().toISOString(),
          photoCount: (booking.deliveryProofAssets || []).length || 1
        };
        const io = req.app.get('io');
        if (io?.emitToBooking) {
          io.emitToBooking(booking._id, 'delivery-proof-finalized', {
            booking,
            proof: booking.deliveryProof,
            chainHeadHash: 'c'.repeat(64)
          });
        }
        return res.status(201).json({
          booking,
          proof: booking.deliveryProof,
          chainHeadHash: 'c'.repeat(64),
          mode: 'memory'
        });
      }

      const booking = await bookingForProof(req, res);
      if (!booking) return;
      if (!canCaptureDeliveryProof(req.user, booking)) return res.status(403).json({ message: 'Forbidden' });

      const result = await deliveryProof.finalizeDeliveryProof({
        booking,
        actor: req.user,
        payload: {
          ...req.body,
          signatureType: req.body.signatureType || 'typed'
        },
        req
      });

      if (result.booking.status === 'delivered') {
        await matching.releaseAssignment(result.booking, 'delivered').catch((err) => {
          req.log?.error({ err, bookingId: result.booking._id }, 'Dispatch capacity release failed after delivery');
        });
      }

      await notifications.notifyBookingParties(
        result.booking,
        'shipment.delivery_proof',
        {
          title: `${result.booking._id} ${result.booking.status === 'delivered' ? 'delivered' : 'receiver proof verified'}`,
          message: strictDeliveryProof()
            ? 'Receiver OTP, electronic signature, GPS, and delivery photos were verified.'
            : 'Delivery photo verified. The shipment is now marked as delivered.',
          link: `/app/shipments/${result.booking._id}`,
          bookingId: result.booking._id,
          proofHash: result.proof.recordHash,
          reviewRequested: result.booking.status === 'delivered'
        },
        req.app.get('io')
      );
      const io = req.app.get('io');
      if (io?.emitToBooking) {
        io.emitToBooking(result.booking._id, 'delivery-proof-finalized', {
          booking: result.booking,
          proof: result.proof,
          chainHeadHash: result.chainHeadHash
        });
      }

      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
