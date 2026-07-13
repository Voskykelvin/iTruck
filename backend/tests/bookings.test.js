const { suggestPrice, buildEstimate, scoreTruck, sequenceDispatchStops } = require('../services/matching');
const Booking = require('../models/Booking');
const mongoose = require('mongoose');

test('suggestPrice uses vehicle-specific rates', () => {
  expect(suggestPrice(100, 'Pickup')).toBe(110);
  expect(suggestPrice(100, 'Trailer')).toBe(350);
});

test('buildEstimate exposes fees, documents, and risk for cross-border moves', () => {
  const estimate = buildEstimate({
    pickup: 'Nairobi',
    destination: 'Kampala',
    distance: 1000,
    vehicleType: 'Trailer',
    border: 'Cross-border',
    cargo: 'Retail stock',
    weight: '18 tonnes',
    optionalServices: ['customsBroker', 'returnLoadFlexible']
  });

  expect(estimate.total).toBeGreaterThan(estimate.basePrice);
  expect(estimate.recommendedMode).toBe('open-bids');
  expect(estimate.requiredDocuments).toContain('Customs declaration');
  expect(estimate.lineItems.map((item) => item.key)).toEqual(
    expect.arrayContaining(['crossBorderFee', 'customsBroker'])
  );
});

test('buildEstimate supports LTL shared-capacity pricing and route keys', () => {
  const estimate = buildEstimate({
    pickup: 'Nairobi',
    destination: 'Kisumu',
    distance: 350,
    vehicleType: 'Lorry',
    loadMode: 'ltl',
    cargoWeightTonnes: 2
  });

  expect(estimate.loadMode).toBe('ltl');
  expect(estimate.basePrice).toBeLessThan(estimate.fullTruckBasePrice);
  expect(estimate.capacityUtilization).toBeCloseTo(0.167, 3);
  expect(estimate.consolidationEligible).toBe(true);
  expect(estimate.recommendedMode).toBe('route-cluster');
  expect(estimate.routeKey).toBe('nairobi:kisumu:lorry');
  expect(estimate.lineItems.map((item) => item.key)).toContain('ltlHandlingFee');
});

test('LTL stop sequencing never schedules delivery before pickup', () => {
  const stops = sequenceDispatchStops([
    {
      booking: 'booking-1',
      pickup: 'Nairobi',
      destination: 'Kisumu',
      pickupCoordinates: { lat: -1.2864, lng: 36.8172 },
      destinationCoordinates: { lat: -0.0917, lng: 34.768 }
    },
    {
      booking: 'booking-2',
      pickup: 'Nakuru',
      destination: 'Eldoret',
      pickupCoordinates: { lat: -0.3031, lng: 36.08 },
      destinationCoordinates: { lat: 0.5143, lng: 35.2698 }
    }
  ]);

  ['booking-1', 'booking-2'].forEach((booking) => {
    const pickup = stops.find((stop) => stop.booking === booking && stop.type === 'pickup');
    const delivery = stops.find((stop) => stop.booking === booking && stop.type === 'delivery');
    expect(pickup.sequence).toBeLessThan(delivery.sequence);
  });
});

test('matching marks and boosts a requested verified truck', () => {
  const truckId = new mongoose.Types.ObjectId();
  const baseTruck = {
    _id: truckId,
    type: 'Lorry',
    capacityTonnes: 12,
    reservedCapacityTonnes: 0,
    routes: ['Nairobi-Kampala'],
    ratingAverage: 4,
    completedTrips: 20
  };
  const booking = {
    requestedTruck: truckId,
    vehicleType: 'Lorry',
    pickup: 'Nairobi',
    destination: 'Kampala',
    cargoWeightTonnes: 4
  };

  const preferred = scoreTruck(baseTruck, booking);
  const ordinary = scoreTruck({ ...baseTruck, _id: new mongoose.Types.ObjectId() }, booking);

  expect(preferred.preferred).toBe(true);
  expect(preferred.reasons).toContain('Shipper-preferred vehicle');
  expect(preferred.score).toBeGreaterThan(ordinary.score);
});

test('booking status machine rejects skipped transitions', () => {
  expect(() => Booking.assertStatusTransition('pending', 'delivered')).toThrow('Invalid booking status transition');
  expect(() => Booking.assertStatusTransition('bidding', 'confirmed')).not.toThrow();
  expect(() => Booking.assertStatusTransition('in_transit', 'delivery_pending')).not.toThrow();
  expect(() => Booking.assertStatusTransition('delivery_pending', 'delivered')).not.toThrow();
  expect(() => Booking.assertStatusTransition('delivery_pending', 'in_transit')).toThrow(
    'Invalid booking status transition'
  );
});
