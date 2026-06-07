const AuditLog = require('../models/AuditLog');
const { mongoReady } = require('../config/runtime');

async function recordAdminAudit(req, action, targetType, targetId, metadata = {}) {
  if (!mongoReady()) return null;
  if (req.user?.role !== 'admin') return null;

  return AuditLog.create({
    admin: req.user._id,
    action,
    targetType,
    targetId: String(targetId),
    metadata,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
}

module.exports = { recordAdminAudit };
