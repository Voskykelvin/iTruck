const crypto = require('crypto');
const express = require('express');
const Booking = require('../models/Booking');
const DriverAssignment = require('../models/DriverAssignment');
const DriverInvitation = require('../models/DriverInvitation');
const Truck = require('../models/Truck');
const User = require('../models/User');
const asyncHandler = require('../config/asyncHandler');
const { mongoReady, requireDatabase } = require('../config/runtime');
const { protect, restrictTo } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { recordAudit } = require('../services/audit');
const { sendMail } = require('../services/email');
const { createOne, runInTransaction, sessionOptions } = require('../services/transactions');
const AppError = require('../utils/AppError');
const {
  acceptDriverInvitationSchema,
  assignBookingDriverSchema,
  assignTruckSchema,
  driverIdSchema,
  invitationIdSchema,
  invitationToken,
  inviteDriverSchema
} = require('../validators/drivers');

const router = express.Router();
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function frontendBaseUrl(req) {
  return (process.env.FRONTEND_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

function ownerIdFor(req) {
  if (req.user.role === 'admin' && req.body.ownerId) return req.body.ownerId;
  return req.user._id;
}

async function activeInvitation(token) {
  const invitation = await DriverInvitation.findOne({
    tokenHash: hashToken(token),
    status: 'pending'
  })
    .select('+tokenHash')
    .populate('owner', 'firstName lastName company');
  if (!invitation) throw AppError.notFound('Driver invitation not found');
  if (invitation.expiresAt <= new Date()) {
    invitation.status = 'expired';
    await invitation.save();
    throw new AppError('Driver invitation has expired', 410);
  }
  return invitation;
}

router.get(
  '/invitations/:token',
  invitationToken,
  validate,
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) throw new AppError('Driver invitations require a connected database', 503);
    const invitation = await activeInvitation(req.params.token);
    res.json({
      invitation: {
        email: invitation.email,
        phone: invitation.phone,
        countryCode: invitation.countryCode,
        country: invitation.country,
        expiresAt: invitation.expiresAt,
        owner: invitation.owner
      }
    });
  })
);

router.post(
  '/invitations/:token/accept',
  acceptDriverInvitationSchema,
  validate,
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) throw new AppError('Driver invitations require a connected database', 503);
    const invitation = await activeInvitation(req.params.token);
    const existing = await User.findOne({ email: invitation.email });
    if (existing) throw new AppError('An account already exists for this driver email', 409);

    const driver = await runInTransaction(async (session) => {
      const user = await createOne(
        User,
        {
          firstName: req.body.firstName,
          lastName: req.body.lastName,
          email: invitation.email,
          phone: invitation.phone,
          countryCode: invitation.countryCode,
          country: invitation.country,
          password: req.body.password,
          role: 'driver',
          accountType: 'personal',
          isVerified: true,
          driverProfile: {
            owner: invitation.owner?._id || invitation.owner,
            invitation: invitation._id,
            licenseNumber: req.body.licenseNumber,
            joinedAt: new Date()
          }
        },
        session
      );

      await DriverInvitation.updateOne(
        { _id: invitation._id, status: 'pending' },
        {
          $set: {
            status: 'accepted',
            acceptedAt: new Date(),
            acceptedBy: user._id
          }
        },
        sessionOptions(session)
      );
      return user;
    });

    res.status(201).json({
      message: 'Driver account created. Sign in to view assigned jobs.',
      user: {
        _id: driver._id,
        firstName: driver.firstName,
        lastName: driver.lastName,
        email: driver.email,
        role: driver.role
      }
    });
  })
);

router.use(protect);

