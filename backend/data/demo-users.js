const demoUsers = [
  {
    _id: 'demo-admin',
    firstName: 'Super',
    lastName: 'Admin',
    email: 'admin@itruck.africa',
    phone: '+254700000000',
    country: 'Kenya',
    role: 'admin',
    password: 'Admin2025!',
    isVerified: true,
    walletBalance: 2500
  },
  {
    _id: 'demo-client-amina',
    firstName: 'Amina',
    lastName: 'Osei',
    email: 'amina@example.com',
    phone: '+233200000000',
    country: 'Ghana',
    role: 'client',
    password: 'Demo2025!',
    isVerified: true,
    walletBalance: 4200
  },
  {
    _id: 'demo-client-tunde',
    firstName: 'Tunde',
    lastName: 'Nwosu',
    email: 'tunde@example.com',
    phone: '+2348010000000',
    country: 'Nigeria',
    role: 'client',
    password: 'Demo2025!',
    isVerified: true,
    walletBalance: 1850
  },
  {
    _id: 'demo-owner-james',
    firstName: 'James',
    lastName: 'Mwangi',
    email: 'james@itruck.africa',
    phone: '+254711000000',
    country: 'Kenya',
    role: 'owner',
    password: 'Demo2025!',
    isVerified: true,
    walletBalance: 8700
  },
  {
    _id: 'demo-owner-grace',
    firstName: 'Grace',
    lastName: 'Wanjiku',
    email: 'grace@itruck.africa',
    phone: '+254722000000',
    country: 'Kenya',
    role: 'owner',
    password: 'Demo2025!',
    isVerified: true,
    walletBalance: 11200
  }
];

const demoTrucks = [
  {
    _id: 'demo-truck-isuzu',
    owner: 'demo-owner-james',
    type: 'Lorry',
    make: 'Isuzu',
    model: 'FVZ 34',
    plateNumber: 'KDA 442Q',
    capacityTonnes: 12,
    country: 'Kenya',
    routes: ['Nairobi-Kampala', 'Mombasa-Nairobi'],
    features: ['GPS', 'Insured', 'Cross-border'],
    isVerified: true,
    isAvailable: true,
    pricePerKm: 2.1
  },
  {
    _id: 'demo-truck-scania',
    owner: 'demo-owner-grace',
    type: 'Trailer',
    make: 'Scania',
    model: 'R450',
    plateNumber: 'KCB 991T',
    capacityTonnes: 28,
    country: 'Kenya',
    routes: ['Nairobi-Lagos', 'Mombasa-Kigali'],
    features: ['GPS', 'Container locks', 'Long haul'],
    isVerified: true,
    isAvailable: true,
    pricePerKm: 3.8
  },
  {
    _id: 'demo-truck-hilux',
    owner: 'demo-owner-james',
    type: 'Pickup',
    make: 'Toyota',
    model: 'Hilux',
    plateNumber: 'KDG 128P',
    capacityTonnes: 1.2,
    country: 'Kenya',
    routes: ['Nairobi-Naivasha', 'Nairobi-Nakuru'],
    features: ['Rural roads', 'Express'],
    isVerified: true,
    isAvailable: true,
    pricePerKm: 1.25
  }
];

function safeUser(user) {
  if (!user) return null;
  const copy = { ...user };
  delete copy.password;
  return copy;
}

module.exports = { demoUsers, demoTrucks, safeUser };
