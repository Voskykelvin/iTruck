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

test('ltl booking creation stores shared-capacity fields and route key', async () => {
  const res = await request(app)
    .post('/api/bookings')
    .set('Authorization', authHeader())
    .send({
      pickup: 'Nairobi',
      destination: 'Kisumu',
      cargo: 'Retail cartons',
      vehicleType: 'Lorry',
      loadMode: 'ltl',
      cargoWeightTonnes: 2,
      destinationCoordinates: { lat: -0.0917, lng: 34.768 },
      deliveryGeofenceMeters: 150
    });

  expect(res.status).toBe(201);
  expect(res.body.booking.loadMode).toBe('ltl');
  expect(res.body.booking.reservedCapacityTonnes).toBe(12);
  expect(res.body.booking.consolidationEligible).toBe(true);
  expect(res.body.booking.routeKey).toBe('nairobi:kisumu:lorry');
  expect(res.body.booking.estimate.recommendedMode).toBe('route-cluster');
});

test('ltl bookings require cargo weight', async () => {
  const res = await request(app).post('/api/bookings').set('Authorization', authHeader()).send({
    pickup: 'Nairobi',
    destination: 'Kisumu',
    cargo: 'Retail cartons',
    loadMode: 'ltl'
  });

  expect(res.status).toBe(422);
  expect(res.body.errors).toEqual(
    expect.arrayContaining([expect.objectContaining({ message: 'cargoWeightTonnes is required for LTL bookings' })])
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

test('document index route is mounted and validates filters', async () => {
  const res = await request(app)
    .get('/api/documents?targetType=booking&status=pending&source=uploaded&limit=5')
    .set('Authorization', authHeader());

  expect(res.status).toBe(200);
  expect(res.body.documents).toEqual([]);

  const invalid = await request(app).get('/api/documents?status=maybe').set('Authorization', authHeader());
  expect(invalid.status).toBe(422);
});

test('receiver confirmation document route is available for synced bookings', async () => {
  const res = await request(app)
    .get('/api/documents/receiver-confirmation/ITK-2044')
    .set('Authorization', authHeader());

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('application/pdf');
});

test('cargo value declaration document route is available for synced bookings', async () => {
  const res = await request(app)
    .get('/api/documents/cargo-value-declaration/ITK-2044')
    .set('Authorization', authHeader());

  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('application/pdf');
});

test('marketplace estimate validates required route fields', async () => {
  const res = await request(app).post('/api/marketplace/estimate').send({ vehicleType: 'Lorry' });

  expect(res.status).toBe(422);
  expect(res.body.errors.map((error) => error.field)).toEqual(expect.arrayContaining(['pickup', 'destination']));
});

test('marketplace clusters require auth and support memory fallback', async () => {
  const unauthenticated = await request(app).get('/api/marketplace/clusters');
  expect(unauthenticated.status).toBe(401);

  const res = await request(app)
    .get('/api/marketplace/clusters?pickup=Nairobi&destination=Kisumu&vehicleType=Lorry')
    .set('Authorization', authHeader());

  expect(res.status).toBe(200);
  expect(res.body.clusters).toEqual([]);
  expect(res.body.mode).toBe('memory');
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
  expect(Array.isArray(balance.body.transactions)).toBe(true);
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

test('mobile money escrow initiation validates input and supports memory fallback', async () => {
  const invalid = await request(app)
    .post('/api/payments/bookings/ITK-2044/mobile-money')
    .set('Authorization', authHeader({ id: 'demo-client-primary', role: 'client' }))
    .send({ phone: '+254711000000' });

  expect(invalid.status).toBe(422);
  expect(invalid.body.errors).toEqual(
    expect.arrayContaining([expect.objectContaining({ message: 'method is required' })])
  );

  const queued = await request(app)
    .post('/api/payments/bookings/ITK-2044/mobile-money')
    .set('Authorization', authHeader({ id: 'demo-client-primary', role: 'client' }))
    .set('Idempotency-Key', 'test-mobile-001')
    .send({ amount: 25, method: 'mpesa', phone: '+254711000000' });

  expect(queued.status).toBe(202);
  expect(queued.body.mode).toBe('memory');
  expect(queued.body.transaction.status).toBe('pending');
});

test('mobile money callbacks fail closed in live mode', async () => {
  const originalValues = {
    APP_MODE: process.env.APP_MODE,
    LIVE_MODE: process.env.LIVE_MODE,
    MPESA_WEBHOOK_SECRET: process.env.MPESA_WEBHOOK_SECRET,
    MPESA_CALLBACK_SECRET: process.env.MPESA_CALLBACK_SECRET,
    MPESA_CALLBACK_TOKEN: process.env.MPESA_CALLBACK_TOKEN
  };

  process.env.APP_MODE = 'live';
  delete process.env.LIVE_MODE;
  delete process.env.MPESA_WEBHOOK_SECRET;
  delete process.env.MPESA_CALLBACK_SECRET;
  delete process.env.MPESA_CALLBACK_TOKEN;

  try {
    const unconfigured = await request(app).post('/api/payments/webhooks/mpesa/stk').send({});
    expect(unconfigured.status).toBe(503);
    expect(unconfigured.body.message).toContain('authentication is not configured');

    process.env.MPESA_WEBHOOK_SECRET = 'test-callback-secret';
    const invalid = await request(app).post('/api/payments/webhooks/mpesa/stk?token=wrong-secret').send({});
    expect(invalid.status).toBe(401);

    const authenticated = await request(app)
      .post('/api/payments/webhooks/mpesa/stk?token=test-callback-secret')
      .send({});
    expect(authenticated.status).toBe(503);
    expect(authenticated.body.message).toContain('Database connection offline');
  } finally {
    Object.entries(originalValues).forEach(([key, value]) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    });
  }
});

test('non-admin users cannot release booking payments', async () => {
  const res = await request(app)
    .post('/api/payments/bookings/ITK-2044/release')
    .set('Authorization', authHeader({ id: 'demo-client-primary', role: 'client' }));

  expect(res.status).toBe(403);
});

test('tracking updates are owner scoped and validate coordinate payloads', async () => {
  const clientAttempt = await request(app)
    .post('/api/bookings/ITK-2044/tracking')
    .set('Authorization', authHeader({ id: 'demo-client-primary', role: 'client' }))
    .send({ lat: -1.2921, lng: 36.8219 });

  expect(clientAttempt.status).toBe(403);

  const invalid = await request(app)
    .post('/api/bookings/ITK-2044/tracking')
    .set('Authorization', authHeader({ id: 'demo-owner-primary', role: 'owner' }))
    .send({ lat: -120, lng: 36.8219 });

  expect(invalid.status).toBe(422);
  expect(invalid.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'lat' })]));

  const single = await request(app)
    .post('/api/bookings/ITK-2044/tracking')
    .set('Authorization', authHeader({ id: 'demo-owner-primary', role: 'owner' }))
    .send({ lat: -1.2921, lng: 36.8219, speed: 64, heading: 270, accuracy: 12 });

  expect(single.status).toBe(200);
  expect(single.body.accepted).toBe(1);
  expect(single.body.booking.tracking.at(-1)).toEqual(
    expect.objectContaining({ lat: -1.2921, lng: 36.8219, speed: 64, heading: 270, accuracy: 12 })
  );

  const batch = await request(app)
    .post('/api/bookings/ITK-2044/tracking/batch')
    .set('Authorization', authHeader({ id: 'demo-owner-primary', role: 'owner' }))
    .send({
      updates: [
        { lat: -1.2923, lng: 36.8221, speed: 66, heading: 272, timestamp: '2026-06-20T10:02:00.000Z' },
        { lat: -1.2922, lng: 36.822, speed: 65, heading: 271, timestamp: '2026-06-20T10:01:00.000Z' }
      ]
    });

  expect(batch.status).toBe(200);
  expect(batch.body.accepted).toBe(2);
  expect(batch.body.booking.tracking.slice(-2).map((point) => point.lat)).toEqual([-1.2922, -1.2923]);
  expect(batch.body.booking.lastKnownLocation).toEqual(
    expect.objectContaining({
      lat: -1.2923,
      lng: 36.8221,
      recordedAt: '2026-06-20T10:02:00.000Z'
    })
  );
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

test('shipper document aliases are normalized to current profile slots', async () => {
  const baseAuth = authHeader({ id: 'demo-client-primary', role: 'client' });

  const kyc = await request(app)
    .patch('/api/users/documents/kyc')
    .set('Authorization', baseAuth)
    .send({ url: 'https://res.cloudinary.com/itruck/raw/upload/kyc.pdf', fileName: 'kyc.pdf' });
  const businessRegistration = await request(app)
    .patch('/api/users/documents/business_registration')
    .set('Authorization', baseAuth)
    .send({
      url: 'https://res.cloudinary.com/itruck/raw/upload/business-registration.pdf',
      fileName: 'business-registration.pdf'
    });
  const taxCertificate = await request(app)
    .patch('/api/users/documents/tax_certificate')
    .set('Authorization', baseAuth)
    .send({
      url: 'https://res.cloudinary.com/itruck/raw/upload/tax-certificate.pdf',
      fileName: 'tax-certificate.pdf'
    });

  expect(kyc.status).toBe(200);
  expect(businessRegistration.status).toBe(200);
  expect(taxCertificate.status).toBe(200);
  expect(kyc.body.user.documents).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'shipper-kyc', status: 'pending' })])
  );
  expect(businessRegistration.body.user.documents).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'business-registration', status: 'pending' })])
  );
  expect(taxCertificate.body.user.documents).toEqual(
    expect.arrayContaining([expect.objectContaining({ type: 'tax-certificate', status: 'pending' })])
  );
});

