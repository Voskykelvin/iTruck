const {
  assertDeliveryProofForDelivery,
  assertDeliveryProofForPaymentRelease,
  assertDeliveryGeofence,
  assertReceiverGradeDeliveryProof,
  assertOwnerCanBid,
  geoDistanceMeters,
  missingApprovedDocuments
} = require('../services/operationsPolicy');

const ownerDocs = [
  { type: 'owner-kyc', status: 'approved', url: 'https://example.com/owner-kyc.pdf' },
  { type: 'driver-id', status: 'approved', url: 'https://example.com/driver-id.pdf' },
  { type: 'business-registration', status: 'approved', url: 'https://example.com/business-registration.pdf' },
  { type: 'insurance', status: 'approved', url: 'https://example.com/owner-insurance.pdf' }
];

const truckDocs = [
  { type: 'vehicle-photos', status: 'approved', url: 'https://example.com/vehicle.webp' },
  { type: 'insurance', status: 'approved', url: 'https://example.com/truck-insurance.pdf' },
  { type: 'vehicle-logbook', status: 'approved', url: 'https://example.com/logbook.pdf' },
  { type: 'road-license', status: 'approved', url: 'https://example.com/license.pdf' },
  { type: 'inspection-report', status: 'approved', url: 'https://example.com/inspection.pdf' }
];

test('owner bidding policy requires approved owner and truck documents', () => {
  const owner = { _id: 'owner-1', role: 'owner', isVerified: true, documents: ownerDocs };
  const truck = {
    _id: 'truck-1',
    owner: 'owner-1',
    isVerified: true,
    isAvailable: true,
    documents: truckDocs
  };

  expect(() => assertOwnerCanBid(owner, truck)).not.toThrow();

  const unverifiedOwner = { ...owner, isVerified: false };
  expect(() => assertOwnerCanBid(unverifiedOwner, truck)).toThrow('Complete owner verification before bidding');

  const incompleteTruck = { ...truck, documents: truckDocs.filter((doc) => doc.type !== 'vehicle-logbook') };
  expect(() => assertOwnerCanBid(owner, incompleteTruck)).toThrow('Complete truck verification before bidding');
});

test('document readiness reports missing approved document types', () => {
  expect(missingApprovedDocuments([{ type: 'insurance', status: 'pending' }], ['insurance', 'logbook'])).toEqual([
    'insurance',
    'logbook'
  ]);
});

test('approved verification status without document evidence is still incomplete', () => {
  expect(missingApprovedDocuments([{ type: 'insurance', status: 'approved' }], ['insurance'])).toEqual(['insurance']);
});

test('delivery proof policy allows legacy trip closeout but requires receiver-grade proof for release', () => {
  const booking = {
    documents: [{ type: 'pod', status: 'pending', url: 'https://example.com/pod.pdf' }]
  };

  expect(() => assertDeliveryProofForDelivery(booking)).not.toThrow();
  expect(() => assertDeliveryProofForPaymentRelease(booking)).toThrow(
    'Receiver-grade delivery proof is required before releasing payment'
  );

  booking.documents[0].status = 'approved';
  expect(() => assertDeliveryProofForPaymentRelease(booking)).toThrow(
    'Receiver-grade delivery proof is required before releasing payment'
  );

  booking.deliveryProof = {
    proof: 'proof-1',
    recordHash: 'a'.repeat(64),
    verificationMethod: 'sms_otp',
    verifiedAt: new Date(),
    photoCount: 2
  };
  expect(() => assertReceiverGradeDeliveryProof(booking)).not.toThrow();
  expect(() => assertDeliveryProofForPaymentRelease(booking)).not.toThrow();
});

test('delivery proof policy accepts generated POD records for trip closeout', () => {
  const booking = {
    documents: [{ type: 'pod', status: 'approved', generatedAt: new Date() }]
  };

  expect(() => assertDeliveryProofForDelivery(booking)).not.toThrow();
});

test('delivery geofence allows nearby driver positions and rejects distant ones', () => {
  const destinationCoordinates = { lat: -1.2921, lng: 36.8219 };
  const booking = {
    destinationCoordinates,
    deliveryGeofenceMeters: 150,
    tracking: [{ lat: -1.2924, lng: 36.8217 }]
  };

  expect(geoDistanceMeters(destinationCoordinates, booking.tracking[0])).toBeLessThan(60);
  expect(() => assertDeliveryGeofence(booking)).not.toThrow();
  expect(() => assertDeliveryGeofence(booking, { lat: -1.35, lng: 36.9 })).toThrow(
    'Driver must be within delivery geofence before delivery confirmation'
  );
});

test('delivery geofence is skipped when destination coordinates are absent', () => {
  expect(() => assertDeliveryGeofence({ tracking: [] })).not.toThrow();
});
