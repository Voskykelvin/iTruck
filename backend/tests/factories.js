const { Types } = require('mongoose');

/**
 * Test data factories for generating consistent test fixtures
 */

function randomEmail(prefix = 'test') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

function randomPhone() {
  return `+2547${Math.floor(10000000 + Math.random() * 90000000)}`;
}

function randomId(prefix = 'test') {
  return `${prefix}-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 6)}`;
}

function randomMongoId() {
  return new Types.ObjectId().toString();
}

/**
 * User factory - creates valid user objects for testing
 */
function userFactory(overrides = {}) {
  const role = overrides.role || 'client';
  return {
    firstName: overrides.firstName || 'Test',
    lastName: overrides.lastName || 'User',
    email: overrides.email || randomEmail(role),
    phone: overrides.phone || randomPhone(),
    country: overrides.country || 'Kenya',
    countryCode: overrides.countryCode || '+254',
    password: overrides.password || 'TestPassword123!',
    role,
    accountType: overrides.accountType || 'personal',
    company: overrides.company || 'Test Company',
    isVerified: overrides.isVerified ?? false,
    isActive: overrides.isActive ?? true,
    walletBalance: overrides.walletBalance ?? 0,
    ...overrides
  };
}

/**
 * Valid registration payload for API tests
 */
function registrationPayload(overrides = {}) {
  const role = overrides.role || 'client';
  return {
    firstName: overrides.firstName || 'Test',
    lastName: overrides.lastName || 'User',
    email: overrides.email || randomEmail(role),
    phone: overrides.phone || randomPhone(),
    country: overrides.country || 'Kenya',
    countryCode: overrides.countryCode || '+254',
    password: overrides.password || 'TestPassword123!',
    deviceId: overrides.deviceId || '00000000-0000-4000-8000-000000000000', // valid UUID
    ...overrides
  };
}

/**
 * Valid login payload for API tests
 */
function loginPayload(overrides = {}) {
  return {
    email: overrides.email || 'test@example.com',
    password: overrides.password || 'TestPassword123!',
    deviceId: overrides.deviceId || '00000000-0000-4000-8000-000000000000',
    ...overrides
  };
}

/**
 * Booking factory - creates valid booking objects
 */
function bookingFactory(overrides = {}) {
  return {
    _id: overrides._id || randomId('ITK'),
    client: overrides.client || randomMongoId(),
    owner: overrides.owner || null,
    driver: overrides.driver || null,
    truck: overrides.truck || null,
    pickup: overrides.pickup || 'Nairobi',
    destination: overrides.destination || 'Kampala',
    pickupCoordinates: overrides.pickupCoordinates || { lat: -1.2864, lng: 36.8172 },
    destinationCoordinates: overrides.destinationCoordinates || { lat: 0.3476, lng: 32.5825 },
    distance: overrides.distance || 650,
    vehicleType: overrides.vehicleType || 'Lorry',
    loadMode: overrides.loadMode || 'full-truck',
    cargoWeightTonnes: overrides.cargoWeightTonnes || 10,
    cargo: overrides.cargo || 'General goods',
    weight: overrides.weight || '10 tonnes',
    budget: overrides.budget || 1500,
    paymentMethod: overrides.paymentMethod || 'M-Pesa',
    status: overrides.status || 'pending',
    bids: overrides.bids || [],
    tracking: overrides.tracking || [],
    createdAt: overrides.createdAt || new Date(),
    ...overrides
  };
}

/**
 * Bid factory - creates valid bid objects
 */
function bidFactory(overrides = {}) {
  return {
    _id: overrides._id || randomMongoId(),
    owner: overrides.owner || randomMongoId(),
    truck: overrides.truck || randomMongoId(),
    amount: overrides.amount || 1500,
    originalAmount: overrides.originalAmount || 1500,
    message: overrides.message || 'Bid message',
    status: overrides.status || 'pending',
    expiresAt: overrides.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000),
    history: overrides.history || [],
    createdAt: overrides.createdAt || new Date(),
    ...overrides
  };
}

/**
 * Truck factory - creates valid truck objects
 */
function truckFactory(overrides = {}) {
  return {
    _id: overrides._id || randomMongoId(),
    owner: overrides.owner || randomMongoId(),
    type: overrides.type || 'Lorry',
    make: overrides.make || 'Isuzu',
    model: overrides.model || 'FVZ',
    plateNumber: overrides.plateNumber || `TRK-${Math.floor(100 + Math.random() * 900)}`,
    capacityTonnes: overrides.capacityTonnes || 12,
    country: overrides.country || 'Kenya',
    routes: overrides.routes || ['Nairobi-Kampala'],
    features: overrides.features || ['GPS', 'Insured'],
    isVerified: overrides.isVerified ?? true,
    isAvailable: overrides.isAvailable ?? true,
    pricePerKm: overrides.pricePerKm || 2.5,
    ratingAverage: overrides.ratingAverage || 4.5,
    ratingCount: overrides.ratingCount || 10,
    completedTrips: overrides.completedTrips || 50,
    documents: overrides.documents || [],
    ...overrides
  };
}

/**
 * Create a valid JWT token for testing
 */
function createTestToken(user, secret = 'test-secret', expiresIn = '1h') {
  const jwt = require('jsonwebtoken');
  return jwt.sign({ id: user._id || user.id, role: user.role }, secret, { expiresIn });
}

/**
 * Create auth headers for testing
 */
function authHeaders(token) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * Reset all factories - useful for tests that need clean state
 */
function resetFactories() {
  // No global state to reset currently
}

module.exports = {
  randomEmail,
  randomPhone,
  randomId,
  randomMongoId,
  userFactory,
  registrationPayload,
  loginPayload,
  bookingFactory,
  bidFactory,
  truckFactory,
  createTestToken,
  authHeaders,
  resetFactories
};