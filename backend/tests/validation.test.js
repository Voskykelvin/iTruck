const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.REDIS_URL = '';

const { app, io, server } = require('../server');

afterAll((done) => {
  if (io?.close) io.close();
  if (server?.listening) return server.close(done);
  return done();
});

function authHeader(user = { id: 'demo-client-primary', role: 'client' }) {
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

test('forgot password returns a generic response', async () => {
  const res = await request(app).post('/api/auth/forgot-password').send({ email: 'unknown@example.com' });

  expect(res.status).toBe(200);
  expect(res.body.message).toContain('If that email exists');
});

test('google sign-in start reports unconfigured provider', async () => {
  const res = await request(app).get('/api/auth/google/start');

  expect(res.status).toBe(501);
  expect(res.body.message).toContain('not configured');
});

test('truck list rejects invalid query filters before querying data', async () => {
  const res = await request(app).get('/api/trucks?verified=maybe');

  expect(res.status).toBe(422);
  expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'verified' })]));
});

test('truck creation ignores owner-controlled privileged fields', async () => {
  const res = await request(app)
    .post('/api/trucks')
    .set('Authorization', authHeader({ id: 'demo-owner-transient', role: 'owner' }))
    .send({
      type: 'Lorry',
      plateNumber: `TEST-${Date.now()}`,
      isVerified: true,
      owner: 'someone-else',
      ratingAverage: 5,
      documents: [{ type: 'insurance', status: 'approved' }]
    });

  expect(res.status).toBe(201);
  expect(res.body.truck.owner).toBe('demo-owner-transient');
  expect(res.body.truck.isVerified).toBe(false);
  expect(res.body.truck.ratingAverage).toBeUndefined();
  expect(res.body.truck.documents).toBeUndefined();
});

test('truck creation validates capacity and identity fields', async () => {
  const res = await request(app)
    .post('/api/trucks')
    .set('Authorization', authHeader({ id: 'demo-owner-primary', role: 'owner' }))
    .send({
      type: 'Lorry',
      plateNumber: `CAP-${Date.now()}`,
      registrationNumber: `REG-${Date.now()}`,
      chassisNumber: `CHS-${Date.now()}`,
      capacityTonnes: 150
    });

  expect(res.status).toBe(422);
  expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'capacityTonnes' })]));
});

