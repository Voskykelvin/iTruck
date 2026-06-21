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
const PAYMENT_STATUSES = [
  'unpaid',
  'pending',
  'escrowed',
  'release_pending',
  'released',
  'refund_pending',
  'failed',
  'refunded'
];
const LOAD_MODES = ['full-truck', 'ltl'];
const BID_STATUSES = ['pending', 'countered', 'accepted', 'rejected', 'withdrawn', 'expired'];
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

const bidHistorySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: [
        'submitted',
        'countered',
        'counter_accepted',
        'counter_rejected',
        'accepted',
        'rejected',
        'withdrawn',
        'expired'
      ]
    },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    amount: Number,
    message: String,
    reason: String,
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const bidSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  truck: { type: mongoose.Schema.Types.ObjectId, ref: 'Truck' },
  amount: { type: Number, min: 0.01 },
  originalAmount: { type: Number, min: 0.01 },
  message: String,
  status: { type: String, enum: BID_STATUSES, default: 'pending' },
  expiresAt: Date,
  counteroffer: {
    amount: { type: Number, min: 0.01 },
    message: String,
    status: { type: String, enum: ['pending', 'accepted', 'rejected', 'expired'] },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: Date,
    respondedAt: Date,
    responseReason: String
  },
  rejectionReason: String,
  rejectedAt: Date,
  withdrawnAt: Date,
  withdrawalReason: String,
  carrierAcknowledgedAt: Date,
  history: [bidHistorySchema],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

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
    routePlan: {
      provider: String,
      origin: {
        lat: Number,
        lng: Number,
        formattedAddress: String,
        placeId: String
      },
      destination: {
        lat: Number,
        lng: Number,
        formattedAddress: String,
        placeId: String
      },
      waypoints: [
        {
          lat: Number,
          lng: Number,
          formattedAddress: String,
          placeId: String
        }
      ],
      encodedPolyline: String,
      distanceMeters: Number,
      durationSeconds: Number,
      staticDurationSeconds: Number,
      optimizedIntermediateWaypointIndex: [Number],
      computedAt: Date,
      trafficAware: Boolean,
      deviationThresholdMeters: { type: Number, min: 100, max: 20000, default: 750 }
    },
    eta: {
      estimatedArrivalAt: Date,
      remainingDistanceMeters: Number,
      remainingDurationSeconds: Number,
      updatedAt: Date,
      trafficAware: Boolean
    },
    routeDeviation: {
      isDeviated: { type: Boolean, default: false },
      distanceMeters: Number,
      thresholdMeters: Number,
      detectedAt: Date,
      lastAlertedAt: Date,
      recoveredAt: Date
    },
    dispatchPlan: { type: mongoose.Schema.Types.ObjectId, ref: 'DispatchPlan' },
    dispatch: {
      loadSequence: Number,
      pickupSequence: Number,
      deliverySequence: Number,
      reservedTonnes: Number,
      assignedAt: Date,
      assignmentMethod: { type: String, enum: ['manual-bid', 'auto-match'] },
      matchScore: Number
    },
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
    deliveryProof: {
      proof: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryProof' },
      recordHash: { type: String, match: /^[a-f0-9]{64}$/ },
      verificationMethod: { type: String, enum: ['sms_otp'] },
      verifiedAt: Date,
      receiverName: String,
      receiverPhoneLast4: String,
      photoCount: { type: Number, min: 1, max: 5 },
      chainHeadHash: { type: String, match: /^[a-f0-9]{64}$/ }
    },
    disputeStatusBefore: String,
    disputedAt: Date,
    disputeCase: { type: mongoose.Schema.Types.ObjectId, ref: 'IssueReport' },
    disputeResolvedAt: Date,
    disputeResolution: String,
    estimate: mongoose.Schema.Types.Mixed,
    quoteAcknowledged: { type: Boolean, default: false },
    status: {
      type: String,
      enum: STATUSES,
      default: 'pending'
    },
    bids: [bidSchema],
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
        url: String,
        urls: [String],
        fileName: String,
        fileNames: [String],
        publicId: String,
        contentHash: { type: String, match: /^[a-f0-9]{64}$/ },
        proof: { type: mongoose.Schema.Types.ObjectId, ref: 'DeliveryProof' },
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
bookingSchema.index({ disputeCase: 1 }, { sparse: true });
bookingSchema.index({ paymentReference: 1 }, { sparse: true });
bookingSchema.index({ truck: 1, createdAt: -1 });
bookingSchema.index({ 'bids.owner': 1, createdAt: -1 });
bookingSchema.index({ 'documents.type': 1 });
bookingSchema.index({ loadMode: 1, routeKey: 1, status: 1, pickupDate: 1 });
bookingSchema.index({ consolidationEligible: 1, routeKey: 1, status: 1 });
bookingSchema.index({ 'lastKnownLocation.recordedAt': -1 });
bookingSchema.index({ 'eta.estimatedArrivalAt': 1, status: 1 });
bookingSchema.index({ 'routeDeviation.isDeviated': 1, status: 1 });
bookingSchema.index({ dispatchPlan: 1 }, { sparse: true });

bookingSchema.statics.STATUSES = STATUSES;
bookingSchema.statics.PAYMENT_STATUSES = PAYMENT_STATUSES;
bookingSchema.statics.STATUS_TRANSITIONS = STATUS_TRANSITIONS;
bookingSchema.statics.LOAD_MODES = LOAD_MODES;
bookingSchema.statics.BID_STATUSES = BID_STATUSES;
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
