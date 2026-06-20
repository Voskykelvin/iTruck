process.env.REDIS_URL = '';

const { errorHandler } = require('../middleware/security');
const { redactUrlSecrets } = require('../utils/redactUrl');

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

test('callback secrets are removed from logged URLs', () => {
  expect(redactUrlSecrets('/api/payments/webhooks/mpesa/stk?token=secret-value&mode=live')).toBe(
    '/api/payments/webhooks/mpesa/stk?token=[redacted]&mode=live'
  );
});
