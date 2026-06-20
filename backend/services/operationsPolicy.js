const AppError = require('../utils/AppError');
const {
  normalizeBookingDocumentType,
  normalizeProfileDocumentType,
  normalizeTruckDocumentType
} = require('../utils/documentTypes');

const OWNER_REQUIRED_DOCUMENTS = ['owner-kyc', 'driver-id', 'business-registration', 'insurance'];
const TRUCK_REQUIRED_DOCUMENTS = [
  'vehicle-photos',
  'insurance',
  'vehicle-logbook',
  'road-license',
  'inspection-report'
];
const DELIVERY_PROOF_DOCUMENTS = ['pod', 'receiver-confirmation'];
const DEFAULT_DELIVERY_GEOFENCE_METERS = 100;

function sameId(left, right) {
  return String(left?._id || left || '') === String(right?._id || right || '');
}

function approvedDocumentTypes(documents = [], normalizeType = (value) => value) {
  return new Set(
    documents
      .filter(
        (doc) =>
          doc?.status === 'approved' &&
          Boolean(doc.url || (Array.isArray(doc.urls) && doc.urls.length) || doc.generatedAt)
      )
      .map((doc) => normalizeType(doc.type))
      .filter(Boolean)
  );
}

function validCoordinates(value = {}) {
  if (!value || typeof value !== 'object') return null;
  const lat = Number(value.lat);
  const lng = Number(value.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function geoDistanceMeters(left, right) {
  const from = validCoordinates(left);
  const to = validCoordinates(right);
  if (!from || !to) return null;

  const earthRadiusMeters = 6371000;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return Math.round(earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function latestTrackingLocation(booking = {}) {
  const tracking = Array.isArray(booking.tracking) ? booking.tracking : [];
  for (let index = tracking.length - 1; index >= 0; index -= 1) {
    const location = validCoordinates(tracking[index]);
    if (location) return location;
  }
  return null;
}

function missingApprovedDocuments(documents = [], requiredTypes = [], normalizeType = (value) => value) {
  const approved = approvedDocumentTypes(documents, normalizeType);
  return requiredTypes.filter((type) => !approved.has(normalizeType(type)));
}

function assertOwnerCanBid(owner, truck) {
  if (!owner || owner.role !== 'owner') return;

  const missingOwnerDocuments = missingApprovedDocuments(owner.documents || [], OWNER_REQUIRED_DOCUMENTS, (type) =>
    normalizeProfileDocumentType(type, 'owner')
  );
  if (owner.isVerified !== true || missingOwnerDocuments.length) {
    throw new AppError('Complete owner verification before bidding', 403, {
      missingOwnerDocuments,
      isVerified: Boolean(owner.isVerified)
    });
  }

  if (!truck) {
    throw new AppError('Choose an approved truck before bidding', 409);
  }

  if (!sameId(truck.owner, owner._id)) {
    throw new AppError('Truck does not belong to the bidding owner', 403);
  }

  if (truck.archivedAt) {
    throw new AppError('Archived trucks cannot be used for bidding', 409);
  }

  if (truck.isAvailable === false) {
    throw new AppError('Truck is not available for bidding', 409);
  }

  const missingTruckDocuments = missingApprovedDocuments(
    truck.documents || [],
    TRUCK_REQUIRED_DOCUMENTS,
    normalizeTruckDocumentType
  );
  if (truck.isVerified !== true || missingTruckDocuments.length) {
    throw new AppError('Complete truck verification before bidding', 403, {
      truckId: truck._id,
      missingTruckDocuments,
      isVerified: Boolean(truck.isVerified)
    });
  }
}

function deliveryProofDocuments(booking = {}, options = {}) {
  const approvedOnly = options.approvedOnly === true;
  return (booking.documents || []).filter((doc) => {
    const type = normalizeBookingDocumentType(doc.type);
    const hasProofRecord = Boolean(doc.url || (Array.isArray(doc.urls) && doc.urls.length) || doc.generatedAt);
    const usableStatus = approvedOnly ? doc.status === 'approved' : !['rejected', 'expired'].includes(doc.status);
    return DELIVERY_PROOF_DOCUMENTS.includes(type) && hasProofRecord && usableStatus;
  });
}

function hasDeliveryProof(booking = {}, options = {}) {
  return deliveryProofDocuments(booking, options).length > 0;
}

function assertDeliveryProofForDelivery(booking = {}) {
  if (hasDeliveryProof(booking)) return;
  throw new AppError('Upload proof of delivery or receiver confirmation before marking delivery complete', 409, {
    requiredDocuments: DELIVERY_PROOF_DOCUMENTS
  });
}

function assertDeliveryGeofence(booking = {}, currentLocation = null, options = {}) {
  const destination = validCoordinates(booking.destinationCoordinates);
  if (!destination) return;

  const location = validCoordinates(currentLocation) || latestTrackingLocation(booking);
  if (!location) {
    throw new AppError('Current driver location is required before delivery confirmation', 409, {
      requiredLocation: 'lat/lng',
      destinationCoordinates: destination
    });
  }

  const radius = Number(options.radiusMeters || booking.deliveryGeofenceMeters || DEFAULT_DELIVERY_GEOFENCE_METERS);
  const geofenceMeters =
    Number.isFinite(radius) && radius > 0 ? Math.min(5000, Math.max(25, radius)) : DEFAULT_DELIVERY_GEOFENCE_METERS;
  const distanceMeters = geoDistanceMeters(location, destination);
  if (distanceMeters <= geofenceMeters) return;

  throw new AppError('Driver must be within delivery geofence before delivery confirmation', 409, {
    distanceMeters,
    geofenceMeters,
    destinationCoordinates: destination,
    currentLocation: location
  });
}

function assertDeliveryProofForPaymentRelease(booking = {}) {
  if (hasDeliveryProof(booking, { approvedOnly: true })) return;
  throw new AppError('Approve proof of delivery or receiver confirmation before releasing payment', 409, {
    requiredDocuments: DELIVERY_PROOF_DOCUMENTS
  });
}

module.exports = {
  DELIVERY_PROOF_DOCUMENTS,
  DEFAULT_DELIVERY_GEOFENCE_METERS,
  OWNER_REQUIRED_DOCUMENTS,
  TRUCK_REQUIRED_DOCUMENTS,
  assertDeliveryGeofence,
  assertDeliveryProofForDelivery,
  assertDeliveryProofForPaymentRelease,
  assertOwnerCanBid,
  deliveryProofDocuments,
  geoDistanceMeters,
  hasDeliveryProof,
  latestTrackingLocation,
  missingApprovedDocuments
};
