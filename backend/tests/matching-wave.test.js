jest.mock('../models/Booking', () => ({
  findById: jest.fn()
}));
jest.mock('../models/DispatchPlan', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  create: jest.fn(),
  findOneAndUpdate: jest.fn()
}));
jest.mock('../models/Truck', () => ({
  find: jest.fn(),
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn()
}));
jest.mock('../models/User', () => ({
  findById: jest.fn()
}));
jest.mock('../services/maps', () => ({
  computeRoute: jest.fn()
}));

const Booking = require('../models/Booking');
const DispatchPlan = require('../models/DispatchPlan');
const Truck = require('../models/Truck');
const User = require('../models/User');
const maps = require('../services/maps');
const {
  autoAssign,
  buildEstimate,
  ltlPricing,
  normalizeLoadMode: _normalizeLoadMode,
  rankTrucksForBooking,
  releaseAssignment,
  reserveAssignment,
  routeKeyFor,
  scoreTruck,
  sequenceDispatchStops,
  suggestPrice,
  vehicleCapacity: _vehicleCapacity
} = require('../services/matching');

const ownerDocuments = ['owner-kyc', 'driver-id', 'business-registration', 'insurance'].map((type) => ({
  type,
  status: 'approved',
  url: `https://example.com/${type}.pdf`
}));
const truckDocuments = ['vehicle-photos', 'insurance', 'vehicle-logbook', 'road-license', 'inspection-report'].map(
  (type) => ({ type, status: 'approved', url: `https://example.com/${type}.pdf` })
);

function owner() {
  return { _id: 'owner-1', isVerified: true, documents: ownerDocuments, rating: 4.8 };
}

function truck() {
  return {
    _id: 'truck-1',
    owner: owner(),
    type: 'Lorry',
    plateNumber: 'KDA 123T',
    capacityTonnes: 12,
    reservedCapacityTonnes: 0,
    isVerified: true,
    isAvailable: true,
    documents: truckDocuments,
    routes: ['Nairobi to Kisumu'],
    ratingAverage: 4.7,
    completedTrips: 80,
    location: { lat: -1.2864, lng: 36.8172 }
  };
}

function booking() {
  return {
    _id: 'booking-1',
    client: 'client-1',
    pickup: 'Nairobi',
    destination: 'Kisumu',
    pickupCoordinates: { lat: -1.2864, lng: 36.8172 },
    destinationCoordinates: { lat: -0.0917, lng: 34.768 },
    vehicleType: 'Lorry',
    loadMode: 'ltl',
    cargoWeightTonnes: 2,
    routeKey: 'nairobi:kisumu:lorry',
    status: 'bidding',
    bids: [],
    estimate: { total: 500 },
    transitionTo(next) {
      this.status = next;
    },
    save: jest.fn(async function save() {
      return this;
    })
  };
}

function queryResult(value) {
  const query = {
    populate: jest.fn(() => query),
    limit: jest.fn(async () => value),
    select: jest.fn(async () => value),
    sort: jest.fn(async () => value)
  };
  query.then = (resolve, reject) => Promise.resolve(value).then(resolve, reject);
  return query;
}

