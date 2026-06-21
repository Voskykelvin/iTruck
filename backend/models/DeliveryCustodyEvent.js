const mongoose = require('mongoose');
const { makeImmutable } = require('../utils/immutableRecord');

const deliveryCustodyEventSchema = new mongoose.Schema(
  {
    booking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Booking',
      required: true
    },
    sequence: { type: Number, required: true, min: 1 },
    eventType: {
      type: String,
      enum: ['otp.requested', 'photo.captured', 'proof.finalized', 'delivery.confirmed'],
      required: true
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    actorRole: {
      type: String,
      enum: ['client', 'owner', 'admin'],
      required: true
    },
    occurredAt: { type: Date, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    payloadHash: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    previousHash: { type: String, default: '', match: /^$|^[a-f0-9]{64}$/ },
    eventHash: { type: String, required: true, unique: true, match: /^[a-f0-9]{64}$/ }
  },
  { timestamps: true }
);

deliveryCustodyEventSchema.index({ booking: 1, sequence: 1 }, { unique: true });
deliveryCustodyEventSchema.index({ booking: 1, occurredAt: 1 });
deliveryCustodyEventSchema.index({ eventType: 1, occurredAt: -1 });

makeImmutable(deliveryCustodyEventSchema, 'Delivery custody event');

module.exports = mongoose.model('DeliveryCustodyEvent', deliveryCustodyEventSchema);