test('truck archive is a soft owner-scoped mutation', async () => {
  const created = await request(app)
    .post('/api/trucks')
    .set('Authorization', authHeader({ id: 'demo-owner-primary', role: 'owner' }))
    .send({
      type: 'Lorry',
      plateNumber: `ARCH-${Date.now()}`,
      capacityTonnes: 10
    });

  const truckId = created.body.truck._id;
  const archived = await request(app)
    .delete(`/api/trucks/${truckId}`)
    .set('Authorization', authHeader({ id: 'demo-owner-primary', role: 'owner' }))
    .send({ reason: 'Sold vehicle' });

  expect(archived.status).toBe(200);
  expect(archived.body.truck.archivedAt).toBeDefined();
  expect(archived.body.truck.isAvailable).toBe(false);

  const fetched = await request(app).get(`/api/trucks/${truckId}`);
  expect(fetched.status).toBe(404);
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

test('draft document route renders quote review documents as pdfs', async () => {
  const res = await request(app).post('/api/documents/draft/packing-list').set('Authorization', authHeader()).send({
    pickup: 'Nairobi',
    destination: 'Kampala',
    cargo: 'Retail stock',
    weight: '8 tonnes',
    receiverName: 'Receiving Warehouse'
  });

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('application/pdf');
});

test('receiver confirmation document route is available for synced bookings', async () => {
  const res = await request(app)
    .get('/api/documents/receiver-confirmation/ITK-2044')
    .set('Authorization', authHeader());

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('application/pdf');
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
    .set('Authorization', authHeader({ id: 'demo-client-primary', role: 'client' }))
    .send({ amount: 1200 });

  expect(res.status).toBe(403);
});

test('clients cannot list open owner load board bookings', async () => {
  const res = await request(app)
    .get('/api/bookings/open')
    .set('Authorization', authHeader({ id: 'demo-client-primary', role: 'client' }));

  expect(res.status).toBe(403);
});

test('non-admin users cannot mutate wallet balances directly', async () => {
  const res = await request(app)
    .post('/api/payments/wallet/credit')
    .set('Authorization', authHeader({ id: 'demo-owner-transient', role: 'owner' }))
    .send({ amount: 100 });

  expect(res.status).toBe(403);
});

test('wallet routes use memory fallback when the demo database is offline', async () => {
  const balance = await request(app)
    .get('/api/payments/wallet')
    .set('Authorization', authHeader({ id: 'demo-client-primary', role: 'client' }));

  expect(balance.status).toBe(200);
  expect(balance.body.balance).toBe(4200);
  expect(balance.body.mode).toBe('memory');

  const withdrawal = await request(app)
    .post('/api/payments/withdraw')
    .set('Authorization', authHeader({ id: 'demo-owner-primary', role: 'owner' }))
    .set('Idempotency-Key', 'test-withdraw-001')
    .send({ amount: 25, method: 'mpesa', destination: '+254711000000' });

  expect(withdrawal.status).toBe(201);
  expect(withdrawal.body.mode).toBe('memory');
  expect(withdrawal.body.transaction.status).toBe('pending');
});

test('non-admin users cannot release booking payments', async () => {
  const res = await request(app)
    .post('/api/payments/bookings/ITK-2044/release')
    .set('Authorization', authHeader({ id: 'demo-client-primary', role: 'client' }));

  expect(res.status).toBe(403);
});

test('clients cannot submit carrier bids through workflow routes', async () => {
  const res = await request(app)
    .post('/api/workflow/bids')
    .set('Authorization', authHeader({ id: 'demo-client-primary', role: 'client' }))
    .send({ bookingId: '507f1f77bcf86cd799439011', amount: 1200 });

  expect(res.status).toBe(403);
});

test('booking clients can accept a pending bid and confirm the booking', async () => {
  const res = await request(app)
    .patch('/api/bookings/ITK-2031/bids/demo-owner-secondary/accept')
    .set('Authorization', authHeader({ id: 'demo-client-secondary', role: 'client' }));

  expect(res.status).toBe(200);
  expect(res.body.booking.status).toBe('confirmed');
  expect(res.body.booking.owner).toBe('demo-owner-secondary');
  expect(res.body.booking.bids[0].status).toBe('accepted');
});

test('booking clients can confirm delivery after transit', async () => {
  const res = await request(app)
    .patch('/api/bookings/ITK-2044/confirm-delivery')
    .set('Authorization', authHeader({ id: 'demo-client-primary', role: 'client' }));

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

test('users can submit verification documents for admin review', async () => {
  const res = await request(app)
    .patch('/api/users/documents/owner-kyc')
    .set('Authorization', authHeader({ id: 'demo-owner-primary', role: 'owner' }))
    .send({ url: 'https://res.cloudinary.com/itruck/raw/upload/owner-kyc.pdf', fileName: 'owner-kyc.pdf' });

  expect(res.status).toBe(200);
  expect(res.body.user.documents).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'owner-kyc', status: 'pending' })])
  );
});

test('owners can attach truck documents for admin review', async () => {
  const created = await request(app)
    .post('/api/trucks')
    .set('Authorization', authHeader({ id: 'demo-owner-docs', role: 'owner' }))
    .send({
      type: 'Lorry',
      plateNumber: `DOC-${Date.now()}`,
      capacityTonnes: 8
    });

  const res = await request(app)
    .patch(`/api/trucks/${created.body.truck._id}/documents/insurance`)
    .set('Authorization', authHeader({ id: 'demo-owner-docs', role: 'owner' }))
    .send({ url: 'https://res.cloudinary.com/itruck/raw/upload/insurance.pdf', fileName: 'insurance.pdf' });

  expect(res.status).toBe(200);
  expect(res.body.truck.documents).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'insurance', status: 'pending' })])
  );
});

