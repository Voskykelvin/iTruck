const mongoose = require('mongoose');
const { createClient } = require('redis');

const integrationTest = process.env.RUN_INFRA_INTEGRATION === 'true' ? test : test.skip;

integrationTest('CI MongoDB and Redis services accept real connections', async () => {
  const connection = await mongoose
    .createConnection(process.env.CI_MONGODB_URI || 'mongodb://127.0.0.1:27017/itruck_ci', {
      serverSelectionTimeoutMS: 5000
    })
    .asPromise();
  const result = await connection.db.collection('ci_health').insertOne({ checkedAt: new Date() });
  expect(result.acknowledged).toBe(true);
  await connection.dropDatabase();
  await connection.close();

  const redis = createClient({ url: process.env.CI_REDIS_URL || 'redis://127.0.0.1:6379' });
  await redis.connect();
  expect(await redis.ping()).toBe('PONG');
  await redis.quit();
});
