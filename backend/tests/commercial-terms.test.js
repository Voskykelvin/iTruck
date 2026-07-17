const { paymentBreakdown, termsForBooking } = require('../services/commercialTerms');

test('payment breakdown adds the iTruck fee without reducing carrier payout', () => {
  expect(paymentBreakdown(1450, { calculatedAt: '2026-07-17T00:00:00.000Z' })).toEqual({
    carrierAmount: 1450,
    platformFeeRate: 0.025,
    platformFee: 36.25,
    providerFee: 0,
    shipperTotal: 1486.25,
    carrierPayout: 1450,
    currency: 'KES',
    calculatedAt: '2026-07-17T00:00:00.000Z'
  });
});

test('stored commercial terms are authoritative for escrow and release', () => {
  const stored = paymentBreakdown(900);
  expect(termsForBooking({ paymentAmount: 1, paymentBreakdown: stored })).toBe(stored);
});

test('legacy funded bookings do not invent a fee during release', () => {
  expect(termsForBooking({ paymentAmount: 1260 })).toMatchObject({
    carrierAmount: 1260,
    platformFee: 0,
    shipperTotal: 1260,
    carrierPayout: 1260
  });
});
