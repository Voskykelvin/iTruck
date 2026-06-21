const mongoose = require('mongoose');

const workerLeaseSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    owner: { type: String, required: true, trim: true },
    leaseUntil: { type: Date, required: true }
  },
  { timestamps: true }
);

workerLeaseSchema.index({ leaseUntil: 1 });

module.exports = mongoose.model('WorkerLease', workerLeaseSchema);
