require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const mongoose = require('mongoose');
const User = require('../models/User');
const Truck = require('../models/Truck');
const Wallet = require('../models/Wallet');

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/itruck');
  await User.deleteMany({});
  await Truck.deleteMany({});
  await Wallet.deleteMany({});

  const admin = await User.create({
    firstName: 'Super',
    lastName: 'Admin',
    email: 'admin@itruck.africa',
    phone: '+254700000000',
    country: 'Kenya',
    role: 'admin',
    password: 'Admin2025!',
    isVerified: true
  });

  const owner = await User.create({
    firstName: 'James',
    lastName: 'Mwangi',
    email: 'james@itruck.africa',
    phone: '+254711000000',
    country: 'Kenya',
    role: 'owner',
    password: 'Demo2025!',
    isVerified: true
  });

  const client = await User.create({
    firstName: 'Amina',
    lastName: 'Osei',
    email: 'amina@example.com',
    phone: '+233200000000',
    country: 'Ghana',
    role: 'client',
    password: 'Demo2025!'
  });

  await Wallet.create([
    { user: admin._id, balance: 2500, currency: 'USD' },
    { user: owner._id, balance: 8700, currency: 'USD' },
    { user: client._id, balance: 4200, currency: 'USD' }
  ]);

  await Truck.create({
    owner: owner._id,
    type: 'Lorry',
    make: 'Isuzu',
    model: 'FVZ 34',
    plateNumber: 'KDA 442Q',
    capacityTonnes: 12,
    country: 'Kenya',
    isVerified: true,
    isAvailable: true,
    pricePerKm: 2.1
  });

  console.log('Seed complete:', admin.email);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
