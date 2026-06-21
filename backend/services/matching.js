const AppError = require('../utils/AppError');
const Booking = require('../models/Booking');
const DispatchPlan = require('../models/DispatchPlan');
const Truck = require('../models/Truck');
const User = require('../models/User');
const {
  geoDistanceMeters,
  missingApprovedDocuments,
  OWNER_REQUIRED_DOCUMENTS,
  TRUCK_REQUIRED_DOCUMENTS
} = require('./operationsPolicy');
const maps = require('./maps');

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
    recommendedMode:
      ltl.loadMode === 'ltl' ? 'route-cluster' : distance > 900 || crossBorder ? 'open-bids' : 'instant-match',
    routeRisk: risk,
    requiredDocuments: requiredDocuments({ crossBorder, requirements, cargoValue }),
    warnings: missingFields.map((field) => `${field} missing may change carrier pricing`),
    quoteProtection:
      'Estimate includes visible platform, insurance, escrow, and selected service fees before carrier bids.'
  };
}

function ownerReady(owner) {
  return (
    owner?.isVerified === true && missingApprovedDocuments(owner.documents || [], OWNER_REQUIRED_DOCUMENTS).length === 0
  );
}

function truckReady(truck) {
  return (
    truck?.isVerified === true &&
    truck?.isAvailable !== false &&
    !truck?.archivedAt &&
    missingApprovedDocuments(truck.documents || [], TRUCK_REQUIRED_DOCUMENTS).length === 0 &&
    ownerReady(truck.owner)
  );
}

function laneFit(truck, booking) {
  const routeText = (truck.routes || []).map((route) => normalizeLaneName(route)).join(' ');
  const pickup = normalizeLaneName(booking.pickup);
  const destination = normalizeLaneName(booking.destination);
  if (routeText.includes(`${pickup}-${destination}`) || routeText.includes(`${pickup}-to-${destination}`)) return 1;
  if (routeText.includes(pickup) && routeText.includes(destination)) return 0.85;
  if (routeText.includes(pickup) || routeText.includes(destination)) return 0.45;
  return 0;
}

function scoreTruck(truck, booking, remainingCapacity) {
  const requiredCapacity =
    booking.loadMode === 'ltl' ? Number(booking.cargoWeightTonnes || 0) : Number(booking.reservedCapacityTonnes || 0);
  const totalCapacity = Number(truck.capacityTonnes ?? vehicleCapacity(truck.type));
  const globallyRemaining = Math.max(0, totalCapacity - Number(truck.reservedCapacityTonnes || 0));
  const capacity = Number(
    remainingCapacity === undefined ? globallyRemaining : Math.min(remainingCapacity, globallyRemaining)
  );
  const capacityFit = requiredCapacity > 0 ? Math.min(1, capacity / requiredCapacity) : 1;
  const rating = Number(truck.ratingAverage || 0) / 5;
  const experience = Math.min(1, Number(truck.completedTrips || 0) / 100);
  const lane = laneFit(truck, booking);
  const distance =
    booking.pickupCoordinates && truck.location ? geoDistanceMeters(truck.location, booking.pickupCoordinates) : null;
  const proximity = distance === null ? 0.35 : Math.max(0, 1 - distance / 500_000);
  const score = 25 + 20 * capacityFit + 20 * lane + 15 * rating + 10 * experience + 10 * proximity;
  return {
    score: Number(Math.min(100, score).toFixed(2)),
    capacityFit: Number(capacityFit.toFixed(3)),
    laneFit: Number(lane.toFixed(3)),
    pickupDistanceMeters: distance,
    remainingCapacityTonnes: capacity,
    reasons: [
      'Verified carrier and vehicle',
      lane >= 0.85 ? 'Strong route-history fit' : lane > 0 ? 'Partial route-history fit' : 'No recorded lane history',
      `${capacity.toFixed(1)} tonnes available`,
      distance === null ? 'Pickup proximity unavailable' : `${Math.round(distance / 1000)} km from pickup`
    ]
  };
}

