const mongoose = require('mongoose');

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
    enum: ['pending', 'bidding', 'confirmed', 'in_transit', 'delivered', 'cancelled', 'disputed'],
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
  rating: { score: Number, comment: String }
}, { timestamps: true });

bookingSchema.index({ client: 1, createdAt: -1 });
bookingSchema.index({ owner: 1, createdAt: -1 });
bookingSchema.index({ status: 1, createdAt: -1 });
bookingSchema.index({ truck: 1, createdAt: -1 });
bookingSchema.index({ 'bids.owner': 1, createdAt: -1 });

module.exports = mongoose.model('Booking', bookingSchema);
