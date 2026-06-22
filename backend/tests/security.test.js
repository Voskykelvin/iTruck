process.env.REDIS_URL = '';

const { errorHandler } = require('../middleware/security');
const { redactUrlSecrets } = require('../utils/redactUrl');
const { app, corsOptions } = require('../app');
const request = require('supertest');

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

function runError(err, env = 'production') {
  process.env.NODE_ENV = env;
  const req = { originalUrl: '/api/test' };
  const res = {
    statusCode: 0,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };

  errorHandler(err, req, res, () => {});
  return res;
}

test('error handler converts mongoose cast errors to client-safe failures', () => {
  const err = { name: 'CastError', path: '_id', value: 'not-an-id' };
  const res = runError(err);

  expect(res.statusCode).toBe(400);
  expect(res.body).toEqual({
    status: 'fail',
    message: 'Invalid _id: not-an-id'
  });
});

test('error handler converts duplicate key errors to conflicts', () => {
  const err = { code: 11000, keyValue: { email: 'user@example.com' } };
  const res = runError(err);

  expect(res.statusCode).toBe(409);
  expect(res.body.status).toBe('fail');
  expect(res.body.message).toBe("email 'user@example.com' is already in use.");
});

test('error handler hides unexpected production server errors', () => {
  const res = runError(new Error('database password leaked'));

  expect(res.statusCode).toBe(500);
  expect(res.body).toEqual({
    status: 'error',
    message: 'An unexpected internal server error occurred.'
  });
});

test('error handler returns a client-safe payload for oversized uploads', () => {
  const res = runError({ name: 'MulterError', code: 'LIMIT_FILE_SIZE', message: 'File too large' });

  expect(res.statusCode).toBe(413);
  expect(res.body).toEqual({
    status: 'fail',
    message: 'Uploaded file exceeds the 10 MB limit.'
  });
});

test('callback secrets are removed from logged URLs', () => {
  expect(redactUrlSecrets('/api/payments/webhooks/mpesa/stk?token=secret-value&mode=live')).toBe(
    '/api/payments/webhooks/mpesa/stk?token=[redacted]&mode=live'
  );
});

test('disallowed cors origins produce a forbidden error', (done) => {
  process.env.ALLOWED_ORIGINS = 'https://itruck.example';
  corsOptions().origin('https://attacker.example', (err) => {
    expect(err.statusCode).toBe(403);
    expect(err.message).toContain('not allowed');
    done();
  });
});

test('direct backend responses include browser security policy headers', async () => {
  const res = await request(app).get('/api/health');

  expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(res.headers['permissions-policy']).toContain('geolocation=(self)');
});

test('operations probes expose liveness and protect metrics with a dedicated token', async () => {
  process.env.METRICS_AUTH_TOKEN = 'metrics-test-secret';
  const live = await request(app).get('/api/health/live');
  expect(live.status).toBe(200);
  expect(live.body.status).toBe('alive');

  expect((await request(app).get('/api/metrics')).status).toBe(401);
  const metrics = await request(app).get('/api/metrics').set('Authorization', 'Bearer metrics-test-secret');
  expect(metrics.status).toBe(200);
  expect(metrics.text).toContain('itruck_process_uptime_seconds');
});
