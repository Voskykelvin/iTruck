const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const AuditLog = require('../models/AuditLog');
const LoadRequest = require('../models/LoadRequest');
const BookingMessage = require('../models/BookingMessage');
const IssueReport = require('../models/IssueReport');
const Booking = require('../models/Booking');
const RefreshToken = require('../models/RefreshToken');
const Truck = require('../models/Truck');
const User = require('../models/User');
const Idempotency = require('../models/Idempotency');
const Document = require('../models/Document');
const Notification = require('../models/Notification');
const NotificationDelivery = require('../models/NotificationDelivery');
const WorkerLease = require('../models/WorkerLease');
const DeliveryOtpChallenge = require('../models/DeliveryOtpChallenge');
const DeliveryProofAsset = require('../models/DeliveryProofAsset');
const DeliveryProof = require('../models/DeliveryProof');
const DeliveryCustodyEvent = require('../models/DeliveryCustodyEvent');
const DispatchPlan = require('../models/DispatchPlan');

function hasIndex(Model, keys, options = {}) {
  return Model.schema
    .indexes()
    .some(
      ([indexKeys, indexOptions]) =>
        JSON.stringify(indexKeys) === JSON.stringify(keys) &&
        Object.entries(options).every(([key, value]) =>
          typeof value === 'object' && value !== null
            ? JSON.stringify(indexOptions[key]) === JSON.stringify(value)
            : indexOptions[key] === value
        )
    );
}

function oid() {
  return new mongoose.Types.ObjectId();
}

test('wallet indexes support atomic lookup by user', () => {
  expect(hasIndex(Wallet, { user: 1 }, { unique: true })).toBe(true);
  expect(hasIndex(Wallet, { balance: 1 })).toBe(true);
});

test('audit log indexes support admin and append-only history queries', () => {
  expect(hasIndex(AuditLog, { admin: 1, createdAt: -1 })).toBe(true);
  expect(hasIndex(AuditLog, { targetType: 1, targetId: 1, createdAt: -1 })).toBe(true);
  expect(hasIndex(AuditLog, { createdAt: -1 })).toBe(true);
});

test('workflow model indexes match list and booking thread queries', () => {
  expect(hasIndex(LoadRequest, { user: 1, createdAt: -1 })).toBe(true);
  expect(hasIndex(LoadRequest, { user: 1, booking: 1, createdAt: -1 })).toBe(true);
  expect(hasIndex(BookingMessage, { booking: 1, createdAt: 1 })).toBe(true);
  expect(hasIndex(BookingMessage, { user: 1, booking: 1, createdAt: -1 })).toBe(true);
  expect(hasIndex(IssueReport, { user: 1, booking: 1, createdAt: -1 })).toBe(true);
  expect(hasIndex(IssueReport, { caseNumber: 1 }, { unique: true, sparse: true })).toBe(true);
  expect(hasIndex(IssueReport, { status: 1, priorityRank: -1, createdAt: -1 })).toBe(true);
  expect(hasIndex(IssueReport, { assignedTo: 1, status: 1, resolutionDueAt: 1 })).toBe(true);
  expect(hasIndex(IssueReport, { status: 1, firstResponseDueAt: 1, resolutionDueAt: 1 })).toBe(true);
});

test('booking indexes cover client owner status dashboards', () => {
  expect(hasIndex(Booking, { client: 1, createdAt: -1 })).toBe(true);
  expect(hasIndex(Booking, { client: 1, status: 1, createdAt: -1 })).toBe(true);
  expect(hasIndex(Booking, { owner: 1, status: 1, createdAt: -1 })).toBe(true);
  expect(hasIndex(Booking, { status: 1, owner: 1, createdAt: -1 })).toBe(true);
  expect(hasIndex(Booking, { paymentStatus: 1, updatedAt: -1 })).toBe(true);
  expect(hasIndex(Booking, { loadMode: 1, routeKey: 1, status: 1, pickupDate: 1 })).toBe(true);
  expect(hasIndex(Booking, { consolidationEligible: 1, routeKey: 1, status: 1 })).toBe(true);
  expect(hasIndex(Booking, { 'lastKnownLocation.recordedAt': -1 })).toBe(true);
  expect(Booking.schema.path('paymentStatus')).toBeDefined();
  expect(Booking.schema.path('loadMode')).toBeDefined();
  expect(Booking.schema.path('destinationCoordinates.lat')).toBeDefined();
  expect(Booking.schema.path('deliveryGeofenceMeters')).toBeDefined();
  expect(Booking.schema.path('lastKnownLocation.recordedAt')).toBeDefined();
  expect(Booking.schema.path('deliveryProof.recordHash')).toBeDefined();
  expect(Booking.schema.path('routePlan.encodedPolyline')).toBeDefined();
  expect(Booking.schema.path('eta.estimatedArrivalAt')).toBeDefined();
  expect(Booking.schema.path('routeDeviation.isDeviated')).toBeDefined();
  expect(Booking.schema.path('dispatchPlan')).toBeDefined();
  expect(Booking.schema.path('disputeCase')).toBeDefined();
  expect(Booking.schema.path('disputeStatusBefore')).toBeDefined();
  expect(
    new Booking({
      documents: [{ type: 'pod', status: 'approved', generatedAt: new Date() }]
    }).validateSync()
  ).toBeUndefined();
});

