const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

function suiteDbName(suiteName) {
  const safeName = String(suiteName || 'suite')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return `itruck_test_${safeName}_${process.pid}`;
}

function uriWithDatabase(baseUri, dbName) {
  const url = new URL(baseUri);
  url.pathname = `/${dbName}`;
  return url.toString();
}

function configuredMongoUri(suiteName) {
  const baseUri = process.env.TEST_MONGODB_URI || (process.env.CI ? process.env.CI_MONGODB_URI : '');
  return baseUri ? uriWithDatabase(baseUri, suiteDbName(suiteName)) : '';
}

async function connectTestDb(suiteName) {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();

  const externalUri = configuredMongoUri(suiteName);
  if (externalUri) {
    await mongoose.connect(externalUri, { serverSelectionTimeoutMS: 10000 });
    return;
  }

  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}

async function clearTestDb() {
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((collection) => collection.deleteMany({})));
}

async function disconnectTestDb() {
  if (mongoose.connection.readyState !== 0) {
    if (mongoose.connection.db) await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }

  if (mongoServer) {
    await mongoServer.stop();
    mongoServer = null;
  }
}

module.exports = { clearTestDb, connectTestDb, disconnectTestDb };