router.get(
  '/',
  restrictTo('owner', 'admin'),
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ drivers: [], invitations: [], assignments: [], mode: 'memory' });
    const owner = req.user.role === 'admin' && req.query.ownerId ? req.query.ownerId : req.user._id;
    const [drivers, invitations, assignments] = await Promise.all([
      User.find({ role: 'driver', 'driverProfile.owner': owner })
        .select('firstName lastName email phone country isActive driverProfile createdAt')
        .sort('firstName lastName'),
      DriverInvitation.find({ owner }).select('-tokenHash').sort('-createdAt').limit(100),
      DriverAssignment.find({ owner, status: 'active' })
        .populate('driver', 'firstName lastName email phone')
        .populate('truck', 'plateNumber type make model')
        .sort('-assignedAt')
    ]);
    res.json({ drivers, invitations, assignments });
  })
);

router.post(
  '/invitations',
  restrictTo('owner', 'admin'),
  inviteDriverSchema,
  validate,
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) throw new AppError('Driver invitations require a connected database', 503);
    const owner = ownerIdFor(req);
    const ownerRecord = await User.findOne({ _id: owner, role: 'owner', isActive: { $ne: false } });
    if (!ownerRecord) throw AppError.notFound('Fleet owner not found');
    if (await User.exists({ email: req.body.email })) {
      throw new AppError('An account already exists for this email', 409);
    }

    await DriverInvitation.updateMany(
      { owner, email: req.body.email, status: 'pending' },
      { $set: { status: 'revoked', revokedAt: new Date() } }
    );
    const token = crypto.randomBytes(32).toString('hex');
    const invitation = await DriverInvitation.create({
      owner,
      invitedBy: req.user._id,
      email: req.body.email,
      phone: req.body.phone,
      countryCode: req.body.countryCode,
      country: req.body.country,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
      lastSentAt: new Date()
    });
    const invitationUrl = `${frontendBaseUrl(req)}/app/profile?driverInvite=${encodeURIComponent(token)}`;

    await sendMail({
      to: invitation.email,
      subject: 'Join your fleet on iTruck',
      text: `${ownerRecord.firstName} invited you to operate assigned iTruck jobs. Create your driver account: ${invitationUrl}`,
      html: `<p>${ownerRecord.firstName} invited you to operate assigned iTruck jobs.</p><p><a href="${invitationUrl}">Create driver account</a></p>`
    }).catch((err) => req.log?.warn({ err, invitationId: invitation._id }, 'Driver invitation email failed'));

    await recordAudit(req, 'driver.invitation.created', 'driver', invitation._id, {
      owner,
      email: invitation.email,
      expiresAt: invitation.expiresAt
    });
    res.status(201).json({
      invitation: {
        _id: invitation._id,
        email: invitation.email,
        phone: invitation.phone,
        country: invitation.country,
        status: invitation.status,
        expiresAt: invitation.expiresAt
      },
      invitationUrl
    });
  })
);

router.delete(
  '/invitations/:invitationId',
  restrictTo('owner', 'admin'),
  invitationIdSchema,
  validate,
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ message: 'Invitation revoked', mode: 'memory' });
    const query = { _id: req.params.invitationId, status: 'pending' };
    if (req.user.role !== 'admin') query.owner = req.user._id;
    const invitation = await DriverInvitation.findOneAndUpdate(
      query,
      { $set: { status: 'revoked', revokedAt: new Date() } },
      { new: true }
    );
    if (!invitation) throw AppError.notFound('Pending invitation not found');
    await recordAudit(req, 'driver.invitation.revoked', 'driver', invitation._id, { owner: invitation.owner });
    res.json({ invitation });
  })
);

router.patch(
  '/bookings/:bookingId/driver',
  restrictTo('owner', 'admin'),
  assignBookingDriverSchema,
  validate,
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) throw new AppError('Driver assignment requires a connected database', 503);
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) throw AppError.notFound('Booking not found');
    if (req.user.role !== 'admin' && String(booking.owner) !== String(req.user._id)) {
      throw AppError.forbidden('Forbidden');
    }
    if (!booking.truck) throw new AppError('Assign a truck before assigning a driver', 409);

    const assignment = await DriverAssignment.findOne({
      owner: booking.owner,
      driver: req.body.driverId,
      truck: booking.truck,
      status: 'active'
    });
    if (!assignment) throw new AppError('Driver must be actively assigned to this booking truck', 409);

    booking.driver = req.body.driverId;
    await booking.save();
    await recordAudit(req, 'booking.driver.assigned', 'booking', booking._id, {
      driver: booking.driver,
      truck: booking.truck
    });
    res.json({ booking });
  })
);

