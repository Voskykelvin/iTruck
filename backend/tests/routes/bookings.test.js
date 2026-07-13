const request = require('supertest');
const mongoose = require('mongoose');
const { app } = require('../../app');
const User = require('../../models/User');
const Booking = require('../../models/Booking');
const Truck = require('../../models/Truck');
const { userFactory, truckFactory, createTestToken } = require('../factories');
const { clearTestDb, connectTestDb, disconnectTestDb } = require('../testDb');

const JWT_SECRET = 'test-secret';

beforeAll(() => connectTestDb('routes_bookings'));

afterAll(disconnectTestDb);

beforeEach(clearTestDb);

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

function bookingPayload(overrides = {}) {
  return {
    pickup: 'Nairobi',
    destination: 'Kampala',
    cargo: 'General goods',
    vehicleType: 'Lorry',
    distance: 650,
    budget: 1500,
    paymentMethod: 'M-Pesa',
    ...overrides
  };
}

async function createBookingInDB(clientId, overrides = {}) {
  return Booking.create({
    client: clientId,
    pickup: 'Nairobi',
    destination: 'Kampala',
    cargo: 'General goods',
    vehicleType: 'Lorry',
    distance: 650,
    budget: 1500,
    paymentMethod: 'M-Pesa',
    status: 'pending',
    ...overrides
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Bookings Integration Tests', () => {
  // ─────────────────────────────────────────────────────────
  // GET /api/bookings
  // ─────────────────────────────────────────────────────────
  describe('GET /api/bookings', () => {
    test('client lists their own bookings', async () => {
      const { user: client, token } = await createUser({ role: 'client' });
      await createBookingInDB(client._id, { status: 'bidding' });
      await createBookingInDB(client._id, { status: 'pending' });

      const res = await request(app).get('/api/bookings').set('Authorization', `Bearer ${token}`).expect(200);

      expect(res.body.bookings).toHaveLength(2);
    });

    test('client does not see other users bookings', async () => {
      const { user: client1 } = await createUser({ role: 'client' });
      const { token: token2 } = await createUser({ role: 'client' });
      await createBookingInDB(client1._id);

      const res = await request(app).get('/api/bookings').set('Authorization', `Bearer ${token2}`).expect(200);

      expect(res.body.bookings).toHaveLength(0);
    });

    test('admin lists all bookings', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { token: adminToken } = await createUser({ role: 'admin' });
      await createBookingInDB(client._id);

      const res = await request(app).get('/api/bookings').set('Authorization', `Bearer ${adminToken}`).expect(200);

      expect(res.body.bookings).toHaveLength(1);
    });

    test('filters by status', async () => {
      const { user: client, token } = await createUser({ role: 'client' });
      await createBookingInDB(client._id, { status: 'bidding' });
      await createBookingInDB(client._id, { status: 'pending' });

      const res = await request(app)
        .get('/api/bookings?status=bidding')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.bookings).toHaveLength(1);
      expect(res.body.bookings[0].status).toBe('bidding');
    });

    test('returns 401 when unauthenticated', async () => {
      await request(app).get('/api/bookings').expect(401);
    });
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/bookings/open
  // ─────────────────────────────────────────────────────────
  describe('GET /api/bookings/open', () => {
    test('owner sees bookings open for bids', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { token: ownerToken } = await createUser({ role: 'owner' });
      await createBookingInDB(client._id, { status: 'bidding' });
      await createBookingInDB(client._id, { status: 'confirmed' });

      const res = await request(app).get('/api/bookings/open').set('Authorization', `Bearer ${ownerToken}`).expect(200);

      expect(res.body.bookings).toHaveLength(1);
      expect(res.body.bookings[0].status).toBe('bidding');
    });

    test('client is forbidden from /open endpoint', async () => {
      const { token } = await createUser({ role: 'client' });
      await request(app).get('/api/bookings/open').set('Authorization', `Bearer ${token}`).expect(403);
    });
  });

  // ─────────────────────────────────────────────────────────
  // GET /api/bookings/:id
  // ─────────────────────────────────────────────────────────
  describe('GET /api/bookings/:id', () => {
    test('client fetches their own booking by ID', async () => {
      const { user: client, token } = await createUser({ role: 'client' });
      const booking = await createBookingInDB(client._id);

      const res = await request(app)
        .get(`/api/bookings/${booking._id}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.booking._id).toBe(String(booking._id));
    });

    test('returns 404 for non-existent booking', async () => {
      const { token } = await createUser({ role: 'client' });
      const fakeId = new mongoose.Types.ObjectId();

      await request(app).get(`/api/bookings/${fakeId}`).set('Authorization', `Bearer ${token}`).expect(404);
    });

    test('returns 403 when accessing another users booking', async () => {
      const { user: client1 } = await createUser({ role: 'client' });
      const { token: token2 } = await createUser({ role: 'client' });
      const booking = await createBookingInDB(client1._id);

      await request(app).get(`/api/bookings/${booking._id}`).set('Authorization', `Bearer ${token2}`).expect(403);
    });
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/bookings (create)
  // ─────────────────────────────────────────────────────────
  describe('POST /api/bookings', () => {
    test('client creates a booking successfully', async () => {
      const { token } = await createUser({ role: 'client' });

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send(bookingPayload())
        .expect(201);

      expect(res.body.booking.pickup).toBe('Nairobi');
      expect(res.body.booking.destination).toBe('Kampala');
      expect(res.body.booking.status).toBe('bidding');
      expect(res.body.booking.estimate).toBeDefined();
    });

    test('client can save a verified available carrier preference', async () => {
      const { token } = await createUser({ role: 'client' });
      const { truck } = await createOwnerWithTruck();

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send(bookingPayload({ requestedTruck: truck._id }))
        .expect(201);

      expect(res.body.booking.requestedTruck).toBe(String(truck._id));
    });

    test('rejects an unavailable carrier preference', async () => {
      const { token } = await createUser({ role: 'client' });
      const { truck } = await createOwnerWithTruck({}, { isAvailable: false });

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send(bookingPayload({ requestedTruck: truck._id }))
        .expect(409);

      expect(res.body.message).toBe('Requested carrier is no longer available');
    });

    test('returns 422 when required fields are missing', async () => {
      const { token } = await createUser({ role: 'client' });

      await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({ pickup: 'Nairobi' }) // missing destination, cargo
        .expect(422);
    });

    test('creates LTL booking with weight and correct estimate', async () => {
      const { token } = await createUser({ role: 'client' });

      const res = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send(bookingPayload({ loadMode: 'ltl', cargoWeightTonnes: 3 }))
        .expect(201);

      expect(res.body.booking.loadMode).toBe('ltl');
      expect(res.body.booking.consolidationEligible).toBe(true);
    });

    test('rejects LTL booking without cargoWeightTonnes', async () => {
      const { token } = await createUser({ role: 'client' });

      await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send(bookingPayload({ loadMode: 'ltl' }))
        .expect(422);
    });
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/bookings/:id/bids (submit bid)
  // ─────────────────────────────────────────────────────────
  describe('POST /api/bookings/:id/bids', () => {
    test('verified owner submits a bid successfully', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { token: ownerToken, truck } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, { status: 'bidding' });

      const res = await request(app)
        .post(`/api/bookings/${booking._id}/bids`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 1800, message: 'Available for this route', truck: String(truck._id) })
        .expect(200);

      expect(res.body.booking.bids).toHaveLength(1);
      expect(res.body.booking.bids[0].amount).toBe(1800);
      expect(res.body.booking.bids[0].status).toBe('pending');
    });

    test('client cannot submit a bid (403)', async () => {
      const { user: client, token } = await createUser({ role: 'client' });
      const booking = await createBookingInDB(client._id, { status: 'bidding' });

      await request(app)
        .post(`/api/bookings/${booking._id}/bids`)
        .set('Authorization', `Bearer ${token}`)
        .send({ amount: 1800 })
        .expect(403);
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
        .post(`/api/bookings/${booking._id}/bids`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 1800, truck: String(truck._id) })
        .expect(409);
    });

    test('returns 404 for non-existent booking', async () => {
      const { token: ownerToken, truck } = await createOwnerWithTruck();
      const fakeId = new mongoose.Types.ObjectId();

      await request(app)
        .post(`/api/bookings/${fakeId}/bids`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 1800, truck: String(truck._id) })
        .expect(404);
    });

    test('transitions pending booking to bidding on first bid', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { token: ownerToken, truck } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, { status: 'pending' });

      const res = await request(app)
        .post(`/api/bookings/${booking._id}/bids`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 2000, truck: String(truck._id) })
        .expect(200);

      expect(res.body.booking.status).toBe('bidding');
    });
  });

  // ─────────────────────────────────────────────────────────
  // PATCH /api/bookings/:id/bids/:bidId/accept
  // ─────────────────────────────────────────────────────────
  describe('PATCH /api/bookings/:id/bids/:bidId/accept', () => {
    test('client accepts a bid and booking transitions to confirmed', async () => {
      const { user: client, token: clientToken } = await createUser({ role: 'client' });
      const { token: ownerToken, truck } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, { status: 'bidding' });

      // Submit bid first
      const bidRes = await request(app)
        .post(`/api/bookings/${booking._id}/bids`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 1700, truck: String(truck._id) })
        .expect(200);

      const bidId = bidRes.body.booking.bids[0]._id;

      // Accept bid
      const acceptRes = await request(app)
        .patch(`/api/bookings/${booking._id}/bids/${bidId}/accept`)
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);

      expect(acceptRes.body.booking.status).toBe('confirmed');
      expect(acceptRes.body.booking.bids[0].status).toBe('accepted');
    });

    test('non-owner client cannot accept bids on another client booking (403)', async () => {
      const { user: client1 } = await createUser({ role: 'client' });
      const { token: client2Token } = await createUser({ role: 'client' });
      const { token: ownerToken, truck } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client1._id, { status: 'bidding' });

      const bidRes = await request(app)
        .post(`/api/bookings/${booking._id}/bids`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 1700, truck: String(truck._id) })
        .expect(200);

      const bidId = bidRes.body.booking.bids[0]._id;

      await request(app)
        .patch(`/api/bookings/${booking._id}/bids/${bidId}/accept`)
        .set('Authorization', `Bearer ${client2Token}`)
        .expect(403);
    });
  });

  // ─────────────────────────────────────────────────────────
  // PATCH /api/bookings/:id/bids/:bidId/counter
  // ─────────────────────────────────────────────────────────
  describe('PATCH /api/bookings/:id/bids/:bidId/counter', () => {
    test('client counters a bid', async () => {
      const { user: client, token: clientToken } = await createUser({ role: 'client' });
      const { token: ownerToken, truck } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, { status: 'bidding' });

      const bidRes = await request(app)
        .post(`/api/bookings/${booking._id}/bids`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 2000, truck: String(truck._id) })
        .expect(200);

      const bidId = bidRes.body.booking.bids[0]._id;

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/bids/${bidId}/counter`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ amount: 1600, message: 'My counter offer' })
        .expect(200);

      expect(res.body.bid.status).toBe('countered');
      expect(res.body.bid.counteroffer.amount).toBe(1600);
    });
  });

  // ─────────────────────────────────────────────────────────
  // PATCH /api/bookings/:id/bids/:bidId/respond-counter
  // ─────────────────────────────────────────────────────────
  describe('PATCH /api/bookings/:id/bids/:bidId/respond-counter', () => {
    test('owner accepts a counteroffer and amount updates', async () => {
      const { user: client, token: clientToken } = await createUser({ role: 'client' });
      const { token: ownerToken, truck } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, { status: 'bidding' });

      const bidRes = await request(app)
        .post(`/api/bookings/${booking._id}/bids`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 2000, truck: String(truck._id) })
        .expect(200);

      const bidId = bidRes.body.booking.bids[0]._id;

      const counterRes = await request(app)
        .patch(`/api/bookings/${booking._id}/bids/${bidId}/counter`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ amount: 1600, message: 'Lower please' })
        .expect(200);

      // Verify the counter was applied
      expect(counterRes.body.bid.status).toBe('countered');
      expect(counterRes.body.bid.counteroffer.status).toBe('pending');

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/bids/${bidId}/respond-counter`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ decision: 'accept' });

      if (res.status !== 200) {
        console.error('respond-counter accept failed:', res.status, res.body);
      }
      expect(res.status).toBe(200);
      expect(res.body.bid.amount).toBe(1600);
      expect(res.body.bid.status).toBe('pending');
      expect(res.body.bid.counteroffer.status).toBe('accepted');
    });

    test('owner rejects a counteroffer', async () => {
      const { user: client, token: clientToken } = await createUser({ role: 'client' });
      const { token: ownerToken, truck } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, { status: 'bidding' });

      const bidRes = await request(app)
        .post(`/api/bookings/${booking._id}/bids`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 2000, truck: String(truck._id) })
        .expect(200);

      const bidId = bidRes.body.booking.bids[0]._id;

      await request(app)
        .patch(`/api/bookings/${booking._id}/bids/${bidId}/counter`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ amount: 1200, message: 'Lower' })
        .expect(200);

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/bids/${bidId}/respond-counter`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ decision: 'reject', reason: 'Too low' });

      if (res.status !== 200) {
        console.error('respond-counter reject failed:', res.status, res.body);
      }
      expect(res.status).toBe(200);
      expect(res.body.bid.status).toBe('rejected');
      expect(res.body.bid.counteroffer.status).toBe('rejected');
    });
  });

  // ─────────────────────────────────────────────────────────
  // PATCH /api/bookings/:id/bids/:bidId/reject
  // ─────────────────────────────────────────────────────────
  describe('PATCH /api/bookings/:id/bids/:bidId/reject', () => {
    test('client rejects a bid', async () => {
      const { user: client, token: clientToken } = await createUser({ role: 'client' });
      const { token: ownerToken, truck } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, { status: 'bidding' });

      const bidRes = await request(app)
        .post(`/api/bookings/${booking._id}/bids`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 5000, truck: String(truck._id) })
        .expect(200);

      const bidId = bidRes.body.booking.bids[0]._id;

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/bids/${bidId}/reject`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ reason: 'Price too high' })
        .expect(200);

      expect(res.body.bid.status).toBe('rejected');
      expect(res.body.bid.rejectionReason).toBe('Price too high');
    });
  });

  // ─────────────────────────────────────────────────────────
  // PATCH /api/bookings/:id/bids/:bidId/withdraw
  // ─────────────────────────────────────────────────────────
  describe('PATCH /api/bookings/:id/bids/:bidId/withdraw', () => {
    test('owner withdraws their bid', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { token: ownerToken, truck } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, { status: 'bidding' });

      const bidRes = await request(app)
        .post(`/api/bookings/${booking._id}/bids`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 1800, truck: String(truck._id) })
        .expect(200);

      const bidId = bidRes.body.booking.bids[0]._id;

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/bids/${bidId}/withdraw`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ reason: 'Schedule conflict' });

      if (res.status !== 200) {
        console.error('withdraw failed:', res.status, res.body);
      }
      expect(res.status).toBe(200);
      expect(res.body.bid.status).toBe('withdrawn');
      expect(res.body.bid.withdrawalReason).toBe('Schedule conflict');
    });
  });

  // ─────────────────────────────────────────────────────────
  // PATCH /api/bookings/:id/bids/:bidId/acknowledge
  // ─────────────────────────────────────────────────────────
  describe('PATCH /api/bookings/:id/bids/:bidId/acknowledge', () => {
    test('owner acknowledges a rejected bid', async () => {
      const { user: client, token: clientToken } = await createUser({ role: 'client' });
      const { token: ownerToken, truck } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, { status: 'bidding' });

      const bidRes = await request(app)
        .post(`/api/bookings/${booking._id}/bids`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 5000, truck: String(truck._id) })
        .expect(200);

      const bidId = bidRes.body.booking.bids[0]._id;

      // Reject first
      await request(app)
        .patch(`/api/bookings/${booking._id}/bids/${bidId}/reject`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ reason: 'Too expensive' })
        .expect(200);

      // Then acknowledge
      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/bids/${bidId}/acknowledge`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(200);

      expect(res.body.bid.carrierAcknowledgedAt).toBeDefined();
    });

    test('returns 409 when acknowledging a non-terminal bid', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { token: ownerToken, truck } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, { status: 'bidding' });

      const bidRes = await request(app)
        .post(`/api/bookings/${booking._id}/bids`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ amount: 1800, truck: String(truck._id) })
        .expect(200);

      const bidId = bidRes.body.booking.bids[0]._id;

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/bids/${bidId}/acknowledge`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(409);

      expect(res.body.message).toMatch(/final bid decision/i);
    });
  });

  // ─────────────────────────────────────────────────────────
  // PATCH /api/bookings/:id/status
  // ─────────────────────────────────────────────────────────
  describe('PATCH /api/bookings/:id/status', () => {
    test('owner transitions confirmed to in_transit', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { token: ownerToken, truck, owner } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, {
        status: 'confirmed',
        owner: owner._id,
        truck: truck._id
      });

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'in_transit' })
        .expect(200);

      expect(res.body.booking.status).toBe('in_transit');
    });

    test('returns 400 when neither status nor location is provided', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { token: ownerToken, truck, owner } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, {
        status: 'confirmed',
        owner: owner._id,
        truck: truck._id
      });

      await request(app)
        .patch(`/api/bookings/${booking._id}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({})
        .expect(400);
    });

    test('non-owner cannot update status (403)', async () => {
      const { user: client, token: clientToken } = await createUser({ role: 'client' });
      const { owner, truck } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, {
        status: 'confirmed',
        owner: owner._id,
        truck: truck._id
      });

      await request(app)
        .patch(`/api/bookings/${booking._id}/status`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ status: 'in_transit' })
        .expect(403);
    });

    test('non-admin owner cannot set status to delivered (403)', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { token: ownerToken, truck, owner } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, {
        status: 'in_transit',
        owner: owner._id,
        truck: truck._id
      });

      await request(app)
        .patch(`/api/bookings/${booking._id}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ status: 'delivered' })
        .expect(403);
    });

    test('records location when updating status with location', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { token: ownerToken, truck, owner } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, {
        status: 'confirmed',
        owner: owner._id,
        truck: truck._id
      });

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/status`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          status: 'in_transit',
          location: { lat: -1.3, lng: 36.8, speed: 60, heading: 180 }
        })
        .expect(200);

      expect(res.body.booking.status).toBe('in_transit');
      expect(res.body.booking.lastKnownLocation.lat).toBeCloseTo(-1.3, 1);
    });
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/bookings/:id/tracking (single + batch)
  // ─────────────────────────────────────────────────────────
  describe('POST /api/bookings/:id/tracking', () => {
    test('records a single tracking point', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { token: ownerToken, truck, owner } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, {
        status: 'in_transit',
        owner: owner._id,
        truck: truck._id
      });

      const res = await request(app)
        .post(`/api/bookings/${booking._id}/tracking`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ lat: -1.3, lng: 36.8 })
        .expect(200);

      expect(res.body.accepted).toBe(1);
    });

    test('rejects tracking on a pending booking (409)', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { token: ownerToken, truck, owner } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, {
        status: 'pending',
        owner: owner._id,
        truck: truck._id
      });

      await request(app)
        .post(`/api/bookings/${booking._id}/tracking`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ lat: -1.3, lng: 36.8 })
        .expect(409);
    });

    test('records batch tracking updates', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { token: ownerToken, truck, owner } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, {
        status: 'in_transit',
        owner: owner._id,
        truck: truck._id
      });

      const res = await request(app)
        .post(`/api/bookings/${booking._id}/tracking/batch`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          updates: [
            { lat: -1.3, lng: 36.8 },
            { lat: -1.2, lng: 36.7, speed: 80, heading: 270 }
          ]
        })
        .expect(200);

      expect(res.body.accepted).toBe(2);
    });
  });

  // ─────────────────────────────────────────────────────────
  // POST /api/bookings/:id/ratings
  // ─────────────────────────────────────────────────────────
  describe('POST /api/bookings/:id/ratings', () => {
    test('client rates delivered booking (owner direction)', async () => {
      const { user: client, token: clientToken } = await createUser({ role: 'client' });
      const { owner, truck } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, {
        status: 'delivered',
        owner: owner._id,
        truck: truck._id,
        deliveredAt: new Date()
      });

      const res = await request(app)
        .post(`/api/bookings/${booking._id}/ratings`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ score: 5, comment: 'Great service' })
        .expect(200);

      expect(res.body.booking.rating.clientToOwner.score).toBe(5);
    });

    test('owner rates delivered booking (client direction)', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { owner, token: ownerToken, truck } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, {
        status: 'delivered',
        owner: owner._id,
        truck: truck._id,
        deliveredAt: new Date()
      });

      const res = await request(app)
        .post(`/api/bookings/${booking._id}/ratings`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({ score: 4, comment: 'Good shipper' })
        .expect(200);

      expect(res.body.booking.rating.ownerToClient.score).toBe(4);
    });

    test('returns 409 when rating before delivery', async () => {
      const { user: client, token: clientToken } = await createUser({ role: 'client' });
      const booking = await createBookingInDB(client._id, { status: 'bidding' });

      await request(app)
        .post(`/api/bookings/${booking._id}/ratings`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ score: 5 })
        .expect(409);
    });

    test('non-party cannot rate (403)', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { owner, truck } = await createOwnerWithTruck();
      const { token: randomToken } = await createUser({ role: 'client' });
      const booking = await createBookingInDB(client._id, {
        status: 'delivered',
        owner: owner._id,
        truck: truck._id,
        deliveredAt: new Date()
      });

      await request(app)
        .post(`/api/bookings/${booking._id}/ratings`)
        .set('Authorization', `Bearer ${randomToken}`)
        .send({ score: 5 })
        .expect(403);
    });
  });

  // ─────────────────────────────────────────────────────────
  // PATCH /api/bookings/:id/documents/:documentType
  // ─────────────────────────────────────────────────────────
  describe('PATCH /api/bookings/:id/documents/:documentType', () => {
    test('uploads a booking document', async () => {
      const { user: client, token } = await createUser({ role: 'client' });
      const booking = await createBookingInDB(client._id);

      const res = await request(app)
        .patch(`/api/bookings/${booking._id}/documents/waybill`)
        .set('Authorization', `Bearer ${token}`)
        .send({ url: 'https://res.cloudinary.com/demo/image/upload/waybill.pdf', fileName: 'waybill.pdf' })
        .expect(200);

      expect(res.body.booking.documents).toHaveLength(1);
      expect(res.body.booking.documents[0].type).toBe('waybill');
    });

    test('returns 403 for non-party user', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { token: randomToken } = await createUser({ role: 'client' });
      const booking = await createBookingInDB(client._id);

      await request(app)
        .patch(`/api/bookings/${booking._id}/documents/waybill`)
        .set('Authorization', `Bearer ${randomToken}`)
        .send({ url: 'https://res.cloudinary.com/demo/image/upload/waybill.pdf' })
        .expect(403);
    });
  });

  // ─────────────────────────────────────────────────────────
  // PATCH /api/bookings/:id/confirm-delivery
  // ─────────────────────────────────────────────────────────
  describe('PATCH /api/bookings/:id/confirm-delivery', () => {
    test('returns 403 when non-client tries to confirm delivery', async () => {
      const { user: client } = await createUser({ role: 'client' });
      const { owner, token: ownerToken, truck } = await createOwnerWithTruck();
      const booking = await createBookingInDB(client._id, {
        status: 'delivery_pending',
        owner: owner._id,
        truck: truck._id
      });

      await request(app)
        .patch(`/api/bookings/${booking._id}/confirm-delivery`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .expect(403);
    });

    test('returns 404 for non-existent booking', async () => {
      const { token } = await createUser({ role: 'client' });
      const fakeId = new mongoose.Types.ObjectId();

      await request(app)
        .patch(`/api/bookings/${fakeId}/confirm-delivery`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });
});
