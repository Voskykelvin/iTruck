const mongoose = require('mongoose');

const STATUSES = [
  'pending',
  'bidding',
  'confirmed',
  'in_transit',
  'delivery_pending',
  'delivered',
  'cancelled',
  'disputed'
];
const PAYMENT_STATUSES = ['unpaid', 'pending', 'escrowed', 'release_pending', 'released', 'failed', 'refunded'];
const LOAD_MODES = ['full-truck', 'ltl'];
const STATUS_TRANSITIONS = {
  pending: ['bidding', 'cancelled', 'disputed'],
  bidding: ['confirmed', 'cancelled', 'disputed'],
  confirmed: ['in_transit', 'cancelled', 'disputed'],
  in_transit: ['delivery_pending', 'delivered', 'disputed'],
  delivery_pending: ['delivered', 'disputed'],
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

const ratingDetailSchema = new mongoose.Schema(
  {
    score: { type: Number, min: 1, max: 5 },
    comment: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    truck: { type: mongoose.Schema.Types.ObjectId, ref: 'Truck' },
    pickup: String,
    destination: String,
    pickupCoordinates: {
      lat: Number,
      lng: Number
    },
    destinationCoordinates: {
      lat: Number,
      lng: Number
    },
    deliveryGeofenceMeters: { type: Number, min: 25, max: 5000, default: 100 },
    distance: Number,
    border: String,
    pickupDate: Date,
    pickupWindow: String,
    vehicleType: String,
    loadMode: { type: String, enum: LOAD_MODES, default: 'full-truck' },
    cargoWeightTonnes: { type: Number, min: 0.01 },
    reservedCapacityTonnes: { type: Number, min: 0.01 },
    consolidationEligible: { type: Boolean, default: false },
    routeKey: { type: String, trim: true, lowercase: true },
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
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'unpaid' },
    paymentReference: String,
    paymentAmount: Number,
    paidAt: Date,
    releasedAt: Date,
    deliveredAt: Date,
    estimate: mongoose.Schema.Types.Mixed,
    quoteAcknowledged: { type: Boolean, default: false },
    status: {
      type: String,
      enum: STATUSES,
      default: 'pending'
    },
    bids: [
      {
        owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        truck: { type: mongoose.Schema.Types.ObjectId, ref: 'Truck' },
        amount: Number,
        message: String,
        status: { type: String, default: 'pending' },
        createdAt: { type: Date, default: Date.now }
      }
    ],
    tracking: [
      {
        lat: Number,
        lng: Number,
        speed: Number,
        heading: Number,
        accuracy: Number,
        timestamp: { type: Date, default: Date.now }
      }
    ],
    lastKnownLocation: {
      lat: { type: Number, min: -90, max: 90 },
      lng: { type: Number, min: -180, max: 180 },
      speed: { type: Number, min: 0, max: 180 },
      heading: { type: Number, min: 0, max: 360 },
      accuracy: { type: Number, min: 0, max: 10000 },
      recordedAt: Date,
      ingestedAt: Date
    },
    documents: [
      {
        type: {
          type: String,
          enum: [
            'waybill',
            'pod',
            'invoice',
            'customs',
            'receiver-confirmation',
            'packing-list',
            'cargo-photos',
            'material-safety-data-sheet',
            'cargo-value-declaration',
            'other'
          ],
          required: true
        },
        url: { type: String, required: true },
        urls: [String],
        fileName: String,
        fileNames: [String],
        publicId: String,
        status: { type: String, enum: ['pending', 'approved', 'rejected', 'expired'], default: 'approved' },
        notes: String,
        reviewedAt: Date,
        generatedAt: { type: Date, default: Date.now }
      }
    ],
    rating: {
      clientToOwner: ratingDetailSchema,
      ownerToClient: ratingDetailSchema
    }
  },
  { timestamps: true }
);

bookingSchema.index({ client: 1, createdAt: -1 });
bookingSchema.index({ client: 1, status: 1, createdAt: -1 });
bookingSchema.index({ owner: 1, createdAt: -1 });
bookingSchema.index({ owner: 1, status: 1, createdAt: -1 });
bookingSchema.index({ status: 1, createdAt: -1 });
bookingSchema.index({ status: 1, owner: 1, createdAt: -1 });
bookingSchema.index({ paymentStatus: 1, updatedAt: -1 });
bookingSchema.index({ paymentReference: 1 }, { sparse: true });
bookingSchema.index({ truck: 1, createdAt: -1 });
bookingSchema.index({ 'bids.owner': 1, createdAt: -1 });
bookingSchema.index({ 'documents.type': 1 });
bookingSchema.index({ loadMode: 1, routeKey: 1, status: 1, pickupDate: 1 });
bookingSchema.index({ consolidationEligible: 1, routeKey: 1, status: 1 });
bookingSchema.index({ 'lastKnownLocation.recordedAt': -1 });

bookingSchema.statics.STATUSES = STATUSES;
bookingSchema.statics.PAYMENT_STATUSES = PAYMENT_STATUSES;
bookingSchema.statics.STATUS_TRANSITIONS = STATUS_TRANSITIONS;
bookingSchema.statics.LOAD_MODES = LOAD_MODES;
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
