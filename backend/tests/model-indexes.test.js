const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const AuditLog = require('../models/AuditLog');
const LoadRequest = require('../models/LoadRequest');
const BookingMessage = require('../models/BookingMessage');
const IssueReport = require('../models/IssueReport');
const Booking = require('../models/Booking');
const RefreshToken = require('../models/RefreshToken');
const Truck = require('../models/Truck');
const Idempotency = require('../models/Idempotency');
const Document = require('../models/Document');

function hasIndex(Model, keys, options = {}) {
  return Model.schema
    .indexes()
    .some(
      ([indexKeys, indexOptions]) =>
        JSON.stringify(indexKeys) === JSON.stringify(keys) &&
        Object.entries(options).every(([key, value]) => indexOptions[key] === value)
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
});

test('booking indexes cover client owner status dashboards', () => {
  expect(hasIndex(Booking, { client: 1, createdAt: -1 })).toBe(true);
  expect(hasIndex(Booking, { client: 1, status: 1, createdAt: -1 })).toBe(true);
  expect(hasIndex(Booking, { owner: 1, status: 1, createdAt: -1 })).toBe(true);
  expect(hasIndex(Booking, { status: 1, owner: 1, createdAt: -1 })).toBe(true);
  expect(hasIndex(Booking, { paymentStatus: 1, updatedAt: -1 })).toBe(true);
  expect(Booking.schema.path('paymentStatus')).toBeDefined();
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
    new Document({
      user: oid(),
      target: oid(),
      targetType: 'user',
      targetModel: 'User',
      type: 'tax-certificate',
      title: 'Tax certificate'
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
  expect(new IssueReport({ user: oid(), severity: 'critical' }).validateSync().errors.severity).toBeDefined();
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
