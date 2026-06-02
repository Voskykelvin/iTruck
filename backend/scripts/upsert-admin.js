const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const User = require('../models/User');
const Wallet = require('../models/Wallet');

const envFileInput =
  process.env.ADMIN_ENV_FILE || process.env.DOTENV_CONFIG_PATH || path.join(__dirname, '../../.env.production');
const envFile = path.isAbsolute(envFileInput) ? envFileInput : path.resolve(__dirname, '../..', envFileInput);

dotenv.config({ path: envFile });

const adminEmail = process.env.ADMIN_EMAIL || 'admin@itruck.africa';
const adminPassword = process.env.ADMIN_PASSWORD;

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error(`MONGODB_URI is required. Checked env file: ${envFile}`);
  }

  if (!adminPassword || adminPassword.length < 12) {
    throw new Error('ADMIN_PASSWORD is required and must be at least 12 characters.');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  let user = await User.findOne({ email: adminEmail }).select('+password');
  const payload = {
    firstName: process.env.ADMIN_FIRST_NAME || 'Platform',
    lastName: process.env.ADMIN_LAST_NAME || 'Admin',
    email: adminEmail,
    phone: process.env.ADMIN_PHONE || '+254700000000',
    country: process.env.ADMIN_COUNTRY || 'Kenya',
    role: 'admin',
    isVerified: true,
    isActive: true
  };

  if (!user) {
    user = await User.create({ ...payload, password: adminPassword });
  } else {
    Object.assign(user, payload, { password: adminPassword });
    user.markModified('password');
    await user.save();
  }

  await Wallet.findOneAndUpdate(
    { user: user._id },
    { user: user._id, balance: Number(process.env.ADMIN_WALLET_BALANCE || 0), currency: 'USD' },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  console.log(`Admin ready: ${user.email} (${user.role})`);
  await mongoose.disconnect();
}

run().catch(async (err) => {
  console.error(err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
