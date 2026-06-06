const mongoose = require('mongoose');
const logger = require('../config/logger');
const { mongoReady } = require('../config/runtime');
const Document = require('../models/Document');
const User = require('../models/User');
const Truck = require('../models/Truck');
const Booking = require('../models/Booking');
const {
  normalizeBookingDocumentType,
  normalizeProfileDocumentType,
  normalizeTruckDocumentType
} = require('../utils/documentTypes');

function objectId(value) {
  const id = value?._id || value;
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
  return id;
}

function titleFromType(type) {
  return String(type || 'Document')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null));
}

function urlsFromPatch(patch = {}) {
  if (Array.isArray(patch.urls) && patch.urls.length) return patch.urls;
  return patch.url ? [patch.url] : undefined;
}

function fileNamesFromPatch(patch = {}) {
  if (Array.isArray(patch.fileNames) && patch.fileNames.length) return patch.fileNames;
  return patch.fileName ? [patch.fileName] : undefined;
}

function patchFromEmbeddedDocument(doc = {}) {
  return compact({
    url: doc.url,
    urls: doc.urls,
    fileName: doc.fileName,
    fileNames: doc.fileNames,
    publicId: doc.publicId,
    status: doc.status,
    notes: doc.notes,
    reviewNotes: doc.reviewNotes || doc.notes,
    reviewedAt: doc.reviewedAt,
    generatedAt: doc.generatedAt,
    expiresAt: doc.expiresAt
  });
}

function sourceFromEmbeddedDocument(doc = {}) {
  if (doc.generatedAt) return 'generated';
  if (doc.reviewedAt || ['approved', 'rejected', 'expired'].includes(doc.status)) return 'reviewed';
  return 'uploaded';
}

async function upsertDocumentRecord({
  targetType,
  targetId,
  type,
  userId,
  uploadedBy,
  reviewedBy,
  bookingId,
  truckId,
  patch = {},
  source = 'uploaded',
  metadata
}) {
  if (!mongoReady()) return null;

  const target = objectId(targetId);
  const user = objectId(userId);
  const documentType = String(type || '').trim();
  const targetModel = Document.targetModelFor(targetType);

  if (!target || !user || !targetModel || !documentType) {
    logger.warn({ targetType, targetId, type }, 'Skipping document record without required ids');
    return null;
  }

  const status = patch.status || (source === 'generated' ? 'approved' : 'pending');
  const now = new Date();
  const reviewer = objectId(reviewedBy);
  const shouldSetReviewedAt = Boolean(reviewer) || Boolean(patch.reviewedAt);
  const update = compact({
    user,
    uploadedBy: objectId(uploadedBy),
    targetType,
    targetModel,
    target,
    type: documentType,
    title: patch.title || titleFromType(documentType),
    url: patch.url,
    urls: urlsFromPatch(patch),
    fileName: patch.fileName,
    fileNames: fileNamesFromPatch(patch),
    publicId: patch.publicId,
    status,
    source,
    notes: patch.notes,
    reviewNotes: patch.reviewNotes || patch.notes,
    reviewedBy: reviewer,
    reviewedAt: shouldSetReviewedAt ? patch.reviewedAt || now : patch.reviewedAt,
    generatedAt: source === 'generated' ? patch.generatedAt || now : patch.generatedAt,
    expiresAt: patch.expiresAt,
    booking: objectId(bookingId),
    truck: objectId(truckId),
    metadata
  });

  try {
    return await Document.findOneAndUpdate(
      { targetType, target, type: documentType },
      { $set: update },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true
      }
    );
  } catch (err) {
    logger.error({ err, targetType, targetId, type }, 'Document record persistence failed');
    return null;
  }
}

function recordUploadedDocument(options) {
  return upsertDocumentRecord({ ...options, source: 'uploaded', patch: { ...options.patch, status: 'pending' } });
}

function recordReviewedDocument(options) {
  return upsertDocumentRecord({ ...options, source: 'reviewed' });
}

function recordGeneratedDocument(options) {
  return upsertDocumentRecord({ ...options, source: 'generated', patch: { ...options.patch, status: 'approved' } });
}

async function syncUserDocumentRecords(user) {
  const docs = Array.isArray(user?.documents) ? user.documents : [];
  if (!docs.length) return 0;

  const writes = docs.map((doc) =>
    upsertDocumentRecord({
      targetType: 'user',
      targetId: user._id,
      type: normalizeProfileDocumentType(doc.type, user.role),
      userId: user._id,
      patch: patchFromEmbeddedDocument(doc),
      source: sourceFromEmbeddedDocument(doc),
      metadata: { role: user.role, importedFromEmbedded: true }
    })
  );

  await Promise.all(writes);
  return docs.length;
}

async function syncTruckDocumentRecords(truck) {
  const docs = Array.isArray(truck?.documents) ? truck.documents : [];
  if (!docs.length || !objectId(truck.owner)) return 0;

  const writes = docs.map((doc) =>
    upsertDocumentRecord({
      targetType: 'truck',
      targetId: truck._id,
      type: normalizeTruckDocumentType(doc.type),
      userId: truck.owner,
      truckId: truck._id,
      patch: patchFromEmbeddedDocument(doc),
      source: sourceFromEmbeddedDocument(doc),
      metadata: { importedFromEmbedded: true }
    })
  );

  await Promise.all(writes);
  return docs.length;
}

async function syncBookingDocumentRecords(booking, fallbackUserId) {
  const docs = Array.isArray(booking?.documents) ? booking.documents : [];
  const owner = objectId(booking?.owner);
  const client = objectId(booking?.client);
  const userId = client || owner || fallbackUserId;
  if (!docs.length || !objectId(userId)) return 0;

  const writes = docs.map((doc) =>
    upsertDocumentRecord({
      targetType: 'booking',
      targetId: booking._id,
      type: normalizeBookingDocumentType(doc.type),
      userId,
      bookingId: booking._id,
      truckId: booking.truck,
      patch: patchFromEmbeddedDocument(doc),
      source: sourceFromEmbeddedDocument(doc),
      metadata: {
        client: booking.client,
        owner: booking.owner,
        truck: booking.truck,
        importedFromEmbedded: true
      }
    })
  );

  await Promise.all(writes);
  return docs.length;
}

async function syncEmbeddedDocumentRecords(user, limit = 200) {
  if (!mongoReady()) return { synced: 0 };

  const isAdmin = user?.role === 'admin';
  const userId = objectId(user?._id);
  const docsQuery = { 'documents.0': { $exists: true } };
  const [users, trucks, bookings] = await Promise.all([
    User.find(isAdmin ? docsQuery : { ...docsQuery, _id: userId })
      .select('_id role documents')
      .limit(limit),
    Truck.find(isAdmin ? docsQuery : { ...docsQuery, owner: userId })
      .select('_id owner documents')
      .limit(limit),
    Booking.find(
      isAdmin
        ? docsQuery
        : {
            ...docsQuery,
            $or: [{ client: userId }, { owner: userId }, { 'bids.owner': userId }]
          }
    )
      .select('_id client owner truck bids.owner documents')
      .limit(limit)
  ]);

  const counts = await Promise.all([
    ...users.map(syncUserDocumentRecords),
    ...trucks.map(syncTruckDocumentRecords),
    ...bookings.map((booking) => syncBookingDocumentRecords(booking, userId))
  ]);

  return { synced: counts.reduce((sum, count) => sum + count, 0) };
}

module.exports = {
  recordGeneratedDocument,
  recordReviewedDocument,
  recordUploadedDocument,
  syncEmbeddedDocumentRecords,
  titleFromType,
  upsertDocumentRecord
};
