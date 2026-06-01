const mongoose = require('mongoose');

const STATUSES = ['pending', 'bidding', 'confirmed', 'in_transit', 'delivered', 'cancelled', 'disputed'];
const STATUS_TRANSITIONS = {
  pending: ['bidding', 'cancelled', 'disputed'],
  bidding: ['confirmed', 'cancelled', 'disputed'],
  confirmed: ['in_transit', 'cancelled', 'disputed'],
  in_transit: ['delivered', 'disputed'],
  delivered: [],
  cancelled: [],
  disputed: []
};

function assertStatusTransition(from, to) {
  if (!to || from === to) return;
  if (!STATUSES.includes(to)) {
    const err = new Error(`Invalid booking status: ${to}`);
    err.status = 400;
    throw err;
  }

  const allowed = STATUS_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    const err = new Error(`Invalid booking status transition from ${from || 'unknown'} to ${to}`);
    err.status = 400;
    throw err;
  }
}

const bookingSchema = new mongoose.Schema({
  client: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  truck: { type: mongoose.Schema.Types.ObjectId, ref: 'Truck' },
  pickup: String,
  destination: String,
  distance: Number,
  border: String,
  pickupDate: Date,
  pickupWindow: String,
  vehicleType: String,
  cargo: String,
  cargoValue: Number,
  weight: String,
  requirements: String,
  receiverName: String,
  receiverPhone: String,
  communicationPreference: String,
  quietHours: String,
  optionalServices: [String],
  budget: Number,
  paymentMethod: String,
  estimate: mongoose.Schema.Types.Mixed,
  quoteAcknowledged: { type: Boolean, default: false },
  status: {
    type: String,
    enum: STATUSES,
    default: 'pending'
  },
  bids: [{
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    truck: { type: mongoose.Schema.Types.ObjectId, ref: 'Truck' },
    amount: Number,
    message: String,
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
  }],
  tracking: [{
    lat: Number,
    lng: Number,
    speed: Number,
    heading: Number,
    timestamp: { type: Date, default: Date.now }
  }],
  documents: [{
    type: { type: String, enum: ['waybill', 'pod', 'invoice', 'customs'], required: true },
    url: { type: String, required: true },
    publicId: String,
    generatedAt: { type: Date, default: Date.now }
  }],
  rating: { score: Number, comment: String }
}, { timestamps: true });

bookingSchema.index({ client: 1, createdAt: -1 });
bookingSchema.index({ client: 1, status: 1, createdAt: -1 });
bookingSchema.index({ owner: 1, createdAt: -1 });
bookingSchema.index({ owner: 1, status: 1, createdAt: -1 });
bookingSchema.index({ status: 1, createdAt: -1 });
bookingSchema.index({ status: 1, owner: 1, createdAt: -1 });
bookingSchema.index({ truck: 1, createdAt: -1 });
bookingSchema.index({ 'bids.owner': 1, createdAt: -1 });
bookingSchema.index({ 'documents.type': 1 });

bookingSchema.statics.STATUSES = STATUSES;
bookingSchema.statics.STATUS_TRANSITIONS = STATUS_TRANSITIONS;
bookingSchema.statics.assertStatusTransition = assertStatusTransition;

bookingSchema.methods.transitionTo = function transitionTo(nextStatus) {
  assertStatusTransition(this.status, nextStatus);
  this.status = nextStatus;
  return this;
};

bookingSchema.pre('save', async function validateStatusTransition() {
  if (this.isNew || !this.isModified('status')) return;

  const previous = await this.constructor.findById(this._id).select('status').lean();
  assertStatusTransition(previous?.status, this.status);
});

module.exports = mongoose.model('Booking', bookingSchema);