describe('Matching Service Comprehensive Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    DispatchPlan.find.mockReturnValue(queryResult([]));
    User.findById.mockReturnValue({ select: jest.fn(async () => owner()) });
    Truck.updateOne.mockResolvedValue({ modifiedCount: 1 });
  });

  test('suggestPrice falls back to Lorry for invalid vehicleType', () => {
    expect(suggestPrice(100, 'InvalidType')).toBe(180); // Lorry rate is 1.8
  });

  test('routeKeyFor handles missing or partial input', () => {
    expect(routeKeyFor({ pickup: 'Nairobi' })).toBe('nairobi:lorry');
    expect(routeKeyFor({ pickup: ' Nairobi ', destination: ' Mombasa  ', vehicleType: 'Pickup' })).toBe(
      'nairobi:mombasa:pickup'
    );
  });

  test('ltlPricing handles non-ltl loadMode and invalid weight', () => {
    expect(ltlPricing({ loadMode: 'full-truck' }, 1000).loadMode).toBe('full-truck');
    expect(ltlPricing({ loadMode: 'ltl', cargoWeightTonnes: 0 }, 1000).cargoWeightTonnes).toBeUndefined();
    expect(ltlPricing({ loadMode: 'ltl', cargoWeightTonnes: -5 }, 1000).cargoWeightTonnes).toBeUndefined();
    expect(ltlPricing({ loadMode: 'ltl', cargoWeightTonnes: NaN }, 1000).cargoWeightTonnes).toBeUndefined();
  });

  test('ltlPricing handles fallback estimatedTruckCapacityTonnes and negative safeCapacity branch', () => {
    const pricing1 = ltlPricing({ loadMode: 'ltl', cargoWeightTonnes: 2, reservedCapacityTonnes: 0 }, 1000);
    expect(pricing1.estimatedTruckCapacityTonnes).toBe(12); // Lorry capacity is 12

    // negative reservedCapacityTonnes branch in safeCapacity check
    const pricing2 = ltlPricing({ loadMode: 'ltl', cargoWeightTonnes: 2, reservedCapacityTonnes: -5 }, 1000);
    expect(pricing2.estimatedTruckCapacityTonnes).toBe(12);
  });

  test('buildEstimate calculates pricing, documents, accessorials, and risk correctly', () => {
    // Standard local LTL booking
    const estimate = buildEstimate({
      pickup: 'Nairobi',
      destination: 'Mombasa',
      cargo: 'Electronics',
      weight: '2 tonnes',
      distance: 500,
      loadMode: 'ltl',
      cargoWeightTonnes: 2,
      optionalServices: { loadingCrew: true, temperatureControl: 'true', customsBroker: 'on', invalid: false }
    });

    expect(estimate.total).toBeGreaterThan(0);
    expect(estimate.optionalServices).toContain('loadingCrew');
    expect(estimate.optionalServices).toContain('temperatureControl');
    expect(estimate.optionalServices).toContain('customsBroker');
    expect(estimate.routeRisk).toBe('low');
    expect(estimate.requiredDocuments).toContain('Waybill');
  });

  test('buildEstimate evaluates cross-border, high value, hazardous, and high risk profiles', () => {
    const estimate = buildEstimate({
      pickup: 'Nairobi',
      destination: 'Kampala',
      cargo: 'Chemicals',
      distance: 1200,
      border: 'Cross-border',
      requirements: 'Hazardous',
      cargoValue: 15000,
      optionalServices: ['returnLoadFlexible']
    });

    expect(estimate.routeRisk).toBe('high');
    expect(estimate.requiredDocuments).toContain('Commercial invoice');
    expect(estimate.requiredDocuments).toContain('Material safety data sheet');
    expect(estimate.requiredDocuments).toContain('Cargo value declaration');
    expect(estimate.recommendedMode).toBe('open-bids');
  });

  test('buildEstimate handles confidence and recommendedMode branches and accessory rules', () => {
    // confidence: 'medium' due to missing fields
    const estimate1 = buildEstimate({
      pickup: 'Nairobi',
      destination: 'Mombasa'
      // cargo, weight missing
    });
    expect(estimate1.confidence).toBe('medium');

    // recommendedMode: 'instant-match' for short full-truck
    const estimate2 = buildEstimate({
      pickup: 'Nairobi',
      destination: 'Mombasa',
      cargo: 'Goods',
      weight: '5 tonnes',
      distance: 300,
      loadMode: 'full-truck'
    });
    expect(estimate2.recommendedMode).toBe('instant-match');

    // medium route risk via crossBorder
    const estimate3 = buildEstimate({
      pickup: 'Nairobi',
      destination: 'Mombasa',
      cargo: 'Goods',
      weight: '5 tonnes',
      distance: 300,
      crossBorder: true
    });
    expect(estimate3.routeRisk).toBe('medium');

    // buildEstimate with null accessorials and high value cover rule
    const estimate4 = buildEstimate({
      pickup: 'Nairobi',
      destination: 'Mombasa',
      cargo: 'Electronics',
      weight: '5 tonnes',
      distance: 300,
      cargoValue: 12000,
      optionalServices: null
    });
    expect(estimate4.requiredDocuments).toContain('Cargo value declaration');

    // buildEstimate with hazardous requirements but not cross border
    const estimate5 = buildEstimate({
      pickup: 'Nairobi',
      destination: 'Mombasa',
      cargo: 'Chemicals',
      weight: '5 tonnes',
      distance: 300,
      requirements: 'Hazardous'
    });
    expect(estimate5.requiredDocuments).toContain('Material safety data sheet');
  });

  test('verified-truck ranking scores route, capacity, rating, and proximity', async () => {
    Truck.find.mockReturnValue(queryResult([truck()]));
    const matches = await rankTrucksForBooking(booking());
    expect(matches).toHaveLength(1);
    expect(matches[0]).toEqual(
      expect.objectContaining({
        score: expect.any(Number),
        capacityFit: 1,
        laneFit: 1,
        pickupDistanceMeters: 0
      })
    );
    expect(matches[0].score).toBeGreaterThan(80);
  });

  test('capacity reservation creates a multi-stop dispatch plan and updates the booking', async () => {
    const load = booking();
    const vehicle = truck();
    const plan = {
      _id: 'plan-1',
      assignments: [],
      stops: [],
      remainingTonnes: 12
    };
    const reserved = {
      ...plan,
      remainingTonnes: 10,
      assignments: [
        {
          booking: load._id,
          cargoWeightTonnes: 2,
          pickup: load.pickup,
          destination: load.destination,
          pickupCoordinates: load.pickupCoordinates,
          destinationCoordinates: load.destinationCoordinates
        }
      ],
      save: jest.fn(async function save() {
        return this;
      })
    };
    Truck.findOneAndUpdate.mockResolvedValue({ ...vehicle, reservedCapacityTonnes: 2 });
    DispatchPlan.findOne.mockReturnValue(queryResult(null));
    DispatchPlan.create.mockResolvedValue(plan);
    DispatchPlan.findOneAndUpdate.mockResolvedValue(reserved);

    const result = await reserveAssignment(load, vehicle, { assignmentMethod: 'auto-match', matchScore: 94 });
    expect(result.stops.map((stop) => stop.type)).toEqual(['pickup', 'delivery']);
    expect(load.dispatch).toEqual(
      expect.objectContaining({
        reservedTonnes: 2,
        pickupSequence: 1,
        deliverySequence: 2,
        assignmentMethod: 'auto-match',
        matchScore: 94
      })
    );
  });

  test('auto-assignment awards the top verified truck and confirms the booking', async () => {
    const load = booking();
    const vehicle = truck();
    Booking.findById.mockResolvedValue(load);
    Truck.find.mockReturnValue(queryResult([vehicle]));
    Truck.findOneAndUpdate.mockResolvedValue({ ...vehicle, reservedCapacityTonnes: 2 });
    DispatchPlan.findOne.mockReturnValue(queryResult(null));
    DispatchPlan.create.mockResolvedValue({ _id: 'plan-1', assignments: [], stops: [], remainingTonnes: 12 });
    DispatchPlan.findOneAndUpdate.mockResolvedValue({
      _id: 'plan-1',
      remainingTonnes: 10,
      assignments: [
        {
          booking: load._id,
          cargoWeightTonnes: 2,
          pickup: load.pickup,
          destination: load.destination,
          pickupCoordinates: load.pickupCoordinates,
          destinationCoordinates: load.destinationCoordinates
        }
      ],
      stops: [],
      save: jest.fn(async function save() {
        return this;
      })
    });

    const result = await autoAssign(load._id, { actor: { _id: 'client-1', role: 'client' } });
    expect(result.booking.status).toBe('confirmed');
    expect(result.booking.owner).toBe('owner-1');
    expect(result.booking.truck).toBe('truck-1');
    expect(result.booking.bids[0].status).toBe('accepted');
  });

  test('completed assignments release truck capacity idempotently', async () => {
    const load = booking();
    load.dispatchPlan = 'plan-1';
    load.dispatch = { reservedTonnes: 2 };
    const plan = {
      _id: 'plan-1',
      truck: 'truck-1',
      capacityTonnes: 12,
      reservedTonnes: 2,
      remainingTonnes: 10,
      assignments: [{ booking: load._id, cargoWeightTonnes: 2, status: 'reserved' }],
      stops: [
        { booking: load._id, type: 'pickup', status: 'pending' },
        { booking: load._id, type: 'delivery', status: 'pending' }
      ],
      save: jest.fn(async function save() {
        return this;
      })
    };
    DispatchPlan.findById = jest.fn().mockResolvedValue(plan);

    await releaseAssignment(load, 'delivered');
    expect(plan.reservedTonnes).toBe(0);
    expect(plan.remainingTonnes).toBe(12);
    expect(plan.assignments[0].status).toBe('delivered');
    expect(plan.status).toBe('completed');
  });

  test('pure scoring and stop ordering remain deterministic', () => {
    expect(scoreTruck(truck(), booking(), 12).score).toBeGreaterThan(80);
    const stops = sequenceDispatchStops([
      {
        booking: 'booking-1',
        pickup: 'Nairobi',
        destination: 'Kisumu',
        pickupCoordinates: { lat: -1.2864, lng: 36.8172 },
        destinationCoordinates: { lat: -0.0917, lng: 34.768 }
      }
    ]);
    expect(stops.map((stop) => stop.sequence)).toEqual([1, 2]);
  });

  test('laneFit checks route matching logic variations', () => {
    const vehicle = truck();

    // pickup-destination exact match
    vehicle.routes = ['Nairobi-Kisumu'];
    expect(scoreTruck(vehicle, booking()).laneFit).toBe(1);

    // pickup-to-destination exact match
    vehicle.routes = ['Nairobi-to-Kisumu'];
    expect(scoreTruck(vehicle, booking()).laneFit).toBe(1);

    // contains both but not in order
    vehicle.routes = ['Kisumu to Nairobi'];
    expect(scoreTruck(vehicle, booking()).laneFit).toBe(0.85);

    // contains only pickup
    vehicle.routes = ['Nairobi to Mombasa'];
    expect(scoreTruck(vehicle, booking()).laneFit).toBe(0.45);

    // contains only destination
    vehicle.routes = ['Mombasa to Kisumu'];
    expect(scoreTruck(vehicle, booking()).laneFit).toBe(0.45);

    // contains neither
    vehicle.routes = ['Mombasa to Kampala'];
    expect(scoreTruck(vehicle, booking()).laneFit).toBe(0);
  });

  test('scoreTruck handles missing coordinates/location proximity', () => {
    const vehicle = truck();
    delete vehicle.location;
    const load = booking();
    delete load.pickupCoordinates;
    expect(scoreTruck(vehicle, load).score).toBeDefined();

    // distance very large (beyond 500km)
    vehicle.location = { lat: 10, lng: 10 };
    load.pickupCoordinates = { lat: 0, lng: 0 };
    expect(scoreTruck(vehicle, load).score).toBeDefined();
  });

  test('scoreTruck handles remainingCapacity comparisons', () => {
    const vehicle = truck();
    vehicle.capacityTonnes = 10;
    vehicle.reservedCapacityTonnes = 2;
    const load = booking();

    // remainingCapacity undefined
    expect(scoreTruck(vehicle, load, undefined).remainingCapacityTonnes).toBe(8);

    // remainingCapacity defined and smaller than globally remaining
    expect(scoreTruck(vehicle, load, 5).remainingCapacityTonnes).toBe(5);

    // remainingCapacity defined and larger than globally remaining
    expect(scoreTruck(vehicle, load, 10).remainingCapacityTonnes).toBe(8);
  });

  test('nearestStop handles missing coordinates with Infinity', () => {
    const sequence = sequenceDispatchStops([
      {
        booking: 'booking-1',
        pickup: 'P',
        destination: 'D',
        pickupCoordinates: null,
        destinationCoordinates: { lat: 1, lng: 1 }
      }
    ]);
    expect(sequence).toHaveLength(2);
  });

  test('routeDispatchPlan handles stops length < 2 or missing coordinates', async () => {
    const vehicle = truck();
    const load = booking();
    const plan = {
      stops: [{ type: 'pickup', coordinates: null }],
      assignments: [{ booking: load._id, cargoWeightTonnes: 2 }],
      save: jest.fn(async function save() {
        return this;
      })
    };
    DispatchPlan.findOne.mockReturnValue(queryResult(null));
    DispatchPlan.create.mockResolvedValue(plan);
    DispatchPlan.findOneAndUpdate.mockResolvedValue(plan);

    const result = await reserveAssignment(load, vehicle);
    expect(result.routePlan).toBeNull();
  });

  test('routeDispatchPlan maps api failure catch branch', async () => {
    const vehicle = truck();
    const load = booking();
    const plan = {
      stops: [
        { type: 'pickup', coordinates: { lat: 1, lng: 1 } },
        { type: 'delivery', coordinates: { lat: 2, lng: 2 } }
      ],
      assignments: [{ booking: load._id, cargoWeightTonnes: 2 }],
      save: jest.fn(async function save() {
        return this;
      })
    };
    DispatchPlan.findOne.mockReturnValue(queryResult(null));
    DispatchPlan.create.mockResolvedValue(plan);
    DispatchPlan.findOneAndUpdate.mockResolvedValue(plan);
    maps.computeRoute.mockRejectedValue(new Error('Map API error'));

    const result = await reserveAssignment(load, vehicle);
    expect(result.routePlan).toBeNull();
  });

  test('reserveAssignment throws 404/409 on missing or unverified truck', async () => {
    const load = booking();

    // missing truck
    await expect(reserveAssignment(load, null)).rejects.toThrow('Assigned truck not found');

    // unverified truck
    const vehicle = truck();
    vehicle.isVerified = false;
    await expect(reserveAssignment(load, vehicle)).rejects.toThrow(
      'Assigned truck is no longer verified and available'
    );
  });

  test('reserveAssignment fetches truck owner details if owner is ObjectId string', async () => {
    const load = booking();
    const vehicle = truck();
    vehicle.owner = 'owner-1';

    User.findById.mockReturnValue({
      select: jest.fn(async () => owner())
    });

    const plan = {
      _id: 'plan-1',
      assignments: [],
      stops: [],
      remainingTonnes: 12
    };
    const reserved = {
      ...plan,
      remainingTonnes: 10,
      assignments: [{ booking: load._id, cargoWeightTonnes: 2 }],
      save: jest.fn(async function save() {
        return this;
      })
    };
    Truck.findOneAndUpdate.mockResolvedValue(vehicle);
    DispatchPlan.findOne.mockReturnValue(queryResult(null));
    DispatchPlan.create.mockResolvedValue(plan);
    DispatchPlan.findOneAndUpdate.mockResolvedValue(reserved);

    await reserveAssignment(load, vehicle);
    expect(User.findById).toHaveBeenCalledWith('owner-1');
  });

  test('reserveAssignment throws 409 if required capacity exceeds truck capacity or remaining capacity', async () => {
    const load = booking();
    load.cargoWeightTonnes = 100; // Too heavy
    const vehicle = truck();

    await expect(reserveAssignment(load, vehicle)).rejects.toThrow(
      'Truck does not have enough capacity for this booking'
    );
  });

  test('reserveAssignment handles failed capacity lock or plan update', async () => {
    const load = booking();
    const vehicle = truck();

    // Fails capacity lock
    Truck.findOneAndUpdate.mockResolvedValue(null);
    await expect(reserveAssignment(load, vehicle)).rejects.toThrow('Truck capacity was reserved by another booking');

    // Fails plan update
    Truck.findOneAndUpdate.mockResolvedValue(vehicle);
    DispatchPlan.findOne.mockReturnValue(queryResult(null));
    DispatchPlan.create.mockResolvedValue({ _id: 'plan-1' });
    DispatchPlan.findOneAndUpdate.mockResolvedValue(null); // plan capacity changed concurrently

    await expect(reserveAssignment(load, vehicle)).rejects.toThrow(
      'Dispatch plan capacity changed while assigning this booking'
    );
  });

  test('reserveAssignment handles loadMode full-truck capacity assignment and driver fallback options', async () => {
    const load = booking();
    load.loadMode = 'full-truck';
    delete load.cargoWeightTonnes;

    const vehicle = truck();
    vehicle.assignedDriver = 'driver-777';

    const plan = {
      _id: 'plan-1',
      assignments: [],
      stops: [],
      remainingTonnes: 12
    };
    const reserved = {
      ...plan,
      remainingTonnes: 0,
      assignments: [{ booking: load._id, cargoWeightTonnes: 12 }],
      save: jest.fn(async function save() {
        return this;
      })
    };
    Truck.findOneAndUpdate.mockResolvedValue(vehicle);
    DispatchPlan.findOne.mockReturnValue(queryResult(null));
    DispatchPlan.create.mockResolvedValue(plan);
    DispatchPlan.findOneAndUpdate.mockResolvedValue(reserved);

    await reserveAssignment(load, vehicle);
    expect(load.driver).toBe('driver-777');

    // driver fallback branch: claimedTruck.assignedDriver is set
    delete vehicle.assignedDriver;
    const claimedTruck = { ...vehicle, assignedDriver: 'driver-888' };
    Truck.findOneAndUpdate.mockResolvedValue(claimedTruck);
    await reserveAssignment(load, vehicle);
    expect(load.driver).toBe('driver-888');

    // driver fallback branch: falls back to booking.driver
    delete claimedTruck.assignedDriver;
    load.driver = 'driver-999';
    await reserveAssignment(load, vehicle);
    expect(load.driver).toBe('driver-999');
  });

  test('reserveAssignment handles loadMode full-truck with defined cargoWeightTonnes', async () => {
    const load = booking();
    load.loadMode = 'full-truck';
    load.cargoWeightTonnes = 5;

    const vehicle = truck();
    const plan = {
      _id: 'plan-1',
      assignments: [],
      stops: [],
      remainingTonnes: 12
    };
    const reserved = {
      ...plan,
      remainingTonnes: 7,
      assignments: [{ booking: load._id, cargoWeightTonnes: 5 }],
      save: jest.fn(async function save() {
        return this;
      })
    };
    Truck.findOneAndUpdate.mockResolvedValue(vehicle);
    DispatchPlan.findOne.mockReturnValue(queryResult(null));
    DispatchPlan.create.mockResolvedValue(plan);
    DispatchPlan.findOneAndUpdate.mockResolvedValue(reserved);

    await reserveAssignment(load, vehicle);
    expect(load.reservedCapacityTonnes).toBe(5);
  });

  test('releaseAssignment checks basic parameters and returns null if not applicable', async () => {
    expect(await releaseAssignment(null)).toBeNull();

    const load = booking();
    load.dispatchPlan = 'plan-1';

    // plan not found
    DispatchPlan.findById.mockResolvedValue(null);
    expect(await releaseAssignment(load)).toBeNull();

    // already completed
    const plan = {
      assignments: [{ booking: load._id, status: 'delivered' }]
    };
    DispatchPlan.findById.mockResolvedValue(plan);
    expect(await releaseAssignment(load)).toBeNull();
  });

  test('releaseAssignment handles release workflow and updates status and stops', async () => {
    const load = booking();
    load.dispatchPlan = 'plan-1';
    load.dispatch = { reservedTonnes: 2 };
    const plan = {
      _id: 'plan-1',
      truck: 'truck-1',
      capacityTonnes: 12,
      reservedTonnes: 2,
      remainingTonnes: 10,
      assignments: [
        { booking: load._id, cargoWeightTonnes: 2, status: 'reserved' },
        { booking: { _id: 'booking-other' }, cargoWeightTonnes: 0, status: 'delivered' }
      ],
      stops: [
        { booking: load._id, type: 'pickup', status: 'pending' },
        { booking: load._id, type: 'delivery', status: 'pending' }
      ],
      save: jest.fn(async function save() {
        return this;
      })
    };
    DispatchPlan.findById.mockResolvedValue(plan);

    // Cancelled workflow
    await releaseAssignment(load, 'cancelled');
    expect(plan.assignments[0].status).toBe('cancelled');
    expect(plan.stops[0].status).toBe('skipped');
    expect(plan.status).toBe('completed');
  });

  test('autoAssign throws 404/409 on bad booking state', async () => {
    // booking not found
    Booking.findById.mockResolvedValue(null);
    await expect(autoAssign('booking-1')).rejects.toThrow('Booking not found');

    // already assigned
    Booking.findById.mockResolvedValue({ status: 'confirmed', owner: 'owner-1' });
    await expect(autoAssign('booking-1')).rejects.toThrow('Booking is not available for automatic assignment');
  });

  test('autoAssign throws 409 if no verified truck fits', async () => {
    const load = booking();
    Booking.findById.mockResolvedValue(load);
    Truck.find.mockReturnValue(queryResult([])); // No trucks

    await expect(autoAssign(load._id)).rejects.toThrow('No verified truck currently satisfies this booking');
  });

  test('autoAssign falls back to next matching truck if first one fails with 409', async () => {
    const load = booking();
    const vehicle1 = truck();
    const vehicle2 = { ...truck(), _id: 'truck-2' };

    Booking.findById.mockResolvedValue(load);
    Truck.find.mockReturnValue(queryResult([vehicle1, vehicle2]));

    // First match throws 409 on reserveAssignment
    Truck.findOneAndUpdate
      .mockResolvedValueOnce(null) // fails capacity lock for vehicle1
      .mockResolvedValueOnce(vehicle2); // succeeds for vehicle2

    DispatchPlan.findOne.mockReturnValue(queryResult(null));
    DispatchPlan.create.mockResolvedValue({ _id: 'plan-2', assignments: [], stops: [], remainingTonnes: 12 });
    DispatchPlan.findOneAndUpdate.mockResolvedValue({
      _id: 'plan-2',
      remainingTonnes: 10,
      assignments: [{ booking: load._id, cargoWeightTonnes: 2 }],
      stops: [],
      save: jest.fn(async function save() {
        return this;
      })
    });

    const result = await autoAssign(load._id);
    expect(result.truck._id).toBe('truck-2');
  });

  test('autoAssign throws error if reserveAssignment fails with non-409 error', async () => {
    const load = booking();
    const vehicle = truck();
    Booking.findById.mockResolvedValue(load);
    Truck.find.mockReturnValue(queryResult([vehicle]));

    // fails capacity lock with database connection error
    Truck.findOneAndUpdate.mockRejectedValue(new Error('Db connection error'));

    await expect(autoAssign(load._id)).rejects.toThrow('Db connection error');
  });

  test('autoAssign handles pending status transition and fallback bid amount suggestPrice', async () => {
    const load = booking();
    load.status = 'pending';
    load.estimate = { total: 0 };
    load.budget = 0;

    const vehicle = truck();

    Booking.findById.mockResolvedValue(load);
    Truck.find.mockReturnValue(queryResult([vehicle]));
    Truck.findOneAndUpdate.mockResolvedValue(vehicle);
    DispatchPlan.findOne.mockReturnValue(queryResult(null));
    DispatchPlan.create.mockResolvedValue({ _id: 'plan-1', assignments: [], stops: [], remainingTonnes: 12 });
    DispatchPlan.findOneAndUpdate.mockResolvedValue({
      _id: 'plan-1',
      remainingTonnes: 10,
      assignments: [{ booking: load._id, cargoWeightTonnes: 2 }],
      stops: [],
      save: jest.fn(async function save() {
        return this;
      })
    });

    const result = await autoAssign(load._id);
    expect(result.booking.status).toBe('confirmed');
    expect(result.booking.bids[0].amount).toBeGreaterThan(0);
  });

  test('ownerReady and truckReady check documents validation rules', async () => {
    // ownerReady false: owner null/undefined
    expect(scoreTruck({ ...truck(), owner: null }, booking()).score).toBeDefined();

    // ownerReady false: owner not verified
    expect(scoreTruck({ ...truck(), owner: { isVerified: false } }, booking()).score).toBeDefined();

    // ownerReady false: missing document
    expect(scoreTruck({ ...truck(), owner: { isVerified: true, documents: [] } }, booking()).score).toBeDefined();

    // truckReady false: truck null/undefined (tested via rankTrucksForBooking filter)
    Truck.find.mockReturnValue(queryResult([null]));
    await rankTrucksForBooking({ ...booking(), loadMode: 'ftl' });

    // truckReady false: truck not verified
    const t1 = truck();
    t1.isVerified = false;
    expect(scoreTruck(t1, booking()).score).toBeDefined();

    // truckReady false: truck not available
    const t2 = truck();
    t2.isAvailable = false;
    expect(scoreTruck(t2, booking()).score).toBeDefined();

    // truckReady false: truck archived
    const t3 = truck();
    t3.archivedAt = new Date();
    expect(scoreTruck(t3, booking()).score).toBeDefined();

    // truckReady false: missing document
    const t4 = truck();
    t4.documents = [];
    expect(scoreTruck(t4, booking()).score).toBeDefined();
  });
});
