const express = require('express');
const User = require('../models/User');
const Truck = require('../models/Truck');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const Document = require('../models/Document');
const RefreshToken = require('../models/RefreshToken');
const NotificationDelivery = require('../models/NotificationDelivery');
const Notification = require('../models/Notification');
const IssueReport = require('../models/IssueReport');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { recordReviewedDocument } = require('../services/documentRecords');
const notifications = require('../services/notifications');
const {
  documentReviewSchema,
  notifySchema,
  notificationDeliveryListSchema,
  notificationDeliveryRetrySchema,
  truckVerificationSchema,
  userDeletionSchema,
  userStatusSchema,
  userVerificationSchema
} = require('../validators/admin');
const { demoUsers, demoTrucks } = require('../data/demo-users');
const {
  normalizeBookingDocumentType,
  normalizeProfileDocumentType,
  normalizeTruckDocumentType
} = require('../utils/documentTypes');

const router = express.Router();
router.use(protect, restrictTo('admin'));

const demoBookings = [
  ['ITK-1001', 'Pickup hub to delivery hub', 'In Transit', 'On schedule'],
  ['ITK-1002', 'Port lane to regional warehouse', 'Bidding', 'Offers pending'],
  ['ITK-1003', 'Distribution center to receiver', 'Delivered', 'POD ready']
];
const activeBookingStatuses = ['pending', 'bidding', 'confirmed', 'in_transit', 'delivery_pending', 'disputed'];

async function recordAudit(req, action, targetType, targetId, metadata = {}) {
  if (!mongoReady()) return null;
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

function labelFromType(type) {
  return String(type || 'Document')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function upsertDocument(documents = [], type, patch, normalizeType = (value) => value) {
  const documentType = normalizeType(type);
  const existing = documents.find((item) => normalizeType(item.type) === documentType);
  const evidence = patch.url || existing?.url || existing?.generatedAt || existing?.urls?.length;
  if (!existing && !patch.url) {
    const err = new Error('Document not found. Upload the document before review.');
    err.status = 404;
    throw err;
  }
  if (patch.status === 'approved' && !evidence) {
    const err = new Error('Document evidence is required before approval');
    err.status = 409;
    throw err;
  }

  if (existing) {
    existing.type = documentType;
    existing.status = patch.status;
    if (patch.url) existing.url = patch.url;
    if (patch.notes) existing.notes = patch.notes;
    existing.reviewedAt = new Date();
    return documents;
  }

  documents.push({
    type: documentType,
    status: patch.status,
    url: patch.url,
    notes: patch.notes,
    reviewedAt: new Date()
  });
  return documents;
}

router.get('/stats', async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.json({
        totalUsers: demoUsers.length,
        totalTrucks: demoTrucks.length,
        totalBookings: demoBookings.length,
        totalRevenue: 4820,
        mode: 'memory'
      });
    }

    const [totalUsers, totalTrucks, totalBookings, totalRevenue] = await Promise.all([
      User.countDocuments(),
      Truck.countDocuments(),
      Booking.countDocuments(),
      Transaction.aggregate([
        { $match: { status: 'completed', type: 'payment' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);
    res.json({ totalUsers, totalTrucks, totalBookings, totalRevenue: totalRevenue[0]?.total || 0 });
  } catch (err) {
    next(err);
  }
});

router.get('/users', async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady())
      return res.json({ users: demoUsers.map(({ password: _password, ...user }) => user), mode: 'memory' });
    res.json({ users: await User.find().limit(100) });
  } catch (err) {
    next(err);
  }
});

router.get('/trucks', async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ trucks: demoTrucks, mode: 'memory' });
    res.json({ trucks: await Truck.find().limit(100) });
  } catch (err) {
    next(err);
  }
});

router.get('/bookings', async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ bookings: demoBookings, mode: 'memory' });
    res.json({ bookings: await Booking.find().limit(100) });
  } catch (err) {
    next(err);
  }
});

