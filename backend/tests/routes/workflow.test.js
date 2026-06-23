const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { app } = require('../../app');
const User = require('../../models/User');
const Booking = require('../../models/Booking');
const Truck = require('../../models/Truck');
const LoadRequest = require('../../models/LoadRequest');
const BookingMessage = require('../../models/BookingMessage');
const IssueReport = require('../../models/IssueReport');
const { userFactory, truckFactory, createTestToken } = require('../factories');

const JWT_SECRET = 'test-secret';

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) await collections[key].deleteMany({});
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function tokenFor(user) {
  return createTestToken(user, JWT_SECRET);
}

async function createUser(overrides = {}) {
  const user = await User.create(userFactory(overrides));
  return { user, token: tokenFor(user) };
}

async function createOwnerWithTruck(ownerOverrides = {}, truckOverrides = {}) {
  const { user: owner, token } = await createUser({
    role: 'owner',
    isVerified: true,
    documents: [
      { type: 'owner-kyc', url: 'https://example.com/kyc.pdf', status: 'approved' },
      { type: 'driver-id', url: 'https://example.com/id.pdf', status: 'approved' },
      { type: 'business-registration', url: 'https://example.com/br.pdf', status: 'approved' },
      { type: 'insurance', url: 'https://example.com/ins.pdf', status: 'approved' }
    ],
    ...ownerOverrides
  });
  const truck = await Truck.create({
    ...truckFactory({
      owner: owner._id,
      isVerified: true,
      documents: [
        { type: 'vehicle-photos', url: 'https://example.com/vp.jpg', status: 'approved' },
        { type: 'insurance', url: 'https://example.com/ti.pdf', status: 'approved' },
        { type: 'vehicle-logbook', url: 'https://example.com/lb.pdf', status: 'approved' },
        { type: 'road-license', url: 'https://example.com/rl.pdf', status: 'approved' },
        { type: 'inspection-report', url: 'https://example.com/ir.pdf', status: 'approved' }
      ],
      ...truckOverrides
    })
  });
  return { owner, token, truck };
}

