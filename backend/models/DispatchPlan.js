const mongoose = require('mongoose');

const coordinateSchema = new mongoose.Schema(
  {
    lat: { type: Number, min: -90, max: 90 },
    lng: { type: Number, min: -180, max: 180 }
  },
  { _id: false }
);

const dispatchPlanSchema = new mongoose.Schema(
  {
    truck: { type: mongoose.Schema.Types.ObjectId, ref: 'Truck', required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    routeKey: { type: String, required: true, trim: true, lowercase: true },
    status: {
      type: String,
      enum: ['planned', 'active', 'completed', 'cancelled'],
      default: 'planned'
    },
    loadMode: { type: String, enum: ['full-truck', 'ltl'], required: true },
    capacityTonnes: { type: Number, required: true, min: 0.1 },
    reservedTonnes: { type: Number, required: true, min: 0, default: 0 },
    remainingTonnes: { type: Number, required: true, min: 0 },
    pickupDate: Date,
    assignments: [
      {
        booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true },
        cargoWeightTonnes: { type: Number, required: true, min: 0.01 },
        pickup: String,
        destination: String,
        pickupCoordinates: coordinateSchema,
        destinationCoordinates: coordinateSchema,
        status: {
          type: String,
          enum: ['reserved', 'picked_up', 'delivered', 'cancelled'],
          default: 'reserved'
        },
        pickupSequence: Number,
        deliverySequence: Number,
        reservedAt: { type: Date, default: Date.now }
      }
    ],
    stops: [
      {
        booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking' },
        type: { type: String, enum: ['pickup', 'delivery'], required: true },
        sequence: { type: Number, required: true, min: 1 },
        label: String,
        coordinates: coordinateSchema,
        status: {
          type: String,
          enum: ['pending', 'arrived', 'completed', 'skipped'],
          default: 'pending'
        }
      }
    ],
    routePlan: mongoose.Schema.Types.Mixed,
    plannedAt: { type: Date, default: Date.now },
    activatedAt: Date,
    completedAt: Date
  },
  { timestamps: true }
);

dispatchPlanSchema.index({ truck: 1, status: 1, pickupDate: 1 });
dispatchPlanSchema.index({ routeKey: 1, status: 1, remainingTonnes: -1 });
dispatchPlanSchema.index({ owner: 1, status: 1, updatedAt: -1 });
dispatchPlanSchema.index({ 'assignments.booking': 1 });

module.exports = mongoose.model('DispatchPlan', dispatchPlanSchema);
