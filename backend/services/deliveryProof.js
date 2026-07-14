const crypto = require('crypto');
const AppError = require('../utils/AppError');
const DeliveryCustodyEvent = require('../models/DeliveryCustodyEvent');
const DeliveryOtpChallenge = require('../models/DeliveryOtpChallenge');
const DeliveryProof = require('../models/DeliveryProof');
const DeliveryProofAsset = require('../models/DeliveryProofAsset');
const { recordGeneratedDocument } = require('./documentRecords');
const { normalizePhoneNumber, sendSMS } = require('./sms');
const { assertDeliveryGeofence, geoDistanceMeters } = require('./operationsPolicy');
const { deliveryProofPolicy, strictDeliveryProof } = require('../config/deliveryProofPolicy');

const OTP_CONSENT_TEXT =
  'I confirm that I received the shipment described in this booking and that this electronic signature is accurate.';

function canonicalValue(value) {
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return value.toString('hex');
  if (typeof value?.toHexString === 'function') return value.toHexString();
  if (typeof value?.toObject === 'function') {
    return canonicalValue(value.toObject({ depopulate: true, versionKey: false }));
  }
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonicalValue(value[key])])
    );
  }
  return value;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function sha256(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return crypto.createHash('sha256').update(input).digest('hex');
}

function validCoordinates(value = {}) {
  const lat = Number(value?.lat);
  const lng = Number(value?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return {
    lat,
    lng,
    ...(value.accuracy !== undefined && value.accuracy !== '' ? { accuracy: Number(value.accuracy) } : {})
  };
}

function asDate(value, fallback = new Date()) {
  const parsed = value ? new Date(value) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function assertRecentTimestamp(value, label, options = {}) {
  const now = options.now || new Date();
  const timestamp = asDate(value, now);
  const ageMs = now.getTime() - timestamp.getTime();
  const maxAgeMs = Number(options.maxAgeMs || 24 * 60 * 60 * 1000);
  const futureToleranceMs = Number(options.futureToleranceMs || 5 * 60 * 1000);
  if (ageMs > maxAgeMs || ageMs < -futureToleranceMs) {
    throw new AppError(`${label} timestamp is outside the accepted delivery window`, 422);
  }
  return timestamp;
}

function otpPepper() {
  return process.env.DELIVERY_OTP_PEPPER || process.env.JWT_SECRET || 'dev-delivery-otp-pepper';
}

function otpDigest(bookingId, otp, salt) {
  return crypto.createHmac('sha256', otpPepper()).update(`${bookingId}:${salt}:${otp}`).digest('hex');
}

function secureOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

function safeEqualHex(left, right) {
  const first = Buffer.from(String(left || ''), 'hex');
  const second = Buffer.from(String(right || ''), 'hex');
  return first.length > 0 && first.length === second.length && crypto.timingSafeEqual(first, second);
}

function phoneLast4(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.slice(-4) || digits;
}

function challengePublic(challenge) {
  const value = challenge?.toObject ? challenge.toObject() : { ...challenge };
  delete value.otpDigest;
  delete value.otpSalt;
  delete value.receiverPhone;
  return value;
}

function eventHashPayload(event) {
  return {
    booking: String(event.booking),
    sequence: Number(event.sequence),
    eventType: event.eventType,
    actor: String(event.actor),
    actorRole: event.actorRole,
    occurredAt: asDate(event.occurredAt).toISOString(),
    payloadHash: event.payloadHash,
    previousHash: event.previousHash || ''
  };
}

function custodyEventHash(event) {
  return sha256(canonicalJson(eventHashPayload(event)));
}

function proofRecordPayload(proof) {
  return {
    booking: proof.booking,
    submittedBy: proof.submittedBy,
    receiver: {
      name: proof.receiver?.name,
      role: proof.receiver?.role,
      phoneHash: proof.receiver?.phoneHash,
      phoneLast4: proof.receiver?.phoneLast4
    },
    verification: {
      method: proof.verification?.method,
      challenge: proof.verification?.challenge,
      verifiedAt: proof.verification?.verifiedAt,
      provider: proof.verification?.provider
    },
    signature: {
      type: proof.signature?.type,
      signerName: proof.signature?.signerName,
      signerRole: proof.signature?.signerRole,
      consentText: proof.signature?.consentText,
      signedAt: proof.signature?.signedAt,
      valueHash: proof.signature?.valueHash
    },
    location: {
      lat: proof.location?.lat,
      lng: proof.location?.lng,
      accuracy: proof.location?.accuracy,
      recordedAt: proof.location?.recordedAt,
      ingestedAt: proof.location?.ingestedAt,
      distanceToDestinationMeters: proof.location?.distanceToDestinationMeters,
      geofenceMeters: proof.location?.geofenceMeters,
      destinationLat: proof.location?.destinationLat,
      destinationLng: proof.location?.destinationLng
    },
    photos: (proof.photos || []).map((photo) => ({
      asset: photo.asset,
      url: photo.url,
      fileName: photo.fileName,
      mimeType: photo.mimeType,
      size: photo.size,
      contentHash: photo.contentHash,
      recordHash: photo.recordHash,
      capturedAt: photo.capturedAt
    })),
    clientMetadata: {
      timestamp: proof.clientMetadata?.timestamp,
      timezone: proof.clientMetadata?.timezone,
      userAgent: proof.clientMetadata?.userAgent,
      ipHash: proof.clientMetadata?.ipHash
    },
    previousCustodyHash: proof.previousCustodyHash
  };
}

function proofRecordHash(proof) {
  return sha256(canonicalJson(proofRecordPayload(proof)));
}

async function lastCustodyEvent(bookingId) {
  return DeliveryCustodyEvent.findOne({ booking: bookingId }).sort({ sequence: -1 }).lean();
}

async function appendCustodyEvent({ bookingId, actor, eventType, metadata = {}, occurredAt = new Date() }) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const previous = await lastCustodyEvent(bookingId);
    const event = {
      booking: bookingId,
      sequence: Number(previous?.sequence || 0) + 1,
      eventType,
      actor: actor._id,
      actorRole: actor.role,
      occurredAt,
      metadata: canonicalValue(metadata),
      payloadHash: sha256(canonicalJson(metadata)),
      previousHash: previous?.eventHash || ''
    };
    event.eventHash = custodyEventHash(event);

    try {
      return await DeliveryCustodyEvent.create(event);
    } catch (err) {
      if (err.code !== 11000 || attempt === 2) throw err;
    }
  }
  return null;
}

