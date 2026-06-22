const DriverAssignment = require('../models/DriverAssignment');
const DriverInvitation = require('../models/DriverInvitation');
const User = require('../models/User');
const {
  bookingQueryForUser,
  bookingVisibleTo,
  canCaptureDeliveryProof,
  canManageBookingStatus
} = require('../services/bookingAccess');
const {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  accessTokenFromRequest,
  assertCsrf,
  setAuthCookies
} = require('../services/authCookies');
const { bookingRoomQuery } = require('../socket');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { app } = require('../app');

test('driver role and operations records validate as first-class account data', () => {
  expect(
    new User({
      firstName: 'D',
      lastName: 'River',
      email: 'driver@example.com',
      phone: '0700000000',
      password: 'password123',
      country: 'Kenya',
      role: 'driver'
    }).validateSync()
  ).toBeUndefined();
  expect(
    new DriverInvitation({
      owner: '507f1f77bcf86cd799439011',
      invitedBy: '507f1f77bcf86cd799439012',
      email: 'driver@example.com',
      phone: '0700000000',
      country: 'Kenya',
      tokenHash: 'a'.repeat(64),
      expiresAt: new Date(Date.now() + 1000)
    }).validateSync()
  ).toBeUndefined();
  expect(
    new DriverAssignment({
      owner: '507f1f77bcf86cd799439011',
      driver: '507f1f77bcf86cd799439012',
      truck: '507f1f77bcf86cd799439013',
      assignedBy: '507f1f77bcf86cd799439011'
    }).validateSync()
  ).toBeUndefined();
  expect(DriverAssignment.schema.indexes()).toEqual(
    expect.arrayContaining([
      [{ driver: 1, status: 1 }, expect.objectContaining({ unique: true })],
      [{ truck: 1, status: 1 }, expect.objectContaining({ unique: true })]
    ])
  );
});

test('drivers can see and operate only their assigned booking', () => {
  const driver = { _id: 'driver-1', role: 'driver' };
  const assigned = { driver: 'driver-1', owner: 'owner-1', client: 'client-1' };
  const other = { driver: 'driver-2', owner: 'owner-1', client: 'client-1' };

  expect(bookingVisibleTo(driver, assigned)).toBe(true);
  expect(canManageBookingStatus(driver, assigned)).toBe(true);
  expect(canCaptureDeliveryProof(driver, assigned)).toBe(true);
  expect(bookingVisibleTo(driver, other)).toBe(false);
  expect(canManageBookingStatus(driver, other)).toBe(false);
  expect(bookingQueryForUser(driver)).toEqual({ driver: 'driver-1' });
  expect(bookingRoomQuery(driver, 'booking-1')).toEqual({ _id: 'booking-1', driver: 'driver-1' });
});

test('cookie authentication takes bearer precedence and enforces CSRF on mutations', () => {
  const bearerRequest = {
    method: 'PATCH',
    headers: { authorization: 'Bearer integration-token' },
    cookies: { [ACCESS_COOKIE]: 'cookie-token', [CSRF_COOKIE]: 'csrf-token' },
    get: () => ''
  };
  expect(accessTokenFromRequest(bearerRequest)).toEqual({ token: 'integration-token', source: 'bearer' });
  expect(() => assertCsrf(bearerRequest, 'bearer')).not.toThrow();

  const cookieRequest = {
    method: 'PATCH',
    headers: {},
    cookies: { [ACCESS_COOKIE]: 'cookie-token', [CSRF_COOKIE]: 'csrf-token' },
    get: (name) => (name === 'x-csrf-token' ? 'csrf-token' : '')
  };
  expect(accessTokenFromRequest(cookieRequest)).toEqual({ token: 'cookie-token', source: 'cookie' });
  expect(() => assertCsrf(cookieRequest, 'cookie')).not.toThrow();
  expect(() => assertCsrf({ ...cookieRequest, get: () => '' }, 'cookie')).toThrow('Invalid CSRF token');
});

test('auth cookies are HttpOnly for tokens and readable only for CSRF', () => {
  const writes = [];
  const res = { cookie: (...args) => writes.push(args) };
  setAuthCookies(res, { accessToken: 'access', refreshToken: 'refresh', csrfToken: 'csrf' });
  expect(writes).toEqual(
    expect.arrayContaining([
      [ACCESS_COOKIE, 'access', expect.objectContaining({ httpOnly: true })],
      [CSRF_COOKIE, 'csrf', expect.objectContaining({ httpOnly: false })]
    ])
  );
});

test('driver management routes reject driver accounts and accept fleet owners', async () => {
  const driverToken = jwt.sign({ id: 'demo-driver', role: 'driver' }, process.env.JWT_SECRET);
  const ownerToken = jwt.sign({ id: 'demo-owner-primary', role: 'owner' }, process.env.JWT_SECRET);

  await request(app).get('/api/drivers').set('Authorization', `Bearer ${driverToken}`).expect(403);
  const owner = await request(app).get('/api/drivers').set('Authorization', `Bearer ${ownerToken}`).expect(200);
  expect(owner.body).toEqual(expect.objectContaining({ drivers: [], invitations: [], assignments: [] }));
});

test('cookie-authenticated booking mutations require matching CSRF header', async () => {
  const access = jwt.sign({ id: 'demo-client-primary', role: 'client' }, process.env.JWT_SECRET);
  await request(app).post('/api/bookings').set('Cookie', `${ACCESS_COOKIE}=${access}`).send({}).expect(403);
  const validated = await request(app)
    .post('/api/bookings')
    .set('Cookie', [`${ACCESS_COOKIE}=${access}`, `${CSRF_COOKIE}=csrf-value`])
    .set('X-CSRF-Token', 'csrf-value')
    .send({});
  expect(validated.status).toBe(422);
});