test('verification document uploads accept local upload fallback URLs', async () => {
  const res = await request(app)
    .patch('/api/users/documents/tax-certificate')
    .set('Authorization', authHeader({ id: 'demo-client-primary', role: 'client' }))
    .send({ url: '/api/uploads/local/local-tax-certificate', fileName: 'tax-certificate.pdf' });

  expect(res.status).toBe(200);
  expect(res.body.user.documents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'tax-certificate',
        url: '/api/uploads/local/local-tax-certificate',
        status: 'pending'
      })
    ])
  );
});

test('verification document uploads require document slugs', async () => {
  const res = await request(app)
    .patch('/api/users/documents/Owner KYC')
    .set('Authorization', authHeader({ id: 'demo-owner-primary', role: 'owner' }))
    .send({ url: 'https://res.cloudinary.com/itruck/raw/upload/owner-kyc.pdf', fileName: 'owner-kyc.pdf' });

  expect(res.status).toBe(422);
  expect(res.body.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'documentType' })]));
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

test('booking document uploads are persisted for shipment review', async () => {
  const res = await request(app)
    .patch('/api/bookings/ITK-2044/documents/cargo_photos')
    .set('Authorization', authHeader({ id: 'demo-client-primary', role: 'client' }))
    .send({
      url: '/api/uploads/local/cargo-photo-1',
      urls: ['/api/uploads/local/cargo-photo-1', '/api/uploads/local/cargo-photo-2'],
      fileName: 'cargo-photo-1.webp',
      fileNames: ['cargo-photo-1.webp', 'cargo-photo-2.webp']
    });

  expect(res.status).toBe(200);
  expect(res.body.booking.documents).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'cargo-photos',
        url: '/api/uploads/local/cargo-photo-1',
        urls: ['/api/uploads/local/cargo-photo-1', '/api/uploads/local/cargo-photo-2'],
        status: 'pending'
      })
    ])
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