router.get('/payments', async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.json({
        transactions: [
          { id: 'TX-991', method: 'Wallet escrow', amount: 920, status: 'held' },
          { id: 'TX-992', method: 'M-Pesa', amount: 1260, status: 'pending release' },
          { id: 'TX-993', method: 'Card escrow', amount: 780, status: 'paid' }
        ],
        mode: 'memory'
      });
    }
    res.json({ transactions: await Transaction.find().limit(100) });
  } catch (err) {
    next(err);
  }
});

router.get('/audit-logs', async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ logs: [], mode: 'memory' });

    const logs = await AuditLog.find().populate('admin', 'firstName lastName email role').sort('-createdAt').limit(100);

    res.json({ logs });
  } catch (err) {
    next(err);
  }
});

router.get('/notification-deliveries', notificationDeliveryListSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ deliveries: [], mode: 'memory' });

    const filter = req.query.status ? { status: req.query.status } : {};
    const deliveries = await NotificationDelivery.find(filter)
      .populate('user', 'firstName lastName email phone role')
      .populate('notification', 'type category title message priority')
      .sort('-createdAt')
      .limit(req.query.limit || 100);
    res.json({ deliveries });
  } catch (err) {
    next(err);
  }
});

router.post('/notification-deliveries/:id/retry', notificationDeliveryRetrySchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.status(404).json({ message: 'Delivery not found', mode: 'memory' });

    const delivery = await NotificationDelivery.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: 'retry',
          attempts: 0,
          nextAttemptAt: new Date()
        },
        $unset: {
          failedAt: 1,
          leaseUntil: 1,
          lastError: 1
        }
      },
      { new: true, runValidators: true }
    );
    if (!delivery) return res.status(404).json({ message: 'Delivery not found' });
    await recordAudit(req, 'notification.delivery.retried', 'notification', delivery.notification, {
      delivery: delivery._id,
      channel: delivery.channel
    });
    res.json({ delivery });
  } catch (err) {
    next(err);
  }
});

