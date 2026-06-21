jest.mock('../models/Booking', () => ({
  findById: jest.fn()
}));
jest.mock('../models/DispatchPlan', () => ({
  find: jest.fn(),
  findOne: jest.fn(),
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

const Booking = require('../models/Booking');
const DispatchPlan = require('../models/DispatchPlan');
const Truck = require('../models/Truck');
const User = require('../models/User');
const {
  autoAssign,
  rankTrucksForBooking,
  releaseAssignment,
  reserveAssignment,
  scoreTruck,
  sequenceDispatchStops
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

beforeEach(() => {
  jest.clearAllMocks();
  DispatchPlan.find.mockReturnValue(queryResult([]));
  User.findById.mockReturnValue({ select: jest.fn(async () => owner()) });
  Truck.updateOne.mockResolvedValue({ modifiedCount: 1 });
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
  expect(Truck.findOneAndUpdate).toHaveBeenCalledWith(
    expect.objectContaining({ _id: 'truck-1', isAvailable: true }),
    { $inc: { reservedCapacityTonnes: 2 } },
    { new: true }
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
  expect(result.dispatchPlan._id).toBe('plan-1');
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
  expect(Truck.updateOne).toHaveBeenCalledWith(
    { _id: 'truck-1' },
    { $inc: { reservedCapacityTonnes: -2 }, $set: { isAvailable: true } }
  );

  Truck.updateOne.mockClear();
  await releaseAssignment(load, 'delivered');
  expect(Truck.updateOne).not.toHaveBeenCalled();
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
