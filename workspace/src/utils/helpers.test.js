import { describe, expect, it } from 'vitest';
import { money, normalizeBookingShipment, normalizeOpenLoad, paymentStatusLabel, timeFormat } from './helpers';

describe('display helpers', () => {
  it('formats monetary values consistently', () => {
    expect(money(1250, 'USD')).toMatch(/1,250/);
  });

  it('handles absent and invalid timestamps safely', () => {
    expect(timeFormat()).toBe('—');
    expect(timeFormat('not-a-date')).toBe('—');
  });

  it('formats valid timestamps', () => {
    expect(timeFormat('2026-07-14T10:00:00.000Z')).not.toBe('—');
  });

  it('normalizes booking values used by shipment details and payment summaries', () => {
    const normalized = normalizeBookingShipment({
      _id: 'ITK-2001',
      status: 'confirmed',
      pickup: 'Nairobi',
      destination: 'Kampala',
      cargo: 'Food',
      weight: '8',
      vehicleType: 'Lorry',
      requirements: 'Standard',
      paymentStatus: 'unpaid',
      eta: { estimatedArrivalAt: '2026-07-18T10:00:00.000Z' },
      bids: [{ _id: 'bid-1', status: 'accepted', amount: 1450 }]
    });

    expect(normalized).toMatchObject({
      weight: '8',
      vehicleType: 'Lorry',
      requirements: 'Standard',
      amount: 1450,
      price: 1450,
      paymentStatus: 'unpaid'
    });
    expect(normalized.eta).toEqual(expect.any(String));
    expect(normalized.paymentBreakdown).toMatchObject({
      carrierAmount: 1450,
      platformFee: 36.25,
      shipperTotal: 1486.25,
      carrierPayout: 1450
    });
    expect(() => normalizeBookingShipment(normalized)).not.toThrow();
  });

  it('normalizes open loads with the field names consumed by the load board', () => {
    expect(
      normalizeOpenLoad({
        _id: 'ITK-2002',
        pickup: 'Accra',
        destination: 'Kumasi',
        cargo: 'Cocoa',
        weight: '4',
        vehicleType: 'Lorry',
        border: 'Domestic',
        budget: 900
      })
    ).toMatchObject({
      origin: 'Accra',
      destination: 'Kumasi',
      weight: '4',
      vehicleType: 'Lorry',
      budget: 900,
      border: 'Domestic'
    });
  });

  it('uses truthful customer-facing payment labels', () => {
    expect(paymentStatusLabel('unpaid')).toBe('Payment pending');
    expect(paymentStatusLabel('escrowed')).toBe('Funded');
  });
});