test('admin profile deletion requires a reason and blocks self deletion', async () => {
  const missingReason = await request(app)
    .delete('/api/admin/users/demo-client-secondary')
    .set('Authorization', authHeader({ id: 'demo-admin', role: 'admin' }))
    .send({ category: 'duplicate' });

  expect(missingReason.status).toBe(422);

  const selfDelete = await request(app)
    .delete('/api/admin/users/demo-admin')
    .set('Authorization', authHeader({ id: 'demo-admin', role: 'admin' }))
    .send({ reason: 'Testing admin self deletion guard', category: 'suspicious' });

  expect(selfDelete.status).toBe(409);
  expect(selfDelete.body.message).toContain('cannot delete');

  const deleted = await request(app)
    .delete('/api/admin/users/demo-client-secondary')
    .set('Authorization', authHeader({ id: 'demo-admin', role: 'admin' }))
    .send({ reason: 'Duplicate shipper profile cleanup', category: 'duplicate' });

  expect(deleted.status).toBe(200);
  expect(deleted.body.deletedUser.email).toBe('shipper.two@example.com');

  const users = await request(app)
    .get('/api/admin/users')
    .set('Authorization', authHeader({ id: 'demo-admin', role: 'admin' }));

  expect(users.body.users.some((user) => user._id === 'demo-client-secondary')).toBe(false);
});
