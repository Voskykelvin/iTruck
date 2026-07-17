const DEFAULT_PLATFORM_FEE_RATE = 0.025;

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function platformFeeRate() {
  const configured = Number(process.env.PLATFORM_FEE_RATE);
  return Number.isFinite(configured) && configured >= 0 && configured <= 0.5 ? configured : DEFAULT_PLATFORM_FEE_RATE;
}

function paymentBreakdown(carrierAmount, options = {}) {
  const carrier = roundMoney(carrierAmount);
  if (!Number.isFinite(carrier) || carrier <= 0) {
    const error = new Error('Carrier amount must be greater than zero');
    error.status = 422;
    throw error;
  }

  const rate = platformFeeRate();
  const platformFee = roundMoney(carrier * rate);
  const providerFee = roundMoney(options.providerFee || 0);
  return {
    carrierAmount: carrier,
    platformFeeRate: rate,
    platformFee,
    providerFee,
    shipperTotal: roundMoney(carrier + platformFee + providerFee),
    carrierPayout: carrier,
    currency: String(options.currency || 'USD').toUpperCase(),
    calculatedAt: options.calculatedAt || new Date()
  };
}

function termsForBooking(booking = {}) {
  const stored = booking.paymentBreakdown;
  if (stored && Number(stored.shipperTotal) > 0 && Number(stored.carrierPayout) > 0) return stored;
  const acceptedBid = (booking.bids || []).find((bid) => bid.status === 'accepted');
  if (acceptedBid?.amount) return paymentBreakdown(acceptedBid.amount);
  const legacyAmount = Number(booking.paymentAmount || booking.budget || booking.estimate?.total);
  return {
    carrierAmount: legacyAmount,
    platformFeeRate: 0,
    platformFee: 0,
    providerFee: 0,
    shipperTotal: legacyAmount,
    carrierPayout: legacyAmount,
    currency: 'USD'
  };
}

module.exports = { DEFAULT_PLATFORM_FEE_RATE, paymentBreakdown, platformFeeRate, roundMoney, termsForBooking };