function providerMessageId(result = {}) {
  return (
    result.messageId ||
    result.id ||
    result.response?.SMSMessageData?.Recipients?.[0]?.messageId ||
    result.response?.SMSMessageData?.Recipients?.[0]?.messageid
  );
}

function otpTtlMs() {
  const configured = Number(process.env.DELIVERY_OTP_TTL_MINUTES);
  const minutes = Number.isFinite(configured) && configured > 0 ? Math.min(configured, 30) : 10;
  return minutes * 60 * 1000;
}

function otpCooldownMs() {
  const configured = Number(process.env.DELIVERY_OTP_COOLDOWN_SECONDS);
  const seconds = Number.isFinite(configured) && configured >= 0 ? Math.min(configured, 600) : 60;
  return seconds * 1000;
}

function assertProofCaptureStatus(booking) {
  if (['in_transit', 'delivery_pending'].includes(booking.status)) return;
  throw new AppError('Receiver proof can only be captured for an active delivery', 409, {
    allowedStatuses: ['in_transit', 'delivery_pending']
  });
}

async function requestReceiverOtp({ booking, actor }) {
  if (!strictDeliveryProof()) {
    throw new AppError('Receiver OTP is disabled while simple delivery proof mode is active', 409, {
      policy: deliveryProofPolicy()
    });
  }
  assertProofCaptureStatus(booking);
  if (await DeliveryProof.exists({ booking: booking._id })) {
    throw new AppError('Receiver proof has already been finalized for this booking', 409);
  }

  const receiverPhone = normalizePhoneNumber(booking.receiverPhone);
  if (!receiverPhone) throw new AppError('A receiver phone number is required before requesting delivery OTP', 409);

  const existing = await DeliveryOtpChallenge.findOne({ booking: booking._id });
  const now = new Date();
  if (
    existing?.status === 'active' &&
    existing.sentAt &&
    now.getTime() - new Date(existing.sentAt).getTime() < otpCooldownMs()
  ) {
    const retryAfterSeconds = Math.ceil(
      (otpCooldownMs() - (now.getTime() - new Date(existing.sentAt).getTime())) / 1000
    );
    throw new AppError('Wait before requesting another receiver OTP', 429, { retryAfterSeconds });
  }

  const otp = secureOtp();
  const otpSalt = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(now.getTime() + otpTtlMs());
  const challenge = await DeliveryOtpChallenge.findOneAndUpdate(
    { booking: booking._id },
    {
      $set: {
        booking: booking._id,
        requestedBy: actor._id,
        receiverPhone,
        receiverPhoneHash: sha256(receiverPhone),
        receiverPhoneLast4: phoneLast4(receiverPhone),
        otpDigest: otpDigest(booking._id, otp, otpSalt),
        otpSalt,
        status: 'active',
        attempts: 0,
        maxAttempts: 5,
        requestedAt: now,
        sentAt: undefined,
        expiresAt,
        consumedAt: undefined,
        provider: undefined,
        providerMessageId: undefined
      }
    },
    { new: true, upsert: true, setDefaultsOnInsert: true, runValidators: true }
  );

  let sendResult;
  try {
    sendResult = await sendSMS(
      receiverPhone,
      `iTruck delivery code for booking ${booking._id}: ${otp}. It expires in ${Math.round(otpTtlMs() / 60000)} minutes.`
    );
  } catch (err) {
    await DeliveryOtpChallenge.updateOne({ _id: challenge._id, status: 'active' }, { $set: { status: 'failed' } });
    throw err;
  }

  challenge.sentAt = new Date();
  challenge.provider = sendResult?.provider || 'sms';
  challenge.providerMessageId = providerMessageId(sendResult);
  await challenge.save();

  await appendCustodyEvent({
    bookingId: booking._id,
    actor,
    eventType: 'otp.requested',
    metadata: {
      challengeId: challenge._id,
      receiverPhoneHash: challenge.receiverPhoneHash,
      receiverPhoneLast4: challenge.receiverPhoneLast4,
      expiresAt
    }
  });

  return challengePublic(challenge);
}