async function rankTrucksForBooking(booking, options = {}) {
  const minimumCapacity = booking.loadMode === 'ltl' ? Number(booking.cargoWeightTonnes || 0) : 0;
  const query = {
    type: booking.vehicleType,
    isVerified: true,
    isAvailable: true,
    archivedAt: null,
    capacityTonnes: { $gte: minimumCapacity || 0.1 }
  };
  const trucks = await Truck.find(query)
    .populate('owner', 'firstName lastName company isVerified documents rating ratingCount')
    .limit(Number(options.limit || 50));
  const plans =
    booking.loadMode === 'ltl'
      ? await DispatchPlan.find({
          truck: { $in: trucks.map((truck) => truck._id) },
          routeKey: booking.routeKey,
          status: { $in: ['planned', 'active'] }
        }).select('truck remainingTonnes')
      : [];
  const remainingByTruck = new Map(plans.map((plan) => [String(plan.truck), Number(plan.remainingTonnes)]));

  return trucks
    .filter(truckReady)
    .map((truck) => ({
      truck,
      ...scoreTruck(truck, booking, remainingByTruck.get(String(truck._id)))
    }))
    .filter((match) => match.capacityFit >= 1)
    .sort((left, right) => right.score - left.score)
    .slice(0, Number(options.limit || 10));
}

function nearestStop(current, candidates) {
  return [...candidates].sort((left, right) => {
    const leftDistance = current && left.coordinates ? geoDistanceMeters(current, left.coordinates) : Infinity;
    const rightDistance = current && right.coordinates ? geoDistanceMeters(current, right.coordinates) : Infinity;
    return leftDistance - rightDistance;
  })[0];
}

function sequenceDispatchStops(assignments = []) {
  const pendingPickups = assignments.map((assignment) => ({
    booking: assignment.booking,
    type: 'pickup',
    label: assignment.pickup,
    coordinates: assignment.pickupCoordinates
  }));
  const pendingDeliveries = assignments.map((assignment) => ({
    booking: assignment.booking,
    type: 'delivery',
    label: assignment.destination,
    coordinates: assignment.destinationCoordinates
  }));
  const picked = new Set();
  const stops = [];
  let current = pendingPickups[0]?.coordinates;

  while (pendingPickups.length || pendingDeliveries.length) {
    const eligibleDeliveries = pendingDeliveries.filter((stop) => picked.has(String(stop.booking)));
    const candidates = [...pendingPickups, ...eligibleDeliveries];
    const next = nearestStop(current, candidates) || candidates[0];
    if (!next) break;
    stops.push({ ...next, sequence: stops.length + 1, status: 'pending' });
    current = next.coordinates || current;
    if (next.type === 'pickup') {
      picked.add(String(next.booking));
      pendingPickups.splice(pendingPickups.indexOf(next), 1);
    } else {
      pendingDeliveries.splice(pendingDeliveries.indexOf(next), 1);
    }
  }
  return stops;
}

async function routeDispatchPlan(plan) {
  const stops = plan.stops || [];
  if (stops.length < 2 || !stops[0].coordinates || !stops.at(-1).coordinates) return null;
  try {
    return await maps.computeRoute({
      origin: stops[0].coordinates,
      destinationCoordinates: stops.at(-1).coordinates,
      intermediates: stops.slice(1, -1).map((stop) => stop.coordinates),
      trafficAware: true
    });
  } catch (_err) {
    return null;
  }
}

