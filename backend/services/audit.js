const AuditLog = require('../models/AuditLog');
const { mongoReady } = require('../config/runtime');

async function recordAudit(req, action, targetType, targetId, metadata = {}) {
  if (!mongoReady()) return null;
  if (!req.user?._id) return null;

  return AuditLog.create({
    admin: req.user.role === 'admin' ? req.user._id : undefined,
    actor: req.user._id,
    actorRole: req.user.role,
    action,
    targetType,
    targetId: String(targetId),
    metadata,
    requestId: req.id,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
}

async function recordAdminAudit(req, action, targetType, targetId, metadata = {}) {
  if (req.user?.role !== 'admin') return null;
  return recordAudit(req, action, targetType, targetId, metadata);
}

module.exports = { recordAdminAudit, recordAudit };
