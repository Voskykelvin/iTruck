const mongoose = require('mongoose');

const driverAssignmentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    truck: { type: mongoose.Schema.Types.ObjectId, ref: 'Truck', required: true },
    assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['active', 'ended'], default: 'active' },
    assignedAt: { type: Date, default: Date.now },
    endedAt: Date,
    endedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, trim: true, maxlength: 240 }
  },
  { timestamps: true }
);

driverAssignmentSchema.index({ owner: 1, status: 1, assignedAt: -1 });
driverAssignmentSchema.index({ driver: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });
driverAssignmentSchema.index({ truck: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });

module.exports = mongoose.model('DriverAssignment', driverAssignmentSchema);