async function createProofAsset({ booking, actor, file, uploadUrl, capturedAt, location }) {
  assertProofCaptureStatus(booking);
  if (await DeliveryProof.exists({ booking: booking._id })) {
    throw new AppError('Receiver proof has already been finalized for this booking', 409);
  }

  const capturedLocation = validCoordinates(location);
  if (strictDeliveryProof() && !capturedLocation) throw new AppError('Photo GPS coordinates are required', 422);
  const captured = assertRecentTimestamp(capturedAt, 'Photo capture');
  const uploadedAt = new Date();
  const contentHash = sha256(file.buffer);
  const record = {
    booking: booking._id,
    uploadedBy: actor._id,
    url: uploadUrl,
    fileName: file.originalname || 'delivery-photo',
    mimeType: file.mimetype,
    size: file.size || file.buffer.length,
    contentHash,
    capturedAt: captured,
    uploadedAt,
    ...(capturedLocation ? { location: capturedLocation } : {})
  };
  record.recordHash = sha256(canonicalJson(record));
  const asset = await DeliveryProofAsset.create(record);

  await appendCustodyEvent({
    bookingId: booking._id,
    actor,
    eventType: 'photo.captured',
    occurredAt: uploadedAt,
    metadata: {
      assetId: asset._id,
      contentHash,
      recordHash: asset.recordHash,
      capturedAt: captured,
      ...(capturedLocation ? { location: capturedLocation } : {})
    }
  });

  return asset;
}

