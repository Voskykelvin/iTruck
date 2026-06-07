const vehicleRates = {
  Matatu: 0.8,
  Pickup: 1.1,
  Lorry: 1.8,
  'Large Truck': 2.6,
  Trailer: 3.5,
  Bus: 1.6,
  Specialised: 4
};

const vehicleCapacityTonnes = {
  Matatu: 0.8,
  Pickup: 1.2,
  Lorry: 12,
  'Large Truck': 20,
  Trailer: 28,
  Bus: 4,
  Specialised: 15
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

function normalizeLaneName(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function routeKeyFor(input = {}) {
  const pickup = normalizeLaneName(input.pickup);
  const destination = normalizeLaneName(input.destination);
  const vehicleType = normalizeLaneName(input.vehicleType || 'Lorry');
  return [pickup, destination, vehicleType].filter(Boolean).join(':');
}

function normalizeLoadMode(value) {
  return value === 'ltl' || value === 'partial' || value === 'shared' ? 'ltl' : 'full-truck';
}

function vehicleCapacity(vehicleType = 'Lorry') {
  return vehicleCapacityTonnes[vehicleType] || vehicleCapacityTonnes.Lorry;
}

function ltlPricing(input = {}, fullTruckBasePrice = 0) {
  const loadMode = normalizeLoadMode(input.loadMode);
  const estimatedTruckCapacityTonnes = Number(input.reservedCapacityTonnes || vehicleCapacity(input.vehicleType));
  const cargoWeightTonnes = Number(input.cargoWeightTonnes || 0);
  if (loadMode !== 'ltl' || !Number.isFinite(cargoWeightTonnes) || cargoWeightTonnes <= 0) {
    return {
      loadMode,
      cargoWeightTonnes: Number.isFinite(cargoWeightTonnes) && cargoWeightTonnes > 0 ? cargoWeightTonnes : undefined,
      estimatedTruckCapacityTonnes,
      capacityUtilization: undefined,
      basePrice: fullTruckBasePrice,
      lineItems: [],
      consolidationEligible: false
    };
  }

  const safeCapacity =
    Number.isFinite(estimatedTruckCapacityTonnes) && estimatedTruckCapacityTonnes > 0
      ? estimatedTruckCapacityTonnes
      : vehicleCapacity(input.vehicleType);
  const capacityUtilization = Math.min(1, cargoWeightTonnes / safeCapacity);
  const billableShare = Math.min(1, Math.max(0.18, capacityUtilization));
  const sharedBasePrice = Math.max(25, Math.round(fullTruckBasePrice * billableShare));
  const handlingFee = Math.max(15, Math.round(sharedBasePrice * 0.12));

  return {
    loadMode,
    cargoWeightTonnes,
    estimatedTruckCapacityTonnes: safeCapacity,
    capacityUtilization: Number(capacityUtilization.toFixed(3)),
    billableCapacityShare: Number(billableShare.toFixed(3)),
    basePrice: sharedBasePrice,
    lineItems: [{ key: 'ltlHandlingFee', label: 'Shared-load coordination', amount: handlingFee }],
    consolidationEligible: capacityUtilization < 0.85
  };
}

function selectedServices(input = {}) {
  const source = Array.isArray(input)
    ? input
    : Object.entries(input || {})
        .filter(([, value]) => value === true || value === 'true' || value === 'on')
        .map(([key]) => key);

  return [...new Set(source)].filter((key) => optionalServiceRules[key]);
}

function serviceLineItems(basePrice, services) {
  return services.map((key) => {
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
  const fullTruckBasePrice = suggestPrice(distance, vehicleType);
  const ltl = ltlPricing({ ...input, vehicleType }, fullTruckBasePrice);
  const basePrice = ltl.basePrice;
  const services = selectedServices(input.optionalServices || input.accessorials);
  const serviceItems = serviceLineItems(basePrice, services);
  const crossBorderFee = crossBorder ? Math.round(basePrice * 0.12) : 0;
  const insurance = Math.max(25, Math.round(basePrice * 0.035));
  const escrowFee = Math.round(basePrice * 0.025);
  const cargoValue = Number(input.cargoValue || 0);
  const missingFields = ['pickup', 'destination', 'cargo', 'weight'].filter((key) => !input[key]);
  const lineItems = [
    {
      key: 'basePrice',
      label: ltl.loadMode === 'ltl' ? `${vehicleType} shared-capacity estimate` : `${vehicleType} lane estimate`,
      amount: basePrice
    },
    ...(crossBorderFee ? [{ key: 'crossBorderFee', label: 'Cross-border handling', amount: crossBorderFee }] : []),
    { key: 'insurance', label: 'Standard cargo protection', amount: insurance },
    { key: 'escrowFee', label: 'Escrow and payment handling', amount: escrowFee },
    ...ltl.lineItems,
    ...serviceItems
  ];
  const total = Math.max(
    0,
    lineItems.reduce((sum, item) => sum + item.amount, 0)
  );
  const risk = routeRisk({ distance, crossBorder, requirements, missingFields });

  return {
    distance,
    vehicleType,
    loadMode: ltl.loadMode,
    cargoWeightTonnes: ltl.cargoWeightTonnes,
    estimatedTruckCapacityTonnes: ltl.estimatedTruckCapacityTonnes,
    capacityUtilization: ltl.capacityUtilization,
    billableCapacityShare: ltl.billableCapacityShare,
    consolidationEligible: ltl.consolidationEligible,
    routeKey: routeKeyFor({ ...input, vehicleType }),
    currency: input.currency || 'USD',
    basePrice,
    fullTruckBasePrice,
    crossBorderFee,
    insurance,
    escrowFee,
    optionalServices: services,
    lineItems,
    total,
    confidence: missingFields.length ? 'medium' : risk === 'high' ? 'medium' : 'high',
    recommendedMode: ltl.loadMode === 'ltl' ? 'route-cluster' : distance > 900 || crossBorder ? 'open-bids' : 'instant-match',
    routeRisk: risk,
    requiredDocuments: requiredDocuments({ crossBorder, requirements, cargoValue }),
    warnings: missingFields.map((field) => `${field} missing may change carrier pricing`),
    quoteProtection:
      'Estimate includes visible platform, insurance, escrow, and selected service fees before carrier bids.'
  };
}

async function autoAssign(bookingId) {
  return { bookingId, status: 'queued' };
}

module.exports = {
  autoAssign,
  buildEstimate,
  ltlPricing,
  normalizeLoadMode,
  routeKeyFor,
  suggestPrice,
  vehicleCapacity
};