router.patch(
  '/:driverId/truck',
  restrictTo('owner', 'admin'),
  assignTruckSchema,
  validate,
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) throw new AppError('Driver assignment requires a connected database', 503);
    const owner = req.user.role === 'admin' && req.body.ownerId ? req.body.ownerId : req.user._id;
    const [driver, truck] = await Promise.all([
      User.findOne({
        _id: req.params.driverId,
        role: 'driver',
        'driverProfile.owner': owner,
        isActive: { $ne: false }
      }),
      Truck.findOne({ _id: req.body.truckId, owner, archivedAt: null })
    ]);
    if (!driver) throw AppError.notFound('Driver not found');
    if (!truck) throw AppError.notFound('Truck not found');

    const assignment = await runInTransaction(async (session) => {
      const activeQuery = DriverAssignment.find({
        owner,
        status: 'active',
        $or: [{ driver: driver._id }, { truck: truck._id }]
      });
      const active = session ? await activeQuery.session(session) : await activeQuery;
      const previousTruckIds = active.map((item) => item.truck);
      if (active.length) {
        await DriverAssignment.updateMany(
          { _id: { $in: active.map((item) => item._id) } },
          { $set: { status: 'ended', endedAt: new Date(), endedBy: req.user._id, reason: 'Reassigned' } },
          sessionOptions(session)
        );
        await Truck.updateMany(
          { _id: { $in: previousTruckIds } },
          { $unset: { assignedDriver: 1 } },
          sessionOptions(session)
        );
      }
      const created = await createOne(
        DriverAssignment,
        {
          owner,
          driver: driver._id,
          truck: truck._id,
          assignedBy: req.user._id
        },
        session
      );
      await Truck.updateOne(
        { _id: truck._id, owner },
        { $set: { assignedDriver: driver._id } },
        sessionOptions(session)
      );
      return created;
    });

    await recordAudit(req, 'driver.truck.assigned', 'driver', driver._id, {
      truck: truck._id,
      assignment: assignment._id
    });
    res.json({
      assignment: await DriverAssignment.findById(assignment._id)
        .populate('driver', 'firstName lastName email phone')
        .populate('truck', 'plateNumber type make model')
    });
  })
);

router.delete(
  '/:driverId/truck',
  restrictTo('owner', 'admin'),
  driverIdSchema,
  validate,
  asyncHandler(async (req, res) => {
    if (requireDatabase(req, res)) return;
    if (!mongoReady()) return res.json({ message: 'Driver unassigned', mode: 'memory' });
    const query = { driver: req.params.driverId, status: 'active' };
    if (req.user.role !== 'admin') query.owner = req.user._id;
    const assignment = await DriverAssignment.findOne(query);
    if (!assignment) throw AppError.notFound('Active driver assignment not found');
    const activeJob = await Booking.exists({
      driver: assignment.driver,
      truck: assignment.truck,
      status: { $in: ['confirmed', 'in_transit', 'delivery_pending'] }
    });
    if (activeJob) throw new AppError('Reassign active jobs before removing this driver from the truck', 409);

    assignment.status = 'ended';
    assignment.endedAt = new Date();
    assignment.endedBy = req.user._id;
    assignment.reason = req.body.reason || 'Unassigned';
    await assignment.save();
    await Truck.updateOne(
      { _id: assignment.truck, assignedDriver: assignment.driver },
      { $unset: { assignedDriver: 1 } }
    );
    await recordAudit(req, 'driver.truck.unassigned', 'driver', assignment.driver, {
      truck: assignment.truck,
      assignment: assignment._id
    });
    res.json({ assignment });
  })
);

module.exports = router;
