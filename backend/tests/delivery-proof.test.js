jest.mock('../models/DeliveryCustodyEvent', () => ({
  create: jest.fn(),
  find: jest.fn(),
  findOne: jest.fn()
}));

jest.mock('../models/DeliveryOtpChallenge', () => ({
  findOne: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn()
}));

jest.mock('../models/DeliveryProof', () => ({
  create: jest.fn(),
  exists: jest.fn(),
  findOne: jest.fn()
}));

jest.mock('../models/DeliveryProofAsset', () => ({
  create: jest.fn(),
  find: jest.fn()
}));

jest.mock('../services/documentRecords', () => ({
  recordGeneratedDocument: jest.fn(async () => null)
}));

jest.mock('../services/sms', () => {
  const actual = jest.requireActual('../services/sms');
  return {
    ...actual,
    sendSMS: jest.fn()
  };
});

const mongoose = require('mongoose');
const DeliveryCustodyEvent = require('../models/DeliveryCustodyEvent');
const DeliveryOtpChallenge = require('../models/DeliveryOtpChallenge');
const DeliveryProof = require('../models/DeliveryProof');
const DeliveryProofAsset = require('../models/DeliveryProofAsset');
const { recordGeneratedDocument } = require('../services/documentRecords');
const { sendSMS } = require('../services/sms');
const {
  assertDeliveryProofIntegrity,
  canonicalJson,
  createProofAsset,
  finalizeDeliveryProof,
  requestReceiverOtp,
  sha256,
  verifyCustodyChain
} = require('../services/deliveryProof');

function id() {
  return new mongoose.Types.ObjectId();
}

function selectable(value) {
  const query = {
    select: jest.fn(async () => value)
  };
  query.then = (resolve, reject) => Promise.resolve(value).then(resolve, reject);
  return query;
}