async function activeChallenge(bookingId) {
  return DeliveryOtpChallenge.findOne({ booking: bookingId }).select('+otpDigest +otpSalt');
}

async function verifyChallenge(bookingId, otp) {
  const challenge = await activeChallenge(bookingId);
  if (!challenge) throw new AppError('Request a receiver OTP before finalizing delivery proof', 409);

  const now = new Date();
  if (challenge.status !== 'active') {
    throw new AppError(`Receiver OTP is ${challenge.status}`, 409);
  }
  if (new Date(challenge.expiresAt).getTime() <= now.getTime()) {
    challenge.status = 'expired';
    await challenge.save();
    throw new AppError('Receiver OTP has expired', 409);
  }

  const expected = otpDigest(bookingId, otp, challenge.otpSalt);
  if (!safeEqualHex(expected, challenge.otpDigest)) {
    challenge.attempts += 1;
    if (challenge.attempts >= challenge.maxAttempts) challenge.status = 'locked';
    await challenge.save();
    throw new AppError(
      challenge.status === 'locked' ? 'Receiver OTP is locked after too many attempts' : 'Receiver OTP is invalid',
      401,
      { attemptsRemaining: Math.max(0, challenge.maxAttempts - challenge.attempts) }
    );
  }
  return challenge;
}

function assetSnapshot(asset) {
  return {
    asset: asset._id,
    url: asset.url,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    size: asset.size,
    contentHash: asset.contentHash,
    recordHash: asset.recordHash,
    capturedAt: asset.capturedAt
  };
}

function upsertReceiverConfirmation(booking, proof) {
  const existing = (booking.documents || []).find((document) => document.type === 'receiver-confirmation');
  const patch = {
    type: 'receiver-confirmation',
    status: 'approved',
    notes:
      proof.verification.method === 'sms_otp'
        ? `Receiver verified by SMS OTP. Proof hash ${proof.recordHash}.`
        : `Delivery verified by photo in simple mode. Proof hash ${proof.recordHash}.`,
    generatedAt: proof.createdAt || new Date(),
    reviewedAt: proof.verification.verifiedAt,
    contentHash: proof.recordHash,
    proof: proof._id
  };
  if (existing) Object.assign(existing, patch);
  else booking.documents.push(patch);
}

