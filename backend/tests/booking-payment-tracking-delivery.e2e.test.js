jest.mock('../config/runtime', () => {
  const actual = jest.requireActual('../config/runtime');
  return {
    ...actual,
    demoModeEnabled: jest.fn(() => false),
    isLiveMode: jest.fn(() => false),
    mongoReady: jest.fn(() => true),
    requireDatabase: jest.fn(() => false)
  };
});

jest.mock('../services/notifications', () => ({
  deliver: jest.fn(async () => ({ _id: 'notification-test' })),
  notifyBookingParties: jest.fn(async () => ({ _id: 'notification-test' }))
}));

jest.mock('../services/documentRecords', () => ({
  recordGeneratedDocument: jest.fn(async () => null),
  recordReviewedDocument: jest.fn(async () => null),
  recordUploadedDocument: jest.fn(async () => null),
  syncEmbeddedDocumentRecords: jest.fn(async () => ({ created: 0, updated: 0 }))
}));

jest.mock('../services/audit', () => ({
  recordAdminAudit: jest.fn(async () => null)
}));

jest.mock('../services/deliveryProof', () => {
  const actual = jest.requireActual('../services/deliveryProof');
  return {
    ...actual,
    assertDeliveryProofIntegrity: jest.fn(async () => ({ chain: { valid: true } })),
    recordDeliveryConfirmation: jest.fn(async ({ booking }) => {
      booking.deliveryProof.chainHeadHash = 'b'.repeat(64);
      return { eventHash: booking.deliveryProof.chainHeadHash };
    })
  };
});

jest.mock('../services/matching', () => {
  const actual = jest.requireActual('../services/matching');
  const mongoose = require('mongoose');
  return {
    ...actual,
    releaseAssignment: jest.fn(async () => null),
    reserveAssignment: jest.fn(async (booking) => {
      booking.dispatchPlan = new mongoose.Types.ObjectId();
      booking.dispatch = {
        loadSequence: 1,
        pickupSequence: 1,
        deliverySequence: 2,
        reservedTonnes: 12,
        assignedAt: new Date(),
        assignmentMethod: 'manual-bid'
      };
      return { _id: booking.dispatchPlan };
    })
  };
});

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const request = require('supertest');
const { app } = require('../app');
const AuditLog = require('../models/AuditLog');
const Booking = require('../models/Booking');
const Transaction = require('../models/Transaction');
const Truck = require('../models/Truck');
const User = require('../models/User');
const Wallet = require('../models/Wallet');

function id() {
  return new mongoose.Types.ObjectId();
}

function sameId(left, right) {
  return String(left?._id || left || '') === String(right?._id || right || '');
}

function tokenFor(user) {
  return jwt.sign({ id: String(user._id), role: user.role }, process.env.JWT_SECRET);
}

function queryResult(value) {
  const query = {
    limit: jest.fn(() => Promise.resolve(Array.isArray(value) ? value : [value].filter(Boolean))),
    populate: jest.fn(() => query),
    select: jest.fn(() => Promise.resolve(value)),
    sort: jest.fn(() => Promise.resolve(value))
  };
  query.then = (resolve, reject) => Promise.resolve(value).then(resolve, reject);
  return query;
}

function setPath(target, path, value) {
  const parts = path.split('.');
  let current = target;
  for (const part of parts.slice(0, -1)) {
    current[part] = current[part] || {};
    current = current[part];
  }
  current[parts.at(-1)] = value;
}

function unsetPath(target, path) {
  const parts = path.split('.');
  let current = target;
  for (const part of parts.slice(0, -1)) {
    current = current?.[part];
    if (!current) return;
  }
  delete current[parts.at(-1)];
}

function applyUpdate(target, update = {}) {
  if (update.$set) {
    for (const [key, value] of Object.entries(update.$set)) setPath(target, key, value);
  }
  if (update.$unset) {
    for (const key of Object.keys(update.$unset)) unsetPath(target, key);
  }
  if (update.$inc) {
    for (const [key, value] of Object.entries(update.$inc)) {
      setPath(target, key, Number(target[key] || 0) + Number(value));
    }
  }
  if (update.$push) {
    for (const [key, value] of Object.entries(update.$push)) {
      const items = value?.$each || [value];
      target[key] = [...(target[key] || []), ...items];
      if (value?.$slice && value.$slice < 0) target[key] = target[key].slice(value.$slice);
    }
  }
  if (!Object.keys(update).some((key) => key.startsWith('$'))) {
    Object.assign(target, update);
  }
  return target;
}

function matchesPaymentStatus(booking, condition) {
  if (condition?.$in) return condition.$in.includes(booking.paymentStatus);
  if (condition?.$exists === false) return booking.paymentStatus === undefined;
  return booking.paymentStatus === condition;
}

