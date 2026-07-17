const approvedDocument = (type) => ({
  type,
  url: `https://demo.itruck.africa/documents/${type}.pdf`,
  fileName: `${type}.pdf`,
  status: 'approved',
  reviewedAt: new Date().toISOString()
});

const shipperDocuments = () => ['shipper-kyc', 'business-registration', 'tax-certificate'].map(approvedDocument);
const ownerDocuments = () => ['owner-kyc', 'driver-id', 'business-registration', 'insurance'].map(approvedDocument);
const truckDocuments = () =>
  ['vehicle-photos', 'insurance', 'vehicle-logbook', 'road-license', 'inspection-report'].map(approvedDocument);

const demoUsers = [
  {
    _id: 'demo-admin',
    firstName: 'Platform',
    lastName: 'Admin',
    email: 'admin@itruck.africa',
    phone: '+254700000000',
    country: 'Kenya',
    role: 'admin',
    password: 'ChangeMeAdmin123!',
    isVerified: true,
    walletBalance: 2500
  },
  {
    _id: 'demo-client-primary',
    firstName: 'Verified',
    lastName: 'Shipper',
    email: 'shipper.one@example.com',
    phone: '+233200000000',
    country: 'Ghana',
    role: 'client',
    password: 'ChangeMeUser123!',
    isVerified: true,
    documents: shipperDocuments(),
    walletBalance: 4200
  },
  {
    _id: 'demo-client-secondary',
    firstName: 'Regional',
    lastName: 'Shipper',
    email: 'shipper.two@example.com',
    phone: '+2348010000000',
    country: 'Nigeria',
    role: 'client',
    password: 'ChangeMeUser123!',
    isVerified: true,
    documents: shipperDocuments(),
    walletBalance: 1850
  },
  {
    _id: 'demo-owner-primary',
    firstName: 'Verified',
    lastName: 'Carrier',
    email: 'owner.one@example.com',
    phone: '+254711000000',
    country: 'Kenya',
    role: 'owner',
    password: 'ChangeMeUser123!',
    isVerified: true,
    documents: ownerDocuments(),
    walletBalance: 8700
  },
  {
    _id: 'demo-owner-secondary',
    firstName: 'Regional',
    lastName: 'Carrier',
    email: 'owner.two@example.com',
    phone: '+254722000000',
    country: 'Kenya',
    role: 'owner',
    password: 'ChangeMeUser123!',
    isVerified: true,
    documents: ownerDocuments(),
    walletBalance: 11200
  }
];

const demoTrucks = [
  {
    _id: 'demo-truck-isuzu',
    owner: 'demo-owner-primary',
    type: 'Lorry',
    make: 'Isuzu',
    model: 'FVZ 34',
    plateNumber: 'TRK 001',
    capacityTonnes: 12,
    country: 'Kenya',
    routes: ['Nairobi-Kampala', 'Mombasa-Nairobi'],
    features: ['GPS', 'Insured', 'Cross-border'],
    isVerified: true,
    documents: truckDocuments(),
    isAvailable: true,
    pricePerKm: 2.1
  },
  {
    _id: 'demo-truck-scania',
    owner: 'demo-owner-secondary',
    type: 'Trailer',
    make: 'Scania',
    model: 'R450',
    plateNumber: 'TRK 002',
    capacityTonnes: 28,
    country: 'Kenya',
    routes: ['Nairobi-Lagos', 'Mombasa-Kigali'],
    features: ['GPS', 'Container locks', 'Long haul'],
    isVerified: true,
    documents: truckDocuments(),
    isAvailable: true,
    pricePerKm: 3.8
  },
  {
    _id: 'demo-truck-hilux',
    owner: 'demo-owner-primary',
    type: 'Pickup',
    make: 'Toyota',
    model: 'Hilux',
    plateNumber: 'TRK 003',
    capacityTonnes: 1.2,
    country: 'Kenya',
    routes: ['Nairobi-Naivasha', 'Nairobi-Nakuru'],
    features: ['Rural roads', 'Express'],
    isVerified: true,
    documents: truckDocuments(),
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
