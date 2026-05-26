const vehicleRates = {
  Matatu: 0.8,
  Pickup: 1.1,
  Lorry: 1.8,
  'Large Truck': 2.6,
  Trailer: 3.5,
  Bus: 1.6,
  Specialised: 4
};

const optionalServiceRules = {
  loadingCrew: { label: 'Loading crew', rate: 0.08, minimum: 35 },
  customsBroker: { label: 'Customs broker coordination', rate: 0.1, minimum: 60 },
  temperatureControl: { label: 'Temperature-control handling', rate: 0.18, minimum: 80 },
  highValueCover: { label: 'High-value cargo cover', rate: 0.045, minimum: 55 },
  returnLoadFlexible: { label: 'Return-load flexibility credit', rate: -0.05, minimum: -180 }
};

function suggestPrice(distance = 100, vehicleType = 'Lorry') {
  return Math.round(distance * (vehicleRates[vehicleType] || vehicleRates.Lorry));
}

function selectedServices(input = {}) {
  const source = Array.isArray(input)
    ? input
    : Object.entries(input || {}).filter(([, value]) => value === true || value === 'true' || value === 'on').map(([key]) => key);

  return [...new Set(source)].filter(key => optionalServiceRules[key]);
}

function serviceLineItems(basePrice, services) {
  return services.map(key => {
    const rule = optionalServiceRules[key];
    const raw = Math.round(basePrice * rule.rate);
    const amount = rule.rate < 0 ? Math.max(rule.minimum, raw) : Math.max(rule.minimum, raw);
    return { key, label: rule.label, amount };
  });
}

function requiredDocuments({ crossBorder, requirements, cargoValue }) {
  const documents = ['Waybill', 'Cargo photos', 'Receiver confirmation'];
  if (crossBorder) documents.push('Commercial invoice', 'Packing list', 'Customs declaration');
  if (requirements === 'Hazardous') documents.push('Material safety data sheet');
  if (Number(cargoValue || 0) >= 10000) documents.push('Cargo value declaration');
  return documents;
}

function routeRisk({ distance, crossBorder, requirements, missingFields }) {
  let score = 18;
  if (distance > 900) score += 18;
  if (crossBorder) score += 22;
  if (requirements && requirements !== 'Standard') score += 12;
  score += missingFields.length * 8;

  if (score >= 58) return 'high';
  if (score >= 34) return 'medium';
  return 'low';
}

function buildEstimate(input = {}) {
  const distance = Number(input.distance || 420);
  const vehicleType = input.vehicleType || 'Lorry';
  const requirements = input.requirements || input.cargoRequirement || 'Standard';
  const crossBorder = input.crossBorder === true || input.crossBorder === 'true' || input.border === 'Cross-border';
  const basePrice = suggestPrice(distance, vehicleType);
  const services = selectedServices(input.optionalServices || input.accessorials);
  const serviceItems = serviceLineItems(basePrice, services);
  const crossBorderFee = crossBorder ? Math.round(basePrice * 0.12) : 0;
  const insurance = Math.max(25, Math.round(basePrice * 0.035));
  const escrowFee = Math.round(basePrice * 0.025);
  const cargoValue = Number(input.cargoValue || 0);
  const missingFields = ['pickup', 'destination', 'cargo', 'weight'].filter(key => !input[key]);
  const lineItems = [
    { key: 'basePrice', label: `${vehicleType} lane estimate`, amount: basePrice },
    ...(crossBorderFee ? [{ key: 'crossBorderFee', label: 'Cross-border handling', amount: crossBorderFee }] : []),
    { key: 'insurance', label: 'Standard cargo protection', amount: insurance },
    { key: 'escrowFee', label: 'Escrow and payment handling', amount: escrowFee },
    ...serviceItems
  ];
  const total = Math.max(0, lineItems.reduce((sum, item) => sum + item.amount, 0));
  const risk = routeRisk({ distance, crossBorder, requirements, missingFields });

  return {
    distance,
    vehicleType,
    currency: input.currency || 'USD',
    basePrice,
    crossBorderFee,
    insurance,
    escrowFee,
    optionalServices: services,
    lineItems,
    total,
    confidence: missingFields.length ? 'medium' : risk === 'high' ? 'medium' : 'high',
    recommendedMode: distance > 900 || crossBorder ? 'open-bids' : 'instant-match',
    routeRisk: risk,
    requiredDocuments: requiredDocuments({ crossBorder, requirements, cargoValue }),
    warnings: missingFields.map(field => `${field} missing may change carrier pricing`),
    quoteProtection: 'Estimate includes visible platform, insurance, escrow, and selected service fees before carrier bids.'
  };
}

async function autoAssign(bookingId) {
  return { bookingId, status: 'queued' };
}

module.exports = { suggestPrice, buildEstimate, autoAssign };