async function finalizeDeliveryProof({ booking, actor, payload, req }) {
  assertProofCaptureStatus(booking);
  if (await DeliveryProof.exists({ booking: booking._id })) {
    throw new AppError('Receiver proof has already been finalized for this booking', 409);
  }

  const strict = strictDeliveryProof();
  const location = validCoordinates(payload.location);
  if (strict && !location) throw new AppError('Delivery GPS coordinates are required', 422);
  if (strict && payload.consent !== true) throw new AppError('Receiver signature consent is required', 422);
  if (strict) assertDeliveryGeofence(booking, location);

  const challenge = strict ? await verifyChallenge(booking._id, payload.otp) : null;
  const uniqueAssetIds = [...new Set(payload.assetIds.map(String))];
  const assets = await DeliveryProofAsset.find({
    _id: { $in: uniqueAssetIds },
    booking: booking._id
  }).sort({ createdAt: 1 });
  if (assets.length !== uniqueAssetIds.length) {
    throw new AppError('One or more delivery photos are missing or belong to another booking', 409);
  }

  const now = new Date();
  const recordedAt = strict
    ? assertRecentTimestamp(payload.location.recordedAt || payload.clientTimestamp, 'Delivery GPS')
    : null;
  const signedAt = strict
    ? assertRecentTimestamp(payload.signedAt || payload.clientTimestamp, 'Receiver signature')
    : null;
  const destination = validCoordinates(booking.destinationCoordinates);
  const previous = await lastCustodyEvent(booking._id);
  const receiverPhone = strict ? normalizePhoneNumber(challenge.receiverPhone || booking.receiverPhone) : '';
  const signatureValue = String(payload.signatureValue || payload.signerName).trim();
  const photos = assets.map(assetSnapshot);
  const proofData = {
    booking: booking._id,
    submittedBy: actor._id,
    receiver: {
      name: strict ? payload.signerName : booking.receiverName || 'Delivery receiver',
      ...(strict
        ? {
            role: payload.signerRole,
            phoneHash: sha256(receiverPhone),
            phoneLast4: phoneLast4(receiverPhone)
          }
        : {})
    },
    verification: {
      method: strict ? 'sms_otp' : 'photo',
      ...(challenge ? { challenge: challenge._id } : {}),
      verifiedAt: now,
      provider: strict ? challenge.provider : 'itruck-simple'
    },
    ...(strict
      ? {
          signature: {
            type: payload.signatureType,
            signerName: payload.signerName,
            signerRole: payload.signerRole,
            consentText: OTP_CONSENT_TEXT,
            signedAt,
            valueHash: sha256(signatureValue)
          },
          location: {
            ...location,
            recordedAt,
            ingestedAt: now,
            ...(destination
              ? {
                  distanceToDestinationMeters: geoDistanceMeters(location, destination),
                  geofenceMeters: Number(booking.deliveryGeofenceMeters || 100),
                  destinationLat: destination.lat,
                  destinationLng: destination.lng
                }
              : {})
          }
        }
      : {}),
    photos,
    clientMetadata: {
      timestamp: payload.clientTimestamp ? asDate(payload.clientTimestamp) : now,
      timezone: payload.timezone,
      userAgent: req?.get?.('user-agent') || '',
      ipHash: req?.ip ? sha256(req.ip) : undefined
    },
    previousCustodyHash: previous?.eventHash
  };
  proofData.recordHash = proofRecordHash(proofData);

  const proof = await DeliveryProof.create(proofData);
  const finalEvent = await appendCustodyEvent({
    bookingId: booking._id,
    actor,
    eventType: 'proof.finalized',
    occurredAt: now,
    metadata: {
      proofId: proof._id,
      proofHash: proof.recordHash,
      receiverPhoneHash: proof.receiver.phoneHash,
      signatureHash: proof.signature?.valueHash,
      photoHashes: photos.map((photo) => photo.contentHash),
      location: proof.location
    }
  });

  if (challenge) {
    challenge.status = 'consumed';
    challenge.consumedAt = now;
    await challenge.save();
  }

  booking.deliveryProof = {
    proof: proof._id,
    recordHash: proof.recordHash,
    verificationMethod: strict ? 'sms_otp' : 'photo',
    verifiedAt: now,
    receiverName: proof.receiver.name,
    receiverPhoneLast4: proof.receiver.phoneLast4,
    photoCount: photos.length,
    chainHeadHash: finalEvent.eventHash
  };
  booking.documents = booking.documents || [];
  upsertReceiverConfirmation(booking, proof);
  if (strict && booking.status === 'in_transit') booking.transitionTo('delivery_pending');
  if (!strict) {
    booking.transitionTo('delivered');
    booking.deliveredAt = now;
  }
  await booking.save();

  let chainHeadHash = finalEvent.eventHash;
  if (!strict) {
    const confirmationEvent = await recordDeliveryConfirmation({ booking, actor });
    chainHeadHash = confirmationEvent?.eventHash || chainHeadHash;
    await booking.save();
  }

  await recordGeneratedDocument({
    targetType: 'booking',
    targetId: booking._id,
    type: 'receiver-confirmation',
    userId: booking.client || actor._id,
    uploadedBy: actor._id,
    bookingId: booking._id,
    patch: {
      status: 'approved',
      notes: strict
        ? `Receiver OTP and e-signature verified. Proof hash ${proof.recordHash}.`
        : `Delivery photo verified in simple mode. Proof hash ${proof.recordHash}.`,
      generatedAt: now
    },
    metadata: {
      proofId: proof._id,
      proofHash: proof.recordHash,
      chainHeadHash,
      photoHashes: photos.map((photo) => photo.contentHash)
    }
  });

  return { proof, booking, chainHeadHash, policy: deliveryProofPolicy() };
}

