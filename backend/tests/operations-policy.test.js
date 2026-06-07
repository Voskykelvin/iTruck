const {
  assertDeliveryProofForDelivery,
  assertDeliveryProofForPaymentRelease,
  assertDeliveryGeofence,
  assertOwnerCanBid,
  geoDistanceMeters,
  missingApprovedDocuments
} = require('../services/operationsPolicy');

const ownerDocs = [
  { type: 'owner-kyc', status: 'approved' },
  { type: 'driver-id', status: 'approved' },
  { type: 'business-registration', status: 'approved' },
  { type: 'insurance', status: 'approved' }
];

const truckDocs = [
  { type: 'vehicle-photos', status: 'approved' },
  { type: 'insurance', status: 'approved' },
  { type: 'vehicle-logbook', status: 'approved' },
  { type: 'road-license', status: 'approved' },
  { type: 'inspection-report', status: 'approved' }
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

test('delivery proof policy allows pending proof for delivery but approved proof for release', () => {
  const booking = {
    documents: [{ type: 'pod', status: 'pending', url: 'https://example.com/pod.pdf' }]
  };

  expect(() => assertDeliveryProofForDelivery(booking)).not.toThrow();
  expect(() => assertDeliveryProofForPaymentRelease(booking)).toThrow(
    'Approve proof of delivery or receiver confirmation before releasing payment'
  );

  booking.documents[0].status = 'approved';
  expect(() => assertDeliveryProofForPaymentRelease(booking)).not.toThrow();
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
