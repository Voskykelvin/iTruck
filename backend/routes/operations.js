const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const { createClient } = require('redis');
const { isLiveMode, mongoReady, runtimeMode } = require('../config/runtime');
const metrics = require('../services/metrics');

const router = express.Router();

function secretsMatch(provided, expected) {
  const providedBuffer = Buffer.from(String(provided || ''));
  const expectedBuffer = Buffer.from(String(expected || ''));
  return providedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
}

function metricsAuthorized(req) {
  const expected = process.env.METRICS_AUTH_TOKEN;
  if (!expected) return !isLiveMode();
  const bearer = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return secretsMatch(req.get('x-metrics-key') || bearer, expected);
}

async function redisReady() {
  if (!process.env.REDIS_URL || process.env.DISABLE_REDIS === 'true') return { configured: false, ready: true };
  const client = createClient({
    url: process.env.REDIS_URL,
    socket: { connectTimeout: 1500, reconnectStrategy: false }
  });
  client.on('error', () => {});
  try {
    await client.connect();
    const pong = await client.ping();
    return { configured: true, ready: pong === 'PONG' };
  } catch (err) {
    return { configured: true, ready: false, error: err.message };
  } finally {
    if (client.isOpen) await client.quit().catch(() => client.disconnect());
  }
}

router.get('/health/live', (_req, res) => {
  res.json({
    status: 'alive',
    service: 'itruck-backend',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

router.get('/health/ready', async (_req, res) => {
  const mode = runtimeMode();
  const mongo = { configured: Boolean(process.env.MONGODB_URI), ready: mongoReady() };
  const redis = await redisReady();
  const dependenciesRequired = mode !== 'demo';
  const ready = (!dependenciesRequired || !mongo.configured || mongo.ready) && (!dependenciesRequired || redis.ready);
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ready' : 'degraded',
    mode,
    dependencies: {
      mongo: { ...mongo, state: mongoose.connection.readyState },
      redis
    },
    timestamp: new Date().toISOString()
  });
});

router.get('/metrics', (req, res) => {
  if (!metricsAuthorized(req)) return res.status(401).json({ message: 'Metrics authentication required' });
  res.type('text/plain; version=0.0.4').send(
    metrics.renderPrometheus({
      itruck_mongodb_ready: mongoReady() ? 1 : 0
    })
  );
});

router.get('/operations/jobs', (req, res) => {
  if (!metricsAuthorized(req)) return res.status(401).json({ message: 'Operations authentication required' });
  res.json({ jobs: metrics.snapshot(), timestamp: new Date().toISOString() });
});

module.exports = router;
