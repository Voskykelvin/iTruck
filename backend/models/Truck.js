const mongoose = require('mongoose');

const truckSchema = new mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: {
    type: String,
    enum: ['Matatu', 'Pickup', 'Lorry', 'Large Truck', 'Trailer', 'Bus', 'Specialised'],
    required: true
  },
  make: String,
  model: String,
  plateNumber: { type: String, required: true, unique: true },
  capacityTonnes: Number,
  photos: [String],
  features: [String],
  routes: [String],
  country: String,
  pricePerKm: { type: Number, default: 1.5 },
  isVerified: { type: Boolean, default: false },
  isAvailable: { type: Boolean, default: true },
  location: { lat: Number, lng: Number, city: String },
  documents: [{ type: String, url: String, status: String }]
}, { timestamps: true });

truckSchema.index({ owner: 1, createdAt: -1 });
truckSchema.index({ type: 1, isVerified: 1, isAvailable: 1 });
truckSchema.index({ country: 1, type: 1 });
truckSchema.index({ routes: 1 });

module.exports = mongoose.model('Truck', truckSchema);