test('dispatch plan indexes support active capacity and booking lookups', () => {
  expect(hasIndex(DispatchPlan, { truck: 1, status: 1, pickupDate: 1 })).toBe(true);
  expect(hasIndex(DispatchPlan, { routeKey: 1, status: 1, remainingTonnes: -1 })).toBe(true);
  expect(hasIndex(DispatchPlan, { 'assignments.booking': 1 })).toBe(true);
});

test('delivery proof indexes support OTP lookup, immutable assets, and hash-chain reads', () => {
  expect(hasIndex(DeliveryOtpChallenge, { booking: 1 }, { unique: true })).toBe(true);
  expect(hasIndex(DeliveryOtpChallenge, { status: 1, expiresAt: 1 })).toBe(true);
  expect(hasIndex(DeliveryProofAsset, { booking: 1, createdAt: -1 })).toBe(true);
  expect(hasIndex(DeliveryProofAsset, { booking: 1, contentHash: 1 })).toBe(true);
  expect(hasIndex(DeliveryProof, { booking: 1 }, { unique: true })).toBe(true);
  expect(hasIndex(DeliveryProof, { 'verification.verifiedAt': -1 })).toBe(true);
  expect(hasIndex(DeliveryCustodyEvent, { booking: 1, sequence: 1 }, { unique: true })).toBe(true);
  expect(hasIndex(DeliveryCustodyEvent, { booking: 1, occurredAt: 1 })).toBe(true);
});

test('truck indexes and schema fields support verified fleet operations', () => {
  expect(hasIndex(Truck, { plateNumber: 1 }, { unique: true })).toBe(true);
  expect(hasIndex(Truck, { registrationNumber: 1 }, { unique: true, sparse: true })).toBe(true);
  expect(hasIndex(Truck, { chassisNumber: 1 }, { unique: true, sparse: true })).toBe(true);
  expect(hasIndex(Truck, { owner: 1, archivedAt: 1, createdAt: -1 })).toBe(true);
  expect(Truck.schema.path('archivedAt')).toBeDefined();
  expect(Truck.schema.path('archiveReason')).toBeDefined();
  expect(
    new Truck({ type: 'Lorry', plateNumber: 'TRK 100', capacityTonnes: 101 }).validateSync().errors.capacityTonnes
  ).toBeDefined();
});

test('refresh token indexes and fields support device-scoped sessions', () => {
  expect(RefreshToken.schema.path('deviceId')).toBeDefined();
  expect(RefreshToken.schema.path('lastUsedAt')).toBeDefined();
  expect(hasIndex(RefreshToken, { user: 1, deviceId: 1, revokedAt: 1 })).toBe(true);
  expect(typeof RefreshToken.findActive).toBe('function');
  expect(typeof RefreshToken.activeSessions).toBe('function');
  expect(typeof RefreshToken.revokeAll).toBe('function');
});

test('idempotency records expire and enforce one key per payment attempt', () => {
  expect(hasIndex(Idempotency, { key: 1 }, { unique: true })).toBe(true);
  expect(Idempotency.schema.path('expiresAt').options.index).toEqual({ expires: 0 });
  expect(Idempotency.schema.path('status').enumValues).toEqual(
    expect.arrayContaining(['processing', 'completed', 'failed'])
  );
});

test('document records index every upload and generated booking document', () => {
  expect(hasIndex(Document, { targetType: 1, target: 1, type: 1 }, { unique: true })).toBe(true);
  expect(hasIndex(Document, { user: 1, status: 1, updatedAt: -1 })).toBe(true);
  expect(hasIndex(Document, { booking: 1, type: 1 })).toBe(true);
  expect(hasIndex(Document, { truck: 1, type: 1 })).toBe(true);
  expect(hasIndex(Document, { source: 1, updatedAt: -1 })).toBe(true);
});

test('notification delivery indexes support dedupe, leasing, and retention', () => {
  expect(
    hasIndex(
      Notification,
      { user: 1, dedupeKey: 1 },
      { unique: true, partialFilterExpression: { dedupeKey: { $type: 'string' } } }
    )
  ).toBe(true);
  expect(hasIndex(NotificationDelivery, { notification: 1, channel: 1 }, { unique: true })).toBe(true);
  expect(hasIndex(NotificationDelivery, { status: 1, nextAttemptAt: 1, leaseUntil: 1 })).toBe(true);
  expect(hasIndex(NotificationDelivery, { expiresAt: 1 }, { expireAfterSeconds: 0 })).toBe(true);
  expect(hasIndex(WorkerLease, { key: 1 }, { unique: true })).toBe(true);
  expect(User.schema.path('notificationPreferences.channels.email')).toBeDefined();
  expect(User.schema.path('notificationPreferences.quietHours.timezone')).toBeDefined();
});