router.patch('/users/:id/status', userStatusSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const user = demoUsers.find((item) => item._id === req.params.id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      user.isActive = req.body.isActive;
      return res.json({ user, mode: 'memory' });
    }

    const user = await User.findByIdAndUpdate(req.params.id, { isActive: req.body.isActive }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found' });

    await recordAudit(req, 'user.status.updated', 'user', user._id, { isActive: user.isActive });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.delete('/users/:id', userDeletionSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    const reason = req.body.reason;
    const category = req.body.category || 'other';

    if (String(req.params.id) === String(req.user._id)) {
      return res.status(409).json({ message: 'Admins cannot delete their own profile' });
    }

    if (!mongoReady()) {
      const index = demoUsers.findIndex((item) => item._id === req.params.id);
      if (index < 0) return res.status(404).json({ message: 'User not found' });

      const target = demoUsers[index];
      const remainingAdmins = demoUsers.filter(
        (item) => item.role === 'admin' && item._id !== target._id && item.isActive !== false
      ).length;
      if (target.role === 'admin' && remainingAdmins === 0) {
        return res.status(409).json({ message: 'Keep at least one active admin profile' });
      }

      const removedTrucks = demoTrucks.filter((truck) => String(truck.owner) === String(target._id)).length;
      for (let truckIndex = demoTrucks.length - 1; truckIndex >= 0; truckIndex -= 1) {
        if (String(demoTrucks[truckIndex].owner) === String(target._id)) demoTrucks.splice(truckIndex, 1);
      }
      const [deleted] = demoUsers.splice(index, 1);
      const { password: _password, ...deletedUser } = deleted;
      return res.json({ deletedUser, removed: { users: 1, trucks: removedTrucks }, reason, category, mode: 'memory' });
    }

    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.role === 'admin') {
      const remainingAdmins = await User.countDocuments({
        _id: { $ne: user._id },
        role: 'admin',
        isActive: { $ne: false }
      });
      if (remainingAdmins === 0) return res.status(409).json({ message: 'Keep at least one active admin profile' });
    }

    const ownedTrucks = await Truck.find({ owner: user._id }).select('_id');
    const ownedTruckIds = ownedTrucks.map((truck) => truck._id);
    const dependencyClauses = [{ client: user._id }, { owner: user._id }, { 'bids.owner': user._id }];
    if (ownedTruckIds.length) dependencyClauses.push({ truck: { $in: ownedTruckIds } });

    const activeBookings = await Booking.countDocuments({
      status: { $in: activeBookingStatuses },
      $or: dependencyClauses
    });
    if (activeBookings > 0) {
      return res.status(409).json({
        message: `Resolve ${activeBookings} active booking${activeBookings === 1 ? '' : 's'} before deleting this profile`,
        activeBookings
      });
    }
    const activeCases = await IssueReport.countDocuments({
      status: {
        $in: ['submitted', 'reviewing', 'open', 'triaged', 'in_progress', 'waiting_on_user', 'waiting_on_carrier']
      },
      $or: [{ user: user._id }, { participants: user._id }, { assignedTo: user._id }]
    });
    if (activeCases > 0) {
      return res.status(409).json({
        message: `Resolve or reassign ${activeCases} active support case${activeCases === 1 ? '' : 's'} before deleting this profile`,
        activeCases
      });
    }

    const [documentResult, truckResult, tokenResult, notificationResult, deliveryResult] = await Promise.all([
      Document.deleteMany({
        $or: [
          { targetType: 'user', target: user._id },
          ...(ownedTruckIds.length ? [{ targetType: 'truck', target: { $in: ownedTruckIds } }] : [])
        ]
      }),
      Truck.deleteMany({ owner: user._id }),
      RefreshToken.deleteMany({ user: user._id }),
      Notification.deleteMany({ user: user._id }),
      NotificationDelivery.deleteMany({ user: user._id })
    ]);

    await User.deleteOne({ _id: user._id });
    await recordAudit(req, 'user.deleted', 'user', user._id, {
      reason,
      category,
      email: user.email,
      role: user.role,
      removedTrucks: truckResult.deletedCount || 0,
      removedDocuments: documentResult.deletedCount || 0,
      removedSessions: tokenResult.deletedCount || 0,
      removedNotifications: notificationResult.deletedCount || 0,
      removedDeliveries: deliveryResult.deletedCount || 0
    });

    res.json({
      deletedUser: user,
      removed: {
        users: 1,
        trucks: truckResult.deletedCount || 0,
        documents: documentResult.deletedCount || 0,
        sessions: tokenResult.deletedCount || 0,
        notifications: notificationResult.deletedCount || 0,
        notificationDeliveries: deliveryResult.deletedCount || 0
      }
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/users/:id/verification', userVerificationSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const user = demoUsers.find((item) => item._id === req.params.id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      user.isVerified = req.body.isVerified;
      return res.json({ user, mode: 'memory' });
    }

    const user = await User.findByIdAndUpdate(req.params.id, { isVerified: req.body.isVerified }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const io = req.app.get('io');
    await notifications.deliver(
      user._id,
      'profile.verified',
      {
        title: user.isVerified ? 'Profile verified' : 'Profile held for review',
        message: user.isVerified ? 'Your iTruck profile is approved.' : 'Your iTruck profile needs additional review.',
        link: '/app/profile',
        isVerified: user.isVerified
      },
      io
    );
    if (io?.emitToUser) {
      io.emitToUser(user._id, 'profile:verified', {
        title: user.isVerified ? 'Profile verified' : 'Profile held for review',
        isVerified: user.isVerified,
        silent: true
      });
    }

    await recordAudit(req, 'user.verification.updated', 'user', user._id, { isVerified: user.isVerified });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.patch('/trucks/:id/verification', truckVerificationSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const truck = demoTrucks.find((item) => item._id === req.params.id);
      if (!truck) return res.status(404).json({ message: 'Truck not found' });
      truck.isVerified = req.body.isVerified;
      return res.json({ truck, mode: 'memory' });
    }

    const truck = await Truck.findByIdAndUpdate(req.params.id, { isVerified: req.body.isVerified }, { new: true });
    if (!truck) return res.status(404).json({ message: 'Truck not found' });

    const io = req.app.get('io');
    await notifications.deliver(
      truck.owner,
      'truck.verified',
      {
        title: truck.isVerified ? 'Vehicle verified' : 'Vehicle held for review',
        message: truck.isVerified
          ? `${truck.plateNumber} is approved for iTruck jobs.`
          : `${truck.plateNumber} needs additional review.`,
        link: '/app/vehicles',
        truckId: truck._id,
        plateNumber: truck.plateNumber,
        isVerified: truck.isVerified
      },
      io
    );
    if (io?.emitToUser) {
      io.emitToUser(truck.owner, 'truck:verified', {
        title: truck.isVerified ? 'Vehicle verified' : 'Vehicle held for review',
        truckId: truck._id,
        plateNumber: truck.plateNumber,
        isVerified: truck.isVerified,
        silent: true
      });
    }

    await recordAudit(req, 'truck.verification.updated', 'truck', truck._id, { isVerified: truck.isVerified });
    res.json({ truck });
  } catch (err) {
    next(err);
  }
});

router.patch('/users/:id/documents/:documentType', documentReviewSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const user = demoUsers.find((item) => item._id === req.params.id);
      if (!user) return res.status(404).json({ message: 'User not found' });
      const documentType = normalizeProfileDocumentType(req.params.documentType, user.role);
      user.documents = upsertDocument(user.documents || [], documentType, req.body, (type) =>
        normalizeProfileDocumentType(type, user.role)
      );
      return res.json({ user, mode: 'memory' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    const documentType = normalizeProfileDocumentType(req.params.documentType, user.role);

    user.documents = upsertDocument(user.documents || [], documentType, req.body, (type) =>
      normalizeProfileDocumentType(type, user.role)
    );
    await user.save();
    await recordReviewedDocument({
      targetType: 'user',
      targetId: user._id,
      type: documentType,
      userId: user._id,
      reviewedBy: req.user._id,
      patch: { ...req.body, reviewedAt: new Date() },
      metadata: { role: user.role }
    });

    const io = req.app.get('io');
    const notification = await notifications.deliver(
      user._id,
      'document.updated',
      {
        title: `${labelFromType(documentType)} ${req.body.status}`,
        message: `Your ${labelFromType(documentType)} document was marked ${req.body.status}.`,
        link: '/app/profile',
        documentType,
        status: req.body.status,
        silent: true
      },
      io
    );
    if (io) {
      io.emitToUser(user._id, 'document:updated', {
        id: String(notification._id),
        title: `${labelFromType(documentType)} ${req.body.status}`,
        message: `Your ${labelFromType(documentType)} document was marked ${req.body.status}.`,
        link: '/app/profile',
        documentType,
        status: req.body.status
      });
    }

    await recordAudit(req, 'user.document.reviewed', 'document', user._id, {
      documentType,
      status: req.body.status
    });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.patch('/trucks/:id/documents/:documentType', documentReviewSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      const truck = demoTrucks.find((item) => item._id === req.params.id);
      if (!truck) return res.status(404).json({ message: 'Truck not found' });
      const documentType = normalizeTruckDocumentType(req.params.documentType);
      truck.documents = upsertDocument(truck.documents || [], documentType, req.body, normalizeTruckDocumentType);
      return res.json({ truck, mode: 'memory' });
    }

    const truck = await Truck.findById(req.params.id);
    if (!truck) return res.status(404).json({ message: 'Truck not found' });
    const documentType = normalizeTruckDocumentType(req.params.documentType);
    truck.documents = upsertDocument(truck.documents || [], documentType, req.body, normalizeTruckDocumentType);
    await truck.save();
    await recordReviewedDocument({
      targetType: 'truck',
      targetId: truck._id,
      type: documentType,
      userId: truck.owner,
      reviewedBy: req.user._id,
      truckId: truck._id,
      patch: { ...req.body, reviewedAt: new Date() }
    });

    const io = req.app.get('io');
    const notification = await notifications.deliver(
      truck.owner,
      'document.updated',
      {
        title: `${labelFromType(documentType)} ${req.body.status}`,
        message: `${truck.plateNumber} ${labelFromType(documentType)} was marked ${req.body.status}.`,
        link: '/app/vehicles',
        documentType,
        status: req.body.status,
        truckId: truck._id,
        silent: true
      },
      io
    );
    if (io) {
      io.emitToUser(truck.owner, 'document:updated', {
        id: String(notification._id),
        title: `${labelFromType(documentType)} ${req.body.status}`,
        message: `${truck.plateNumber} ${labelFromType(documentType)} was marked ${req.body.status}.`,
        link: '/app/vehicles',
        documentType,
        status: req.body.status
      });
    }

    await recordAudit(req, 'truck.document.reviewed', 'document', truck._id, {
      documentType,
      status: req.body.status
    });
    res.json({ truck });
  } catch (err) {
    next(err);
  }
});

router.patch('/bookings/:id/documents/:documentType', documentReviewSchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    const documentType = normalizeBookingDocumentType(req.params.documentType);

    if (!mongoReady()) {
      const booking = demoBookings.find((item) => (Array.isArray(item) ? item[0] : item._id) === req.params.id);
      if (!booking) return res.status(404).json({ message: 'Booking not found' });
      if (Array.isArray(booking)) return res.status(404).json({ message: 'Booking document not found' });
      booking.documents = upsertDocument(booking.documents || [], documentType, req.body, normalizeBookingDocumentType);
      return res.json({ booking, mode: 'memory' });
    }

    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    booking.documents = upsertDocument(booking.documents || [], documentType, req.body, normalizeBookingDocumentType);
    await booking.save();
    await recordReviewedDocument({
      targetType: 'booking',
      targetId: booking._id,
      type: documentType,
      userId: booking.client || req.user._id,
      reviewedBy: req.user._id,
      bookingId: booking._id,
      patch: { ...req.body, reviewedAt: new Date() },
      metadata: {
        client: booking.client,
        owner: booking.owner,
        truck: booking.truck
      }
    });

    const io = req.app.get('io');
    await notifications.notifyBookingParties(
      booking,
      'document.updated',
      {
        title: `${labelFromType(documentType)} ${req.body.status}`,
        message: `${labelFromType(documentType)} for booking ${booking._id} was marked ${req.body.status}.`,
        link: '/app/documents',
        documentType,
        status: req.body.status,
        bookingId: booking._id
      },
      io
    );
    if (io?.emitToBooking) {
      io.emitToBooking(booking._id, 'document:updated', {
        documentType,
        status: req.body.status,
        silent: true
      });
    }

    await recordAudit(req, 'booking.document.reviewed', 'document', booking._id, {
      documentType,
      status: req.body.status
    });
    res.json({ booking });
  } catch (err) {
    next(err);
  }
});

router.post('/notify', notifySchema, validate, async (req, res, next) => {
  try {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) {
      return res.json({
        message: 'Broadcast accepted in demo mode',
        summary: { targeted: 1, created: 1 },
        mode: 'memory'
      });
    }

    const filter = { isActive: { $ne: false } };
    if (req.body.userIds?.length) filter._id = { $in: req.body.userIds };
    else if (req.body.roles?.length) filter.role = { $in: req.body.roles };
    else filter._id = req.user._id;
    if (req.body.country) filter.country = req.body.country;

    const users = await User.find(filter)
      .select('firstName lastName email phone countryCode role isActive notificationPreferences')
      .limit(1000);
    const summary = await notifications.broadcast({
      users,
      data: {
        title: req.body.title,
        message: req.body.message,
        priority: req.body.priority || 'normal',
        category: req.body.category || 'system',
        link: req.body.link || '/app'
      },
      io: req.app.get('io')
    });
    await recordAudit(req, 'notification.broadcast.queued', 'notification', 'broadcast', {
      payload: req.body,
      summary
    });
    res.status(202).json({ message: 'Broadcast queued', summary });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