function matchesBookingFilter(booking, filter = {}) {
  if (!booking) return false;
  if (filter._id && !sameId(booking._id, filter._id)) return false;
  if (filter.owner && !sameId(booking.owner, filter.owner)) return false;
  if (filter.paymentReference && booking.paymentReference !== filter.paymentReference) return false;
  if (filter.status?.$in && !filter.status.$in.includes(booking.status)) return false;
  if (filter.status && !filter.status.$in && booking.status !== filter.status) return false;
  if (filter.paymentStatus && !matchesPaymentStatus(booking, filter.paymentStatus)) return false;
  if (filter.$or && !filter.$or.some((condition) => matchesBookingFilter(booking, condition))) return false;
  return true;
}

function matchesTransactionFilter(transaction, filter = {}) {
  return Object.entries(filter).every(([key, value]) => {
    if (['booking', 'user', '_id'].includes(key)) return sameId(transaction[key], value);
    return transaction[key] === value;
  });
}

describe('booking to payment to tracking to delivery flow', () => {
  let users;
  let trucks;
  let bookings;
  let wallets;
  let transactions;
  let client;
  let owner;
  let admin;
  let truck;

  function attachBookingMethods(booking) {
    booking.transitionTo = function transitionTo(nextStatus) {
      Booking.assertStatusTransition(this.status, nextStatus);
      this.status = nextStatus;
      return this;
    };
    booking.save = jest.fn(async function save() {
      bookings.set(String(this._id), this);
      return this;
    });
    return booking;
  }

  function createTransaction(payload) {
    const transaction = {
      _id: id(),
      createdAt: new Date(),
      ...payload,
      save: jest.fn(async function save() {
        transactions.set(String(this._id), this);
        return this;
      })
    };
    transactions.set(String(transaction._id), transaction);
    return transaction;
  }

  beforeEach(() => {
    jest.restoreAllMocks();

    client = {
      _id: id(),
      firstName: 'Amina',
      lastName: 'Shipper',
      email: 'shipper@example.com',
      phone: '+254700100200',
      country: 'Kenya',
      role: 'client',
      walletBalance: 5000,
      isActive: true,
      isVerified: true,
      documents: []
    };
    owner = {
      _id: id(),
      firstName: 'Otieno',
      lastName: 'Carrier',
      email: 'carrier@example.com',
      phone: '+254700300400',
      country: 'Kenya',
      role: 'owner',
      walletBalance: 0,
      isActive: true,
      isVerified: true,
      documents: ['owner-kyc', 'driver-id', 'business-registration', 'insurance'].map((type) => ({
        type,
        status: 'approved',
        url: `https://example.com/${type}.pdf`
      }))
    };
    admin = {
      _id: id(),
      firstName: 'Admin',
      lastName: 'User',
      email: 'admin@example.com',
      phone: '+254700500600',
      country: 'Kenya',
      role: 'admin',
      isActive: true,
      isVerified: true,
      documents: []
    };
    truck = {
      _id: id(),
      owner: owner._id,
      type: 'Lorry',
      plateNumber: 'KDA 123T',
      isAvailable: true,
      isVerified: true,
      documents: ['vehicle-photos', 'insurance', 'vehicle-logbook', 'road-license', 'inspection-report'].map(
        (type) => ({
          type,
          status: 'approved',
          url: `https://example.com/${type}.pdf`
        })
      )
    };

    users = new Map([client, owner, admin].map((user) => [String(user._id), user]));
    trucks = new Map([[String(truck._id), truck]]);
    bookings = new Map();
    wallets = new Map([
      [
        String(client._id),
        {
          _id: id(),
          user: client._id,
          balance: 5000,
          currency: 'USD',
          version: 0
        }
      ]
    ]);
    transactions = new Map();

    jest.spyOn(User, 'findById').mockImplementation((userId) => ({
      select: jest.fn(async () => users.get(String(userId)) || null)
    }));
    jest.spyOn(User.collection, 'findOne').mockImplementation(async (filter) => {
      const user = users.get(String(filter?._id));
      return user ? { walletBalance: user.walletBalance || 0 } : null;
    });
    jest.spyOn(Truck, 'findOne').mockImplementation(async (filter) => {
      const candidate = trucks.get(String(filter?._id));
      if (!candidate || !sameId(candidate.owner, filter?.owner)) return null;
      return candidate;
    });
    jest.spyOn(Booking, 'create').mockImplementation(async (payload) => {
      const booking = attachBookingMethods({
        _id: id(),
        paymentStatus: 'unpaid',
        bids: [],
        tracking: [],
        documents: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        ...payload
      });
      bookings.set(String(booking._id), booking);
      return booking;
    });
    jest.spyOn(Booking, 'findById').mockImplementation(async (bookingId) => bookings.get(String(bookingId)) || null);
    jest.spyOn(Booking, 'findOneAndUpdate').mockImplementation(async (filter, update) => {
      const booking = [...bookings.values()].find((item) => matchesBookingFilter(item, filter));
      if (!booking) return null;
      applyUpdate(booking, update);
      return booking;
    });
    jest.spyOn(Booking, 'updateOne').mockImplementation(async (filter, update) => {
      const booking = [...bookings.values()].find((item) => matchesBookingFilter(item, filter));
      if (booking) applyUpdate(booking, update);
      return { matchedCount: booking ? 1 : 0, modifiedCount: booking ? 1 : 0 };
    });
    jest.spyOn(Booking, 'findByIdAndUpdate').mockImplementation(async (bookingId, update) => {
      const booking = bookings.get(String(bookingId));
      if (booking) applyUpdate(booking, update);
      return booking || null;
    });
    jest.spyOn(Wallet, 'findOneAndUpdate').mockImplementation(async (filter, update, options = {}) => {
      const userId = String(filter.user);
      let wallet = wallets.get(userId);
      if (!wallet && options.upsert) {
        wallet = {
          _id: id(),
          user: filter.user,
          balance: Number(update.$setOnInsert?.balance || 0),
          currency: update.$setOnInsert?.currency || 'USD',
          version: 0
        };
        wallets.set(userId, wallet);
      }
      if (!wallet) return null;
      if (filter.balance?.$gte && wallet.balance < Number(filter.balance.$gte)) return null;
      applyUpdate(wallet, update);
      return wallet;
    });
    jest.spyOn(Wallet, 'updateOne').mockImplementation(async (filter, update) => {
      const wallet = [...wallets.values()].find((item) => sameId(item._id, filter._id));
      if (wallet) applyUpdate(wallet, update);
      return { matchedCount: wallet ? 1 : 0, modifiedCount: wallet ? 1 : 0 };
    });
    jest.spyOn(Transaction, 'create').mockImplementation(async (payload) => createTransaction(payload));
    jest.spyOn(Transaction, 'findOne').mockImplementation((filter) => {
      const matches = [...transactions.values()].filter((transaction) => matchesTransactionFilter(transaction, filter));
      return queryResult(matches.at(-1) || null);
    });
    jest.spyOn(Transaction, 'find').mockImplementation((filter) => {
      const matches = [...transactions.values()].filter((transaction) => matchesTransactionFilter(transaction, filter));
      return queryResult(matches);
    });
    jest.spyOn(Transaction, 'findOneAndUpdate').mockImplementation(async (filter, update, options = {}) => {
      let transaction = [...transactions.values()].find((item) => matchesTransactionFilter(item, filter));
      if (!transaction && options.upsert) transaction = createTransaction({});
      if (!transaction) return null;
      applyUpdate(transaction, update);
      return transaction;
    });
    jest.spyOn(AuditLog, 'create').mockResolvedValue({ _id: id() });
  });

  test('completes booking, escrow payment, tracking, delivery, and release through HTTP APIs', async () => {
    const clientToken = tokenFor(client);
    const ownerToken = tokenFor(owner);
    const adminToken = tokenFor(admin);

    const created = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${clientToken}`)
      .send({
        pickup: 'Nairobi',
        destination: 'Kampala',
        pickupCoordinates: { lat: -1.2864, lng: 36.8172 },
        destinationCoordinates: { lat: 0.3476, lng: 32.5825 },
        deliveryGeofenceMeters: 250,
        distance: 650,
        vehicleType: 'Lorry',
        cargo: 'Retail stock',
        cargoValue: 8000,
        weight: '8 tonnes',
        budget: 1500,
        paymentMethod: 'wallet',
        receiverName: 'Kampala Receiver',
        receiverPhone: '+256700111222',
        quoteAcknowledged: true
      })
      .expect(201);

    const bookingId = created.body.booking._id;
    expect(created.body.booking.status).toBe('bidding');
    expect(created.body.booking.paymentStatus).toBe('unpaid');

    await request(app)
      .post(`/api/bookings/${bookingId}/bids`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        truck: String(truck._id),
        amount: 1250,
        message: 'Available for pickup tomorrow morning.'
      })
      .expect(200);

    const accepted = await request(app)
      .patch(`/api/bookings/${bookingId}/bids/${owner._id}/accept`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({})
      .expect(200);

    expect(accepted.body.booking.status).toBe('confirmed');
    expect(String(accepted.body.booking.owner)).toBe(String(owner._id));
    expect(String(accepted.body.booking.truck)).toBe(String(truck._id));

    const escrow = await request(app)
      .post(`/api/payments/bookings/${bookingId}/escrow`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ amount: 1250 })
      .expect(201);

    expect(escrow.body.booking.paymentStatus).toBe('escrowed');
    expect(escrow.body.transaction.status).toBe('completed');
    expect(escrow.body.balance).toBe(3750);

    const inTransit = await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        status: 'in_transit',
        location: { lat: -0.3031, lng: 36.08, speed: 72, heading: 291 }
      })
      .expect(200);

    expect(inTransit.body.booking.status).toBe('in_transit');
    expect(inTransit.body.booking.tracking).toHaveLength(1);

    const tracking = await request(app)
      .post(`/api/bookings/${bookingId}/tracking`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ lat: 0.3476, lng: 32.5825, speed: 12, heading: 90, accuracy: 8 })
      .expect(200);

    expect(tracking.body.accepted).toBe(1);
    expect(tracking.body.booking.tracking).toHaveLength(2);

    const uploadedCargoPhotos = await request(app)
      .patch(`/api/bookings/${bookingId}/documents/cargo-photos`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        url: 'https://example.com/cargo-photo-1.webp',
        urls: ['https://example.com/cargo-photo-1.webp', 'https://example.com/cargo-photo-2.webp'],
        fileName: 'cargo-photo-1.webp',
        fileNames: ['cargo-photo-1.webp', 'cargo-photo-2.webp'],
        notes: 'Loaded and sealed cargo condition photos.'
      })
      .expect(200);

    expect(uploadedCargoPhotos.body.booking.documents).toContainEqual(
      expect.objectContaining({ type: 'cargo-photos', status: 'pending' })
    );

    const uploadedPod = await request(app)
      .patch(`/api/bookings/${bookingId}/documents/pod`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        url: 'https://example.com/pod.pdf',
        fileName: 'pod.pdf',
        notes: 'Signed at receiving bay.'
      })
      .expect(200);

    expect(uploadedPod.body.booking.documents).toContainEqual(
      expect.objectContaining({ type: 'pod', status: 'pending', url: 'https://example.com/pod.pdf' })
    );

    const handover = await request(app)
      .patch(`/api/bookings/${bookingId}/status`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        status: 'delivery_pending',
        location: { lat: 0.3476, lng: 32.5825, speed: 0, heading: 90 }
      })
      .expect(200);

    expect(handover.body.booking.status).toBe('delivery_pending');

    const approvedPod = await request(app)
      .patch(`/api/admin/bookings/${bookingId}/documents/pod`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved', notes: 'Receiver signature verified.' })
      .expect(200);

    expect(approvedPod.body.booking.documents).toContainEqual(
      expect.objectContaining({ type: 'pod', status: 'approved' })
    );

    bookings.get(String(bookingId)).deliveryProof = {
      proof: id(),
      recordHash: 'a'.repeat(64),
      verificationMethod: 'sms_otp',
      verifiedAt: new Date(),
      receiverName: 'Kampala Receiver',
      receiverPhoneLast4: '1222',
      photoCount: 2,
      chainHeadHash: 'c'.repeat(64)
    };

    const delivered = await request(app)
      .patch(`/api/bookings/${bookingId}/confirm-delivery`)
      .set('Authorization', `Bearer ${clientToken}`)
      .send({ location: { lat: 0.3476, lng: 32.5825 } })
      .expect(200);

    expect(delivered.body.booking.status).toBe('delivered');
    expect(delivered.body.booking.deliveredAt).toBeTruthy();

    const released = await request(app)
      .post(`/api/payments/bookings/${bookingId}/release`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(201);

    expect(released.body.booking.paymentStatus).toBe('released');
    expect(released.body.transaction).toEqual(
      expect.objectContaining({
        type: 'credit',
        status: 'completed',
        amount: 1250
      })
    );

    const booking = bookings.get(String(bookingId));
    const clientWallet = wallets.get(String(client._id));
    const ownerWallet = wallets.get(String(owner._id));
    const payment = [...transactions.values()].find((transaction) => transaction.type === 'payment');
    const payout = [...transactions.values()].find((transaction) => transaction.type === 'credit');

    expect(booking.status).toBe('delivered');
    expect(booking.paymentStatus).toBe('released');
    expect(booking.tracking).toHaveLength(4);
    expect(booking.documents).toContainEqual(expect.objectContaining({ type: 'cargo-photos', status: 'pending' }));
    expect(booking.documents).toContainEqual(expect.objectContaining({ type: 'pod', status: 'approved' }));
    expect(clientWallet.balance).toBe(3750);
    expect(ownerWallet.balance).toBe(1250);
    expect(payment).toEqual(
      expect.objectContaining({ amount: 1250, status: 'completed', reference: `escrow:${bookingId}` })
    );
    expect(payout).toEqual(
      expect.objectContaining({ amount: 1250, status: 'completed', reference: `release:${bookingId}` })
    );
  });
});
