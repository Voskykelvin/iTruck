const { suggestPrice, buildEstimate, autoAssign } = require('../services/matching');
const Booking = require('../models/Booking');

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
  expect(estimate.lineItems.map(item => item.key)).toEqual(expect.arrayContaining(['crossBorderFee', 'customsBroker']));
});

test('autoAssign returns a queued assignment record', async () => {
  await expect(autoAssign('ITK-2044')).resolves.toEqual({ bookingId: 'ITK-2044', status: 'queued' });
});

test('booking status machine rejects skipped transitions', () => {
  expect(() => Booking.assertStatusTransition('pending', 'delivered')).toThrow('Invalid booking status transition');
  expect(() => Booking.assertStatusTransition('bidding', 'confirmed')).not.toThrow();
});
