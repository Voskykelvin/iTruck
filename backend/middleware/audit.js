const { recordAudit } = require('../services/audit');

const ignoredPrefixes = ['/webhooks/', '/health'];

function targetTypeFor(path) {
  if (path.includes('/drivers')) return 'driver';
  if (path.includes('/bookings')) return 'booking';
  if (path.includes('/payments')) return 'payment';
  if (path.includes('/trucks')) return 'truck';
  if (path.includes('/documents')) return 'document';
  if (path.includes('/cases')) return 'case';
  if (path.includes('/sessions') || path.includes('/auth')) return 'session';
  if (path.includes('/notifications')) return 'notification';
  if (path.includes('/users')) return 'user';
  return 'system';
}

function targetIdFor(req) {
  return (
    req.params?.bookingId ||
    req.params?.driverId ||
    req.params?.truckId ||
    req.params?.sessionId ||
    req.params?.id ||
    req.user?._id ||
    'platform'
  );
}

function auditMutations(req, res, next) {
  if (
    ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ||
    ignoredPrefixes.some((prefix) => req.path.startsWith(prefix))
  ) {
    return next();
  }

  res.once('finish', () => {
    if (!req.user?._id || res.statusCode >= 400 || typeof recordAudit !== 'function') return;
    const path = req.baseUrl + req.path;
    recordAudit(
      req,
      `api.${req.method.toLowerCase()}.${path.replace(/\/+/g, '.').replace(/^\.|\.$/g, '')}`,
      targetTypeFor(path),
      targetIdFor(req),
      {
        method: req.method,
        path,
        statusCode: res.statusCode
      }
    ).catch((err) => req.log?.warn({ err, path }, 'Mutation audit recording failed'));
  });
  return next();
}

module.exports = { auditMutations, targetTypeFor };
