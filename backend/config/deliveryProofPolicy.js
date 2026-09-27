function normalizeDeliveryProofMode(value = process.env.DELIVERY_PROOF_MODE) {
  const normalized = String(value ?? 'simple').trim().toLowerCase();
  if (['strict', 'true', '1', 'enabled', 'on'].includes(normalized)) return 'strict';
  return 'simple';
}

function deliveryProofMode() {
  return normalizeDeliveryProofMode(process.env.DELIVERY_PROOF_MODE);
}

function strictDeliveryProof() {
  return deliveryProofMode() === 'strict';
}

function deliveryProofPolicy() {
  const strict = strictDeliveryProof();
  return {
    mode: strict ? 'strict' : 'simple',
    requires: {
      photos: true,
      otp: strict,
      signature: strict,
      gps: strict
    },
    autoComplete: !strict
  };
}

module.exports = {
  deliveryProofMode,
  deliveryProofPolicy,
  normalizeDeliveryProofMode,
  strictDeliveryProof
};
