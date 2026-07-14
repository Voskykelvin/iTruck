function deliveryProofMode() {
  return String(process.env.DELIVERY_PROOF_MODE || 'simple')
    .trim()
    .toLowerCase() === 'strict'
    ? 'strict'
    : 'simple';
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

module.exports = { deliveryProofMode, deliveryProofPolicy, strictDeliveryProof };