async function createBookingInDB(clientId, overrides = {}) {
  return Booking.create({
    client: clientId,
    pickup: 'Nairobi',
    destination: 'Mombasa',
    cargo: 'Electronics',
    vehicleType: 'Lorry',
    distance: 500,
    budget: 1200,
    paymentMethod: 'M-Pesa',
    status: 'pending',
    ...overrides
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Workflow Integration Tests', () => {
  // ─────────────────────────────────────────────────────────
  // POST /api/workflow/requests
  // ─────────────────────────────────────────────────────────
  describe('POST /api/workflow/requests', () => {
    test('creates a standalone load request with pickup/destination/cargo', async () => {
      const { token } = await createUser({ role: 'client' });

      const res = await request(app)
        .post('/api/workflow/requests')
        .set('Authorization', `Bearer ${token}`)
        .send({ pickup: 'Nairobi', destination: 'Mombasa', cargo: 'Furniture' })
        .expect(201);

      expect(res.body.item.type).toBe('request');
      expect(res.body.item.payload.pickup).toBe('Nairobi');
    });

    test('creates a load request linked to a booking', async () => {
      const { user: client, token } = await createUser({ role: 'client' });
      const booking = await createBookingInDB(client._id);

      const res = await request(app)
        .post('/api/workflow/requests')
        .set('Authorization', `Bearer ${token}`)
        .send({ bookingId: String(booking._id), cargo: 'Linked request' })
        .expect(201);

      expect(res.body.item.type).toBe('request');
    });

    test('returns 403 when referencing another users booking', async () => {
      const { user: client1 } = await createUser({ role: 'client' });
      const { token: token2 } = await createUser({ role: 'client' });
      const booking = await createBookingInDB(client1._id);

      await request(app)
        .post('/api/workflow/requests')
        .set('Authorization', `Bearer ${token2}`)
        .send({ bookingId: String(booking._id) })
        .expect(403);
    });

    test('returns 422 when neither bookingId nor pickup/dest/cargo is provided', async () => {
      const { token } = await createUser({ role: 'client' });

      await request(app)
        .post('/api/workflow/requests')
        .set('Authorization', `Bearer ${token}`)
        .send({ vehicleType: 'Lorry' })
        .expect(422);
    });
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/workflow/bids
  // ─────────────────────────────────────────────────────────
  describe('POST /api/workflow/bids', () => {
    test('verified owner submits a workflow bid', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { token: ownerToken, truck } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, { status: 'bidding' });

      const res = await request(app)
        .post('/api/workflow/bids')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          bookingId: String(booking._id),
          amount: 1500,
          message: 'Available',
          truck: String(truck._id)
        })
        .expect(201);

      expect(res.body.item.type).toBe('bid');
      expect(res.body.item.status).toBe('pending');
      expect(res.body.booking).toBeDefined();
    });

    test('client cannot submit workflow bid (403)', async () => {
      const { user: client, token: clientToken } = await createUser({ role: 'client' });
      const booking = await createBookingInDB(client._id, { status: 'bidding' });

      await request(app)
        .post('/api/workflow/bids')
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ bookingId: String(booking._id), amount: 1500 })
        .expect(403);
    });

    test('returns 404 for non-existent booking', async () => {
      const { token: ownerToken, truck } = await createOwnerWithTruck();
      const fakeId = new mongoose.Types.ObjectId();

      await request(app)
        .post('/api/workflow/bids')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ bookingId: String(fakeId), amount: 1500, truck: String(truck._id) })
        .expect(404);
    });

    test('returns 409 when booking is not open for bids', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { token: ownerToken, truck, owner } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, {
        status: 'confirmed',
        owner: owner._id,
        truck: truck._id
      });

      await request(app)
        .post('/api/workflow/bids')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ bookingId: String(booking._id), amount: 1500, truck: String(truck._id) })
        .expect(409);
    });

    test('returns 400 when amount is missing or zero', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { token: ownerToken, truck } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, { status: 'bidding' });

      await request(app)
        .post('/api/workflow/bids')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ bookingId: String(booking._id), amount: 0, truck: String(truck._id) })
        .expect(422);
    });

    test('transitions pending booking to bidding', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { token: ownerToken, truck } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, { status: 'pending' });

      const _res = await request(app)
        .post('/api/workflow/bids')
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ bookingId: String(booking._id), amount: 1800, truck: String(truck._id) })
        .expect(201);

      const dbBooking = await Booking.findById(booking._id);
      expect(dbBooking.status).toBe('bidding');
    });
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/workflow/messages
  // ─────────────────────────────────────────────────────────
  describe('POST /api/workflow/messages', () => {
    test('creates a booking message', async () => {
      const { user: client, token } = await createUser({ role: 'client' });
      const booking = await createBookingInDB(client._id);

      const res = await request(app)
        .post('/api/workflow/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ bookingId: String(booking._id), text: 'What is the ETA?' })
        .expect(201);

      expect(res.body.item.type).toBe('message');
      expect(res.body.item.text).toBe('What is the ETA?');
    });

    test('creates a message without a booking reference', async () => {
      const { token } = await createUser({ role: 'client' });

      const res = await request(app)
        .post('/api/workflow/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'General inquiry' })
        .expect(201);

      expect(res.body.item.type).toBe('message');
    });

    test('returns 400 when message text is empty', async () => {
      const { token } = await createUser({ role: 'client' });

      await request(app)
        .post('/api/workflow/messages')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: '' })
        .expect(422);
    });

    test('returns 403 when referencing another users booking', async () => {
      const { user: client1 } = await createUser({ role: 'client' });
      const { token: token2 } = await createUser({ role: 'client' });
      const booking = await createBookingInDB(client1._id);

      await request(app)
        .post('/api/workflow/messages')
        .set('Authorization', `Bearer ${token2}`)
        .send({ bookingId: String(booking._id), text: 'Hello' })
        .expect(403);
    });
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/workflow/reports
  // ─────────────────────────────────────────────────────────
  describe('POST /api/workflow/reports', () => {
    test('creates an issue report', async () => {
      const { user: client, token } = await createUser({ role: 'client' });
      const booking = await createBookingInDB(client._id);

      const res = await request(app)
        .post('/api/workflow/reports')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bookingId: String(booking._id),
          text: 'Cargo arrived damaged',
          title: 'Damage report',
          category: 'damage',
          severity: 'high'
        })
        .expect(201);

      expect(res.body.item.type).toBe('report');
    });

    test('returns 422 when report text is empty', async () => {
      const { token } = await createUser({ role: 'client' });

      await request(app)
        .post('/api/workflow/reports')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: '' })
        .expect(422);
    });

    test('normalizes category aliases', async () => {
      const { user: client, token } = await createUser({ role: 'client' });
      const booking = await createBookingInDB(client._id);

      const _res = await request(app)
        .post('/api/workflow/reports')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bookingId: String(booking._id),
          text: 'Wrong cargo delivered',
          category: 'wrong_cargo'
        })
        .expect(201);

      // wrong_cargo → delivery (alias)
      const report = await IssueReport.findOne({ user: client._id });
      expect(report.category).toBe('delivery');
    });
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/workflow/messages
  // ─────────────────────────────────────────────────────────
  describe('GET /api/workflow/messages', () => {
    test('lists messages for a specific booking', async () => {
      const { user: client, token } = await createUser({ role: 'client' });
      const booking = await createBookingInDB(client._id);

      // Create a message linked to this booking
      await BookingMessage.create({
        user: client._id,
        booking: booking._id,
        text: 'Test message',
        status: 'sent'
      });

      const res = await request(app)
        .get(`/api/workflow/messages?bookingId=${booking._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items).toHaveLength(1);
      expect(res.body.items[0].text).toBe('Test message');
    });

    test('returns empty array when no bookingId is provided', async () => {
      const { token } = await createUser({ role: 'client' });

      const res = await request(app).get('/api/workflow/messages').set('Authorization', `Bearer ${token}`).expect(200);

      expect(res.body.items).toHaveLength(0);
    });

    test('returns 403 when accessing messages for another users booking', async () => {
      const { user: client1 } = await createUser({ role: 'client' });
      const { token: token2 } = await createUser({ role: 'client' });
      const booking = await createBookingInDB(client1._id);

      await request(app)
        .get(`/api/workflow/messages?bookingId=${booking._id}`)
        .set('Authorization', `Bearer ${token2}`)
        .expect(403);
    });
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/workflow (list all records)
  // ─────────────────────────────────────────────────────────
  describe('GET /api/workflow', () => {
    test('lists all workflow records for the user', async () => {
      const { user: client, token } = await createUser({ role: 'client' });
      const booking = await createBookingInDB(client._id);

      // Create one of each type
      await LoadRequest.create({
        user: client._id,
        booking: booking._id,
        pickup: 'Nairobi',
        destination: 'Mombasa',
        cargo: 'Goods',
        status: 'submitted',
        payload: {}
      });
      await BookingMessage.create({
        user: client._id,
        booking: booking._id,
        text: 'Hello',
        status: 'sent',
        payload: {}
      });

      const res = await request(app).get('/api/workflow').set('Authorization', `Bearer ${token}`).expect(200);

      expect(res.body.items.length).toBeGreaterThanOrEqual(2);
    });

    test('filters records by type', async () => {
      const { user: client, token } = await createUser({ role: 'client' });
      await LoadRequest.create({
        user: client._id,
        pickup: 'Nairobi',
        destination: 'Mombasa',
        cargo: 'Goods',
        status: 'submitted',
        payload: {}
      });
      await BookingMessage.create({
        user: client._id,
        text: 'Hello',
        status: 'sent',
        payload: {}
      });

      const res = await request(app)
        .get('/api/workflow?type=request')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].type).toBe('request');
    });

    test('admin can see all records', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { token: adminToken } = await createUser({ role: 'admin' });

      await LoadRequest.create({
        user: client._id,
        pickup: 'Nairobi',
        destination: 'Mombasa',
        cargo: 'Goods',
        status: 'submitted',
        payload: {}
      });

      const res = await request(app).get('/api/workflow').set('Authorization', `Bearer ${adminToken}`).expect(200);

      expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    });

    test('returns 401 when unauthenticated', async () => {
      await request(app).get('/api/workflow').expect(401);
    });
  });
});
