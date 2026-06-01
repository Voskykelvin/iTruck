const mongoose = require('mongoose');
const Wallet = require('../models/Wallet');
const AuditLog = require('../models/AuditLog');
const LoadRequest = require('../models/LoadRequest');
const BookingMessage = require('../models/BookingMessage');
const IssueReport = require('../models/IssueReport');
const Booking = require('../models/Booking');
const RefreshToken = require('../models/RefreshToken');

function hasIndex(Model, keys, options = {}) {
  return Model.schema.indexes().some(([indexKeys, indexOptions]) => (
    JSON.stringify(indexKeys) === JSON.stringify(keys)
    && Object.entries(options).every(([key, value]) => indexOptions[key] === value)
  ));
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
});

test('refresh token indexes and fields support device-scoped sessions', () => {
  expect(RefreshToken.schema.path('deviceId')).toBeDefined();
  expect(RefreshToken.schema.path('lastUsedAt')).toBeDefined();
  expect(hasIndex(RefreshToken, { user: 1, deviceId: 1, revokedAt: 1 })).toBe(true);
  expect(typeof RefreshToken.findActive).toBe('function');
  expect(typeof RefreshToken.activeSessions).toBe('function');
  expect(typeof RefreshToken.revokeAll).toBe('function');
});

test('new models enforce their required fields without a database connection', () => {
  expect(new Wallet({ balance: 10 }).validateSync().errors.user).toBeDefined();
  expect(new AuditLog({ admin: oid(), action: 'x', targetType: 'user', targetId: String(oid()) }).validateSync()).toBeUndefined();
  expect(new LoadRequest({ user: oid(), status: 'open' }).validateSync()).toBeUndefined();
  expect(new BookingMessage({ user: oid(), text: 'Driver is at pickup' }).validateSync()).toBeUndefined();
  expect(new IssueReport({ user: oid(), severity: 'high', message: 'Delayed at border' }).validateSync()).toBeUndefined();
});

test('new models reject invalid enum values', () => {
  expect(new AuditLog({ admin: oid(), action: 'x', targetType: 'carrier', targetId: '1' }).validateSync().errors.targetType).toBeDefined();
  expect(new LoadRequest({ user: oid(), status: 'lost' }).validateSync().errors.status).toBeDefined();
  expect(new BookingMessage({ user: oid(), text: 'Hello', status: 'archived' }).validateSync().errors.status).toBeDefined();
  expect(new IssueReport({ user: oid(), severity: 'critical' }).validateSync().errors.severity).toBeDefined();
});