async function reserveAssignment(booking, truck, options = {}) {
  if (!truck) throw new AppError('Assigned truck not found', 404);
  if (!truck.owner || typeof truck.owner !== 'object' || !truck.owner.documents) {
    const owner = await User.findById(truck.owner).select(
      'firstName lastName company isVerified documents rating ratingCount'
    );
    if (owner) truck.owner = owner;
  }
  if (!truckReady(truck)) throw new AppError('Assigned truck is no longer verified and available', 409);
  const capacity = Number(truck.capacityTonnes || vehicleCapacity(truck.type));
  const required =
    booking.loadMode === 'ltl' ? Number(booking.cargoWeightTonnes || 0) : Number(booking.cargoWeightTonnes || capacity);
  if (!Number.isFinite(required) || required <= 0 || required > capacity) {
    throw new AppError('Truck does not have enough capacity for this booking', 409);
  }

  const claimedTruck = await Truck.findOneAndUpdate(
    {
      _id: truck._id,
      isAvailable: true,
      $or: [
        { reservedCapacityTonnes: { $lte: Math.max(0, capacity - required) } },
        { reservedCapacityTonnes: { $exists: false } }
      ]
    },
    {
      $inc: { reservedCapacityTonnes: required }
    },
    { new: true }
  );
  if (!claimedTruck) throw new AppError('Truck capacity was reserved by another booking; retry matching', 409);

  let reserved;
  try {
    let plan =
      booking.loadMode === 'ltl'
        ? await DispatchPlan.findOne({
            truck: truck._id,
            routeKey: booking.routeKey,
            status: { $in: ['planned', 'active'] },
            remainingTonnes: { $gte: required }
          }).sort({ pickupDate: 1, createdAt: 1 })
        : null;

    if (!plan) {
      plan = await DispatchPlan.create({
        truck: truck._id,
        owner: truck.owner?._id || truck.owner,
        routeKey: booking.routeKey || routeKeyFor(booking),
        loadMode: booking.loadMode,
        capacityTonnes: capacity,
        reservedTonnes: 0,
        remainingTonnes: capacity,
        pickupDate: booking.pickupDate,
        assignments: [],
        stops: []
      });
    }

    reserved = await DispatchPlan.findOneAndUpdate(
      {
        _id: plan._id,
        remainingTonnes: { $gte: required },
        'assignments.booking': { $ne: booking._id }
      },
      {
        $inc: { reservedTonnes: required, remainingTonnes: -required },
        $push: {
          assignments: {
            booking: booking._id,
            cargoWeightTonnes: required,
            pickup: booking.pickup,
            destination: booking.destination,
            pickupCoordinates: booking.pickupCoordinates,
            destinationCoordinates: booking.destinationCoordinates,
            reservedAt: new Date()
          }
        }
      },
      { new: true, runValidators: true }
    );
    if (!reserved) throw new AppError('Dispatch plan capacity changed while assigning this booking', 409);

    reserved.stops = sequenceDispatchStops(reserved.assignments);
    reserved.assignments.forEach((assignment) => {
      const pickup = reserved.stops.find(
        (stop) => stop.type === 'pickup' && String(stop.booking) === String(assignment.booking)
      );
      const delivery = reserved.stops.find(
        (stop) => stop.type === 'delivery' && String(stop.booking) === String(assignment.booking)
      );
      assignment.pickupSequence = pickup?.sequence;
      assignment.deliverySequence = delivery?.sequence;
    });
    reserved.routePlan = await routeDispatchPlan(reserved);
    await reserved.save();
  } catch (err) {
    await Truck.updateOne(
      { _id: truck._id },
      { $inc: { reservedCapacityTonnes: -required }, $set: { isAvailable: true } }
    ).catch(() => {});
    throw err;
  }

  const assignment = reserved.assignments.find((item) => String(item.booking) === String(booking._id));
  booking.dispatchPlan = reserved._id;
  booking.dispatch = {
    loadSequence: reserved.assignments.length,
    pickupSequence: assignment?.pickupSequence,
    deliverySequence: assignment?.deliverySequence,
    reservedTonnes: required,
    assignedAt: new Date(),
    assignmentMethod: options.assignmentMethod || 'manual-bid',
    matchScore: options.matchScore
  };
  booking.reservedCapacityTonnes = required;

  const truckRemaining = capacity - Number(claimedTruck.reservedCapacityTonnes || 0);
  await Truck.updateOne(
    { _id: truck._id },
    { $set: { isAvailable: booking.loadMode === 'ltl' ? truckRemaining >= 0.1 : false } }
  );
  return reserved;
}