test('document records accept all normalized site document slugs', () => {
  const user = oid();
  const target = oid();
  const slugs = ['shipper-kyc', 'business-registration', 'tax-certificate', 'waybill', 'cargo-photos'];

  slugs.forEach((type) => {
    const record = new Document({
      user,
      target,
      targetType: 'booking',
      targetModel: 'Booking',
      type,
      title: type
    });

    expect(record.validateSync()).toBeUndefined();
  });
});

test('profile and truck embedded documents accept uploaded document records', () => {
  const uploadedDocument = {
    type: 'driver-id',
    url: 'https://res.cloudinary.com/itruck/image/upload/driver-id.pdf',
    fileName: 'driver-id.pdf',
    status: 'pending',
    notes: ''
  };

  expect(
    new User({
      firstName: 'Amina',
      lastName: 'Owner',
      email: 'amina.owner@example.com',
      phone: '+254711000000',
      password: 'password123',
      role: 'owner',
      country: 'Kenya',
      documents: [uploadedDocument]
    }).validateSync()
  ).toBeUndefined();

  expect(
    new Truck({
      owner: oid(),
      type: 'Lorry',
      plateNumber: 'KDA 100A',
      documents: [{ ...uploadedDocument, type: 'insurance' }]
    }).validateSync()
  ).toBeUndefined();
});

test('password reset fields are excluded from user queries by default', () => {
  expect(User.schema.path('passwordResetToken').options.select).toBe(false);
  expect(User.schema.path('passwordResetExpires').options.select).toBe(false);
});

test('new models enforce their required fields without a database connection', () => {
  expect(new Wallet({ balance: 10 }).validateSync().errors.user).toBeDefined();
  expect(
    new AuditLog({ admin: oid(), action: 'x', targetType: 'user', targetId: String(oid()) }).validateSync()
  ).toBeUndefined();
  expect(new LoadRequest({ user: oid(), status: 'open' }).validateSync()).toBeUndefined();
  expect(new BookingMessage({ user: oid(), text: 'Driver is at pickup' }).validateSync()).toBeUndefined();
  expect(
    new IssueReport({ user: oid(), severity: 'high', message: 'Delayed at border' }).validateSync()
  ).toBeUndefined();
  expect(
    new IssueReport({
      user: oid(),
      caseNumber: 'ITC-260621-ABC123',
      kind: 'dispute',
      category: 'damage',
      priority: 'urgent',
      comments: [{ author: oid(), body: 'Evidence reviewed', visibility: 'internal' }]
    }).validateSync()
  ).toBeUndefined();
  expect(
    new Document({
      user: oid(),
      target: oid(),
      targetType: 'user',
      targetModel: 'User',
      type: 'tax-certificate',
      title: 'Tax certificate'
    }).validateSync()
  ).toBeUndefined();
  expect(
    new DeliveryProofAsset({
      booking: oid(),
      uploadedBy: oid(),
      url: 'https://example.com/photo.webp',
      fileName: 'photo.webp',
      mimeType: 'image/webp',
      size: 1200,
      contentHash: 'a'.repeat(64),
      recordHash: 'b'.repeat(64),
      capturedAt: new Date(),
      location: { lat: -1.2, lng: 36.8 }
    }).validateSync()
  ).toBeUndefined();
  expect(
    new DeliveryCustodyEvent({
      booking: oid(),
      sequence: 1,
      eventType: 'proof.finalized',
      actor: oid(),
      actorRole: 'owner',
      occurredAt: new Date(),
      payloadHash: 'c'.repeat(64),
      eventHash: 'd'.repeat(64)
    }).validateSync()
  ).toBeUndefined();
});

test('new models reject invalid enum values', () => {
  expect(
    new AuditLog({ admin: oid(), action: 'x', targetType: 'carrier', targetId: '1' }).validateSync().errors.targetType
  ).toBeDefined();
  expect(new LoadRequest({ user: oid(), status: 'lost' }).validateSync().errors.status).toBeDefined();
  expect(
    new BookingMessage({ user: oid(), text: 'Hello', status: 'archived' }).validateSync().errors.status
  ).toBeDefined();
  expect(new IssueReport({ user: oid(), severity: 'emergency' }).validateSync().errors.severity).toBeDefined();
  expect(
    new Document({
      user: oid(),
      target: oid(),
      targetType: 'truck',
      targetModel: 'Truck',
      type: 'insurance',
      title: 'Insurance',
      status: 'lost'
    }).validateSync().errors.status
  ).toBeDefined();
});