test('owners can attach vehicle photos to truck listings', async () => {
  const created = await request(app)
    .post('/api/trucks')
    .set('Authorization', authHeader({ id: 'demo-owner-photos', role: 'owner' }))
    .send({
      type: 'Lorry',
      plateNumber: `PIC-${Date.now()}`,
      capacityTonnes: 8
    });

  const res = await request(app)
    .patch(`/api/trucks/${created.body.truck._id}/photos`)
    .set('Authorization', authHeader({ id: 'demo-owner-photos', role: 'owner' }))
    .send({ url: 'https://res.cloudinary.com/itruck/image/upload/truck-photo.webp', fileName: 'truck-photo.webp' });

  expect(res.status).toBe(200);
  expect(res.body.truck.photos).toEqual(
    expect.arrayContaining(['https://res.cloudinary.com/itruck/image/upload/truck-photo.webp'])
  );
});

test('booking ratings are tied to delivered jobs for both parties', async () => {
  const client = { id: 'demo-client-ratings', role: 'client' };
  const owner = { id: 'demo-owner-ratings', role: 'owner' };

  const created = await request(app).post('/api/bookings').set('Authorization', authHeader(client)).send({
    pickup: 'Nairobi',
    destination: 'Kisumu',
    cargo: 'Produce',
    vehicleType: 'Lorry',
    paymentMethod: 'M-Pesa'
  });

  const bookingId = created.body.booking._id;
  await request(app)
    .post(`/api/bookings/${bookingId}/bids`)
    .set('Authorization', authHeader(owner))
    .send({ amount: 900, truck: 'demo-truck-isuzu' });

  await request(app)
    .patch(`/api/bookings/${bookingId}/bids/${owner.id}/accept`)
    .set('Authorization', authHeader(client));

  await request(app)
    .patch(`/api/bookings/${bookingId}/status`)
    .set('Authorization', authHeader(owner))
    .send({ status: 'in_transit' });

  await request(app).patch(`/api/bookings/${bookingId}/confirm-delivery`).set('Authorization', authHeader(client));

  const clientRating = await request(app)
    .post(`/api/bookings/${bookingId}/ratings`)
    .set('Authorization', authHeader(client))
    .send({ score: 5, target: 'owner', comment: 'Clean delivery' });

  expect(clientRating.status).toBe(200);
  expect(clientRating.body.booking.rating.clientToOwner.score).toBe(5);

  const ownerRating = await request(app)
    .post(`/api/bookings/${bookingId}/ratings`)
    .set('Authorization', authHeader(owner))
    .send({ score: 4, target: 'client', comment: 'Clear shipper details' });

  expect(ownerRating.status).toBe(200);
  expect(ownerRating.body.booking.rating.ownerToClient.score).toBe(4);
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
    .patch('/api/admin/users/demo-owner-primary/documents/insurance')
    .set('Authorization', authHeader({ id: 'demo-admin', role: 'admin' }))
    .send({ status: 'maybe' });

  expect(res.status).toBe(422);
});

test('admin can update user verification state', async () => {
  const held = await request(app)
    .patch('/api/admin/users/demo-owner-primary/verification')
    .set('Authorization', authHeader({ id: 'demo-admin', role: 'admin' }))
    .send({ isVerified: false });

  expect(held.status).toBe(200);
  expect(held.body.user.isVerified).toBe(false);

  const approved = await request(app)
    .patch('/api/admin/users/demo-owner-primary/verification')
    .set('Authorization', authHeader({ id: 'demo-admin', role: 'admin' }))
    .send({ isVerified: true });

  expect(approved.status).toBe(200);
  expect(approved.body.user.isVerified).toBe(true);
});