describe('receiver-grade delivery proof', () => {
  let actor;
  let booking;
  let challenge;
  let assets;
  let proof;
  let events;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.DELIVERY_OTP_PEPPER = 'test-delivery-otp-pepper';
    process.env.DELIVERY_OTP_COOLDOWN_SECONDS = '0';
    process.env.DELIVERY_PROOF_MODE = 'strict';

    actor = { _id: id(), role: 'owner' };
    booking = {
      _id: id(),
      client: id(),
      owner: actor._id,
      status: 'in_transit',
      receiverName: 'Kampala Receiver',
      receiverPhone: '+256700111222',
      destinationCoordinates: { lat: 0.3476, lng: 32.5825 },
      deliveryGeofenceMeters: 250,
      documents: [],
      transitionTo: jest.fn(function transitionTo(status) {
        this.status = status;
      }),
      save: jest.fn(async function save() {
        return this;
      })
    };
    challenge = null;
    assets = [];
    proof = null;
    events = [];

    DeliveryProof.exists.mockResolvedValue(false);
    DeliveryProof.findOne.mockImplementation(async () => proof);
    DeliveryOtpChallenge.findOne.mockImplementation(() => selectable(challenge));
    DeliveryOtpChallenge.findOneAndUpdate.mockImplementation(async (_filter, update) => {
      challenge = {
        _id: id(),
        ...update.$set,
        save: jest.fn(async function save() {
          return this;
        })
      };
      return challenge;
    });
    DeliveryOtpChallenge.updateOne.mockResolvedValue({ modifiedCount: 1 });
    DeliveryProofAsset.create.mockImplementation(async (payload) => {
      const asset = { _id: id(), ...payload };
      assets.push(asset);
      return asset;
    });
    DeliveryProofAsset.find.mockImplementation(() => ({
      sort: jest.fn(async () => assets)
    }));
    DeliveryProof.create.mockImplementation(async (payload) => {
      proof = {
        _id: id(),
        createdAt: new Date(),
        ...payload
      };
      return proof;
    });
    DeliveryCustodyEvent.findOne.mockImplementation(() => ({
      sort: jest.fn(() => ({
        lean: jest.fn(async () => events.at(-1) || null)
      }))
    }));
    DeliveryCustodyEvent.create.mockImplementation(async (payload) => {
      const event = { _id: id(), ...payload };
      events.push(event);
      return event;
    });
    DeliveryCustodyEvent.find.mockImplementation(() => ({
      sort: jest.fn(async () => events)
    }));
    sendSMS.mockResolvedValue({ provider: 'test-sms', messageId: 'sms-1' });
  });

  afterEach(() => {
    delete process.env.DELIVERY_OTP_PEPPER;
    delete process.env.DELIVERY_OTP_COOLDOWN_SECONDS;
    delete process.env.DELIVERY_PROOF_MODE;
  });

  test('creates a hash-linked OTP, photo, signature, GPS, and receiver proof chain', async () => {
    const issued = await requestReceiverOtp({ booking, actor });
    const otpMessage = sendSMS.mock.calls[0][1];
    const otp = otpMessage.match(/\b\d{6}\b/)[0];
    expect(issued).not.toHaveProperty('otpDigest');
    expect(issued.receiverPhoneLast4).toBe('1222');

    const asset = await createProofAsset({
      booking,
      actor,
      file: {
        buffer: Buffer.from('server-hashed-photo'),
        originalname: 'arrival.webp',
        mimetype: 'image/webp',
        size: 19
      },
      uploadUrl: 'https://example.com/arrival.webp',
      capturedAt: new Date(),
      location: { lat: 0.3476, lng: 32.5825, accuracy: 8 }
    });

    const now = new Date();
    const result = await finalizeDeliveryProof({
      booking,
      actor,
      payload: {
        otp,
        assetIds: [String(asset._id)],
        signerName: 'Kampala Receiver',
        signerRole: 'Receiving officer',
        signatureType: 'typed',
        signatureValue: 'Kampala Receiver',
        consent: true,
        signedAt: now,
        clientTimestamp: now,
        timezone: 'Africa/Kampala',
        location: {
          lat: 0.3476,
          lng: 32.5825,
          accuracy: 8,
          recordedAt: now
        }
      },
      req: {
        ip: '127.0.0.1',
        get: jest.fn(() => 'Jest browser')
      }
    });

    expect(result.proof.recordHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.proof.photos[0].contentHash).toBe(sha256(Buffer.from('server-hashed-photo')));
    expect(result.proof.signature.valueHash).toBe(sha256('Kampala Receiver'));
    expect(result.proof.location.distanceToDestinationMeters).toBe(0);
    expect(challenge.status).toBe('consumed');
    expect(booking.status).toBe('delivery_pending');
    expect(booking.deliveryProof).toEqual(
      expect.objectContaining({
        recordHash: result.proof.recordHash,
        verificationMethod: 'sms_otp',
        photoCount: 1,
        chainHeadHash: result.chainHeadHash
      })
    );
    expect(booking.documents).toContainEqual(
      expect.objectContaining({
        type: 'receiver-confirmation',
        status: 'approved',
        contentHash: result.proof.recordHash
      })
    );
    expect(recordGeneratedDocument).toHaveBeenCalled();
    expect(events.map((event) => event.eventType)).toEqual(['otp.requested', 'photo.captured', 'proof.finalized']);
    await expect(verifyCustodyChain(booking._id)).resolves.toEqual(
      expect.objectContaining({ valid: true, count: 3, headHash: result.chainHeadHash })
    );
    await expect(assertDeliveryProofIntegrity(booking)).resolves.toEqual(
      expect.objectContaining({ chain: expect.objectContaining({ valid: true, proofValid: true }) })
    );
  });

  test('detects custody metadata tampering', async () => {
    await requestReceiverOtp({ booking, actor });
    expect((await verifyCustodyChain(booking._id)).valid).toBe(true);

    events[0].metadata.receiverPhoneLast4 = '0000';
    const verification = await verifyCustodyChain(booking._id);
    expect(verification).toEqual(expect.objectContaining({ valid: false, brokenAtSequence: 1 }));
  });

  test('completes a delivery with one photo and no OTP, signature, or GPS in simple mode', async () => {
    process.env.DELIVERY_PROOF_MODE = 'simple';
    const asset = await createProofAsset({
      booking,
      actor,
      file: {
        buffer: Buffer.from('simple-delivery-photo'),
        originalname: 'delivered.webp',
        mimetype: 'image/webp',
        size: 21
      },
      uploadUrl: 'https://example.com/delivered.webp',
      capturedAt: new Date()
    });

    const result = await finalizeDeliveryProof({
      booking,
      actor,
      payload: { assetIds: [String(asset._id)] },
      req: { ip: '127.0.0.1', get: jest.fn(() => 'Jest browser') }
    });

    expect(sendSMS).not.toHaveBeenCalled();
    expect(result.policy).toEqual(expect.objectContaining({ mode: 'simple', autoComplete: true }));
    expect(result.proof.verification.method).toBe('photo');
    expect(result.proof.signature).toBeUndefined();
    expect(result.proof.location).toBeUndefined();
    expect(booking.status).toBe('delivered');
    expect(booking.deliveredAt).toBeInstanceOf(Date);
    expect(booking.deliveryProof).toEqual(
      expect.objectContaining({ verificationMethod: 'photo', photoCount: 1, chainHeadHash: result.chainHeadHash })
    );
    expect(events.map((event) => event.eventType)).toEqual(['photo.captured', 'proof.finalized', 'delivery.confirmed']);
    await expect(verifyCustodyChain(booking._id)).resolves.toEqual(
      expect.objectContaining({ valid: true, count: 3, headHash: result.chainHeadHash })
    );
  });

  test('canonical hashing is stable across object key order', () => {
    expect(canonicalJson({ second: 2, first: { b: 2, a: 1 } })).toBe(
      canonicalJson({ first: { a: 1, b: 2 }, second: 2 })
    );
  });
});
