const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    actorRole: { type: String, enum: ['client', 'owner', 'driver', 'admin', 'system'], default: 'system' },
    action: { type: String, required: true, trim: true },
    targetType: {
      type: String,
      enum: ['user', 'driver', 'truck', 'booking', 'payment', 'notification', 'document', 'case', 'session', 'system'],
      required: true
    },
    targetId: { type: String, required: true },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    requestId: String,
    ip: String,
    userAgent: String
  },
  { timestamps: true }
);

auditLogSchema.index({ admin: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ actorRole: 1, action: 1, createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