async function verifyCustodyChain(bookingId) {
  const events = await DeliveryCustodyEvent.find({ booking: bookingId }).sort({ sequence: 1 });
  let previousHash = '';
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const value = event?.toObject ? event.toObject() : event;
    const payloadHash = sha256(canonicalJson(value.metadata || {}));
    const expectedHash = custodyEventHash(value);
    if (
      Number(value.sequence) !== index + 1 ||
      value.previousHash !== previousHash ||
      value.payloadHash !== payloadHash ||
      value.eventHash !== expectedHash
    ) {
      return {
        valid: false,
        count: events.length,
        brokenAtSequence: Number(value.sequence) || index + 1,
        headHash: previousHash
      };
    }
    previousHash = value.eventHash;
  }
  return { valid: true, count: events.length, brokenAtSequence: null, headHash: previousHash };
}

async function deliveryProofBundle(bookingId) {
  const [proof, assets, events, verification] = await Promise.all([
    DeliveryProof.findOne({ booking: bookingId }),
    DeliveryProofAsset.find({ booking: bookingId }).sort({ createdAt: 1 }),
    DeliveryCustodyEvent.find({ booking: bookingId }).sort({ sequence: 1 }),
    verifyCustodyChain(bookingId)
  ]);
  const proofValid = Boolean(proof && proof.recordHash === proofRecordHash(proof));
  return {
    proof,
    assets: assets.map((asset) => ({
      id: asset._id,
      url: asset.url,
      fileName: asset.fileName,
      capturedAt: asset.capturedAt,
      location: asset.location
    })),
    events,
    chain: {
      ...verification,
      proofValid,
      valid: verification.valid && proofValid
    }
  };
}

async function assertDeliveryProofIntegrity(booking) {
  const bundle = await deliveryProofBundle(booking._id);
  const summary = booking.deliveryProof || {};
  if (
    !bundle.proof ||
    !bundle.chain.valid ||
    String(bundle.proof._id) !== String(summary.proof) ||
    bundle.proof.recordHash !== summary.recordHash ||
    bundle.chain.headHash !== summary.chainHeadHash
  ) {
    throw new AppError('Delivery proof integrity verification failed', 409, {
      proofPresent: Boolean(bundle.proof),
      proofValid: bundle.chain.proofValid,
      chainValid: bundle.chain.valid,
      chainEvents: bundle.chain.count
    });
  }
  return bundle;
}

async function recordDeliveryConfirmation({ booking, actor }) {
  const event = await appendCustodyEvent({
    bookingId: booking._id,
    actor,
    eventType: 'delivery.confirmed',
    metadata: {
      proofId: booking.deliveryProof?.proof,
      proofHash: booking.deliveryProof?.recordHash,
      deliveredAt: booking.deliveredAt
    }
  });
  if (booking.deliveryProof && event?.eventHash) {
    booking.deliveryProof.chainHeadHash = event.eventHash;
  }
  return event;
}

module.exports = {
  OTP_CONSENT_TEXT,
  appendCustodyEvent,
  assertDeliveryProofIntegrity,
  canonicalJson,
  createProofAsset,
  custodyEventHash,
  deliveryProofBundle,
  finalizeDeliveryProof,
  proofRecordHash,
  recordDeliveryConfirmation,
  requestReceiverOtp,
  sha256,
  verifyCustodyChain
};
