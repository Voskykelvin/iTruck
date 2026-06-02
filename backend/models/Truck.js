const mongoose = require('mongoose');

const TRUCK_TYPES = ['Matatu', 'Pickup', 'Lorry', 'Large Truck', 'Trailer', 'Bus', 'Specialised'];

const truckSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    type: {
      type: String,
      enum: TRUCK_TYPES,
      required: true
    },
    make: String,
    model: String,
    plateNumber: { type: String, required: true, trim: true, uppercase: true },
    registrationNumber: { type: String, trim: true, uppercase: true },
    chassisNumber: { type: String, trim: true, uppercase: true },
    capacityTonnes: { type: Number, min: 0.1, max: 100 },
    photos: [String],
    features: [String],
    routes: [String],
    country: String,
    pricePerKm: { type: Number, default: 1.5, min: 0 },
    ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
    ratingCount: { type: Number, default: 0, min: 0 },
    completedTrips: { type: Number, default: 0, min: 0 },
    isVerified: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: true },
    location: { lat: Number, lng: Number, city: String },
    documents: [
      {
        type: String,
        url: String,
        fileName: String,
        status: { type: String, enum: ['pending', 'approved', 'rejected', 'expired'], default: 'pending' },
        notes: String,
        reviewedAt: Date
      }
    ],
    archivedAt: Date,
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    archiveReason: { type: String, trim: true, maxlength: 240 }
  },
  { timestamps: true }
);

truckSchema.pre('validate', function defaultRegistrationNumber() {
  if (!this.registrationNumber && this.plateNumber) {
    this.registrationNumber = this.plateNumber;
  }
});

truckSchema.index({ plateNumber: 1 }, { unique: true });
truckSchema.index({ registrationNumber: 1 }, { unique: true, sparse: true });
truckSchema.index({ chassisNumber: 1 }, { unique: true, sparse: true });
truckSchema.index({ owner: 1, createdAt: -1 });
truckSchema.index({ owner: 1, archivedAt: 1, createdAt: -1 });
truckSchema.index({ owner: 1, isAvailable: 1, archivedAt: 1, createdAt: -1 });
truckSchema.index({ type: 1, isVerified: 1, isAvailable: 1, archivedAt: 1 });
truckSchema.index({ country: 1, type: 1 });
truckSchema.index({ routes: 1 });
truckSchema.index({ isAvailable: 1, routes: 1, archivedAt: 1 });
truckSchema.index({ ratingAverage: -1, ratingCount: -1 });

truckSchema.statics.TYPES = TRUCK_TYPES;

module.exports = mongoose.model('Truck', truckSchema);