async function releaseAssignment(booking, outcome = 'delivered') {
  if (!booking?.dispatchPlan) return null;
  const plan = await DispatchPlan.findById(booking.dispatchPlan);
  if (!plan) return null;
  const assignment = (plan.assignments || []).find(
    (item) => String(item.booking?._id || item.booking) === String(booking._id)
  );
  if (!assignment || ['delivered', 'cancelled'].includes(assignment.status)) return null;

  const releasedTonnes = Number(assignment.cargoWeightTonnes || booking.dispatch?.reservedTonnes || 0);
  assignment.status = outcome === 'delivered' ? 'delivered' : 'cancelled';
  plan.reservedTonnes = Math.max(0, Number(plan.reservedTonnes || 0) - releasedTonnes);
  plan.remainingTonnes = Math.min(Number(plan.capacityTonnes || 0), Number(plan.remainingTonnes || 0) + releasedTonnes);
  (plan.stops || [])
    .filter((stop) => String(stop.booking?._id || stop.booking) === String(booking._id))
    .forEach((stop) => {
      stop.status = outcome === 'delivered' ? 'completed' : 'skipped';
    });
  if ((plan.assignments || []).every((item) => ['delivered', 'cancelled'].includes(item.status))) {
    plan.status = 'completed';
    plan.completedAt = new Date();
  }
  await plan.save();
  if (releasedTonnes > 0) {
    await Truck.updateOne(
      { _id: plan.truck },
      {
        $inc: { reservedCapacityTonnes: -releasedTonnes },
        $set: { isAvailable: true }
      }
    );
  }
  return plan;
}

async function autoAssign(bookingId, options = {}) {
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new AppError('Booking not found', 404);
  if (!['pending', 'bidding'].includes(booking.status) || booking.owner) {
    throw new AppError('Booking is not available for automatic assignment', 409);
  }

  const matches = await rankTrucksForBooking(booking, { limit: options.limit || 10 });
  if (!matches.length) throw new AppError('No verified truck currently satisfies this booking', 409);

  let selected;
  let plan;
  let lastCapacityError;
  for (const match of matches) {
    try {
      plan = await reserveAssignment(booking, match.truck, {
        assignmentMethod: 'auto-match',
        matchScore: match.score
      });
      selected = match;
      break;
    } catch (err) {
      if (err.status !== 409) throw err;
      lastCapacityError = err;
    }
  }
  if (!selected) throw lastCapacityError || new AppError('No truck capacity remains for this booking', 409);
  const ownerId = selected.truck.owner?._id || selected.truck.owner;
  const amount = Number(booking.estimate?.total || booking.budget || 0);
  booking.bids.push({
    owner: ownerId,
    truck: selected.truck._id,
    amount: amount > 0 ? amount : suggestPrice(booking.distance, booking.vehicleType),
    originalAmount: amount > 0 ? amount : suggestPrice(booking.distance, booking.vehicleType),
    message: 'Automatically assigned from verified-truck ranking.',
    status: 'accepted',
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    history: [{ action: 'accepted', actor: options.actor?._id || options.actor, amount, createdAt: new Date() }]
  });
  booking.owner = ownerId;
  booking.truck = selected.truck._id;
  if (booking.status === 'pending') booking.transitionTo('bidding');
  booking.transitionTo('confirmed');
  await booking.save();

  return { booking, truck: selected.truck, match: selected, dispatchPlan: plan };
}

module.exports = {
  autoAssign,
  buildEstimate,
  ltlPricing,
  normalizeLoadMode,
  rankTrucksForBooking,
  releaseAssignment,
  reserveAssignment,
  routeKeyFor,
  scoreTruck,
  sequenceDispatchStops,
  suggestPrice,
  vehicleCapacity
};
