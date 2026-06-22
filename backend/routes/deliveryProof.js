const express = require('express');
const multer = require('multer');
const Booking = require('../models/Booking');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect, restrictTo } = require('../middleware/auth');
const { deliveryOtpLimiter } = require('../middleware/security');
const validate = require('../middleware/validate');
const cloudinary = require('../services/cloudinary');
const deliveryProof = require('../services/deliveryProof');
const notifications = require('../services/notifications');
const { ensureAllowedFile, fileExtensions, imageUploadTypes } = require('../utils/uploadValidation');
const {
  finalizeDeliveryProofSchema,
  proofAssetUploadSchema,
  proofBookingIdSchema
} = require('../validators/deliveryProof');
const { bookingVisibleTo, canCaptureDeliveryProof } = require('../services/bookingAccess');

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 }
});

router.use(protect);

function requireProofDatabase(req, res) {
  if (requireDatabase(req, res)) return true;
  if (mongoReady()) return false;
  res.status(503).json({ message: 'Receiver-grade delivery proof requires a connected database.' });
  return true;
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

      await notifications.notifyBookingParties(
        result.booking,
        'shipment.delivery_proof',
        {
          title: `${result.booking._id} receiver proof verified`,
          message: 'Receiver OTP, electronic signature, GPS, and delivery photos were verified.',
          link: '/app/tracking',
          bookingId: result.booking._id,
          proofHash: result.proof.recordHash
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
