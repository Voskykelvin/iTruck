require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const Truck = require('../models/Truck');
const Wallet = require('../models/Wallet');

const password = 'Demo2025!';

const users = [
  {
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
    firstName: 'Amina',
    lastName: 'Osei',
    email: 'amina@example.com',
    phone: '+233200000000',
    country: 'Ghana',
    role: 'client',
    password,
    isVerified: true,
    walletBalance: 4200
  },
  {
    firstName: 'Tunde',
    lastName: 'Nwosu',
    email: 'tunde@example.com',
    phone: '+2348010000000',
    country: 'Nigeria',
    role: 'client',
    password,
    isVerified: true,
    walletBalance: 1850
  },
  {
    firstName: 'James',
    lastName: 'Mwangi',
    email: 'james@itruck.africa',
    phone: '+254711000000',
    country: 'Kenya',
    role: 'owner',
    password,
    isVerified: true,
    walletBalance: 8700
  },
  {
    firstName: 'Grace',
    lastName: 'Wanjiku',
    email: 'grace@itruck.africa',
    phone: '+254722000000',
    country: 'Kenya',
    role: 'owner',
    password,
    isVerified: true,
    walletBalance: 11200
  }
];

const trucks = [
  {
    ownerEmail: 'james@itruck.africa',
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
    ownerEmail: 'grace@itruck.africa',
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
    ownerEmail: 'james@itruck.africa',
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

async function upsertUser(data) {
  let user = await User.findOne({ email: data.email }).select('+password');

  if (!user) {
    user = await User.create(data);
    return { user, action: 'created' };
  }

  Object.assign(user, data);
  user.markModified('password');
  await user.save();
  return { user, action: 'updated' };
}

async function upsertTruck(data, owner) {
  const payload = { ...data, owner: owner._id };
  delete payload.ownerEmail;

  const truck = await Truck.findOneAndUpdate({ plateNumber: payload.plateNumber }, payload, {
    new: true,
    upsert: true,
    setDefaultsOnInsert: true
  });

  return truck;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/itruck');

  const installed = [];
  for (const data of users) {
    const { walletBalance = 0, ...userData } = data;
    const result = await upsertUser(userData);
    await Wallet.findOneAndUpdate(
      { user: result.user._id },
      { user: result.user._id, balance: walletBalance, currency: 'USD' },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    installed.push(`${result.action}: ${result.user.email} (${result.user.role})`);
  }

  for (const data of trucks) {
    const owner = await User.findOne({ email: data.ownerEmail });
    if (owner) {
      const truck = await upsertTruck(data, owner);
      installed.push(`truck: ${truck.plateNumber} (${truck.type})`);
    }
  }

  console.log('iTruck demo users installed');
  installed.forEach((line) => console.log(' - ' + line));
  console.log('');
  console.log('Admin login: admin@itruck.africa / Admin2025!');
  console.log('Demo password for clients and owners: Demo2025!');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
