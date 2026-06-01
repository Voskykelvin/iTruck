const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.REDIS_URL = '';

const { app, io, server } = require('../server');

afterAll((done) => {
  if (io?.close) io.close();
  if (server?.listening) return server.close(done);
  return done();
});

function authHeader(user = { id: 'demo-client-amina', role: 'client' }) {
  const token = jwt.sign(user, process.env.JWT_SECRET || 'test-secret');
  return `Bearer ${token}`;
}

test('auth login returns structured validation errors', async () => {
  const res = await request(app).post('/api/auth/login').send({});

  expect(res.status).toBe(422);
  expect(res.body.status).toBe('fail');
  expect(res.body.message).toBe('Validation failed');
  expect(res.body.errors.map((error) => error.field)).toEqual(expect.arrayContaining(['email', 'password']));
});

test('truck list rejects invalid query filters before querying data', async () => {
  const res = await request(app).get('/api/trucks?verified=maybe');

  expect(res.status).toBe(422);
  expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'verified' })]));
});

test('truck creation ignores owner-controlled privileged fields', async () => {
  const res = await request(app)
    .post('/api/trucks')
    .set('Authorization', authHeader({ id: 'demo-owner-kelvin', role: 'owner' }))
    .send({
      type: 'Lorry',
      plateNumber: `TEST-${Date.now()}`,
      isVerified: true,
      owner: 'someone-else',
      ratingAverage: 5,
      documents: [{ type: 'insurance', status: 'approved' }]
    });

  expect(res.status).toBe(201);
  expect(res.body.truck.owner).toBe('demo-owner-kelvin');
  expect(res.body.truck.isVerified).toBe(false);
  expect(res.body.truck.ratingAverage).toBeUndefined();
  expect(res.body.truck.documents).toBeUndefined();
});

test('booking creation validates required flat payload fields', async () => {
  const res = await request(app).post('/api/bookings').set('Authorization', authHeader()).send({});

  expect(res.status).toBe(422);
  expect(res.body.errors.map((error) => error.field)).toEqual(
    expect.arrayContaining(['pickup', 'destination', 'cargo'])
  );
});

test('notification read route rejects invalid object ids', async () => {
  const res = await request(app).patch('/api/notifications/not-an-id/read').set('Authorization', authHeader());

  expect(res.status).toBe(422);
  expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'id' })]));
});

test('marketplace estimate validates required route fields', async () => {
  const res = await request(app).post('/api/marketplace/estimate').send({ vehicleType: 'Lorry' });

  expect(res.status).toBe(422);
  expect(res.body.errors.map((error) => error.field)).toEqual(expect.arrayContaining(['pickup', 'destination']));
});

test('unknown api routes return json 404 instead of the frontend app', async () => {
  const res = await request(app).get('/api/not-a-real-route');

  expect(res.status).toBe(404);
  expect(res.body.status).toBe('fail');
  expect(res.body.message).toContain('/api/not-a-real-route');
});

test('clients cannot submit carrier bids through booking routes', async () => {
  const res = await request(app)
    .post('/api/bookings/ITK-2031/bids')
    .set('Authorization', authHeader({ id: 'demo-client-amina', role: 'client' }))
    .send({ amount: 1200 });

  expect(res.status).toBe(403);
});

test('clients cannot list open owner load board bookings', async () => {
  const res = await request(app)
    .get('/api/bookings/open')
    .set('Authorization', authHeader({ id: 'demo-client-amina', role: 'client' }));

  expect(res.status).toBe(403);
});

test('non-admin users cannot mutate wallet balances directly', async () => {
  const res = await request(app)
    .post('/api/payments/wallet/credit')
    .set('Authorization', authHeader({ id: 'demo-owner-kelvin', role: 'owner' }))
    .send({ amount: 100 });

  expect(res.status).toBe(403);
});

test('non-admin users cannot release booking payments', async () => {
  const res = await request(app)
    .post('/api/payments/bookings/ITK-2044/release')
    .set('Authorization', authHeader({ id: 'demo-client-amina', role: 'client' }));

  expect(res.status).toBe(403);
});

test('clients cannot submit carrier bids through workflow routes', async () => {
  const res = await request(app)
    .post('/api/workflow/bids')
    .set('Authorization', authHeader({ id: 'demo-client-amina', role: 'client' }))
    .send({ bookingId: '507f1f77bcf86cd799439011', amount: 1200 });

  expect(res.status).toBe(403);
});

test('booking clients can accept a pending bid and confirm the booking', async () => {
  const res = await request(app)
    .patch('/api/bookings/ITK-2031/bids/demo-owner-grace/accept')
    .set('Authorization', authHeader({ id: 'demo-client-tunde', role: 'client' }));

  expect(res.status).toBe(200);
  expect(res.body.booking.status).toBe('confirmed');
  expect(res.body.booking.owner).toBe('demo-owner-grace');
  expect(res.body.booking.bids[0].status).toBe('accepted');
});

test('booking clients can confirm delivery after transit', async () => {
  const res = await request(app)
    .patch('/api/bookings/ITK-2044/confirm-delivery')
    .set('Authorization', authHeader({ id: 'demo-client-amina', role: 'client' }));

  expect(res.status).toBe(200);
  expect(res.body.booking.status).toBe('delivered');
});

test('notification read endpoint is scoped to the current user and handles memory mode', async () => {
  const res = await request(app)
    .patch('/api/notifications/507f1f77bcf86cd799439011/read')
    .set('Authorization', authHeader());

  expect(res.status).toBe(404);
});

test('password updates require both current and new passwords', async () => {
  const res = await request(app).patch('/api/users/password').set('Authorization', authHeader()).send({});

  expect(res.status).toBe(422);
  expect(res.body.errors.map((error) => error.field)).toEqual(
    expect.arrayContaining(['currentPassword', 'newPassword'])
  );
});

test('avatar uploads reject unsupported file types before storage', async () => {
  const res = await request(app)
    .post('/api/upload/avatar')
    .set('Authorization', authHeader())
    .attach('file', Buffer.from('not an image'), {
      filename: 'avatar.exe',
      contentType: 'application/x-msdownload'
    });

  expect(res.status).toBe(415);
});

test('admin document review validates supported statuses', async () => {
  const res = await request(app)
    .patch('/api/admin/users/demo-owner-james/documents/insurance')
    .set('Authorization', authHeader({ id: 'demo-admin', role: 'admin' }))
    .send({ status: 'maybe' });

  expect(res.status).toBe(422);
});
