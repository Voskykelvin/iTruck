const jwt = require('jsonwebtoken');
const request = require('supertest');

process.env.REDIS_URL = '';

const { app, io, server } = require('../server');

afterAll(done => {
  if (io?.close) io.close();
  if (server?.listening) return server.close(done);
  return done();
});

function authHeader(user = { id: 'demo-client-amina', role: 'client' }) {
  const token = jwt.sign(user, process.env.JWT_SECRET || 'test-secret');
  return `Bearer ${token}`;
}

test('auth login returns structured validation errors', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({});

  expect(res.status).toBe(422);
  expect(res.body.status).toBe('fail');
  expect(res.body.message).toBe('Validation failed');
  expect(res.body.errors.map(error => error.field)).toEqual(expect.arrayContaining(['email', 'password']));
});

test('truck list rejects invalid query filters before querying data', async () => {
  const res = await request(app)
    .get('/api/trucks?verified=maybe');

  expect(res.status).toBe(422);
  expect(res.body.errors).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'verified' })
  ]));
});

test('booking creation validates required flat payload fields', async () => {
  const res = await request(app)
    .post('/api/bookings')
    .set('Authorization', authHeader())
    .send({});

  expect(res.status).toBe(422);
  expect(res.body.errors.map(error => error.field)).toEqual(expect.arrayContaining(['pickup', 'destination', 'cargo']));
});

test('notification read route rejects invalid object ids', async () => {
  const res = await request(app)
    .patch('/api/notifications/not-an-id/read')
    .set('Authorization', authHeader());

  expect(res.status).toBe(422);
  expect(res.body.errors).toEqual(expect.arrayContaining([
    expect.objectContaining({ field: 'id' })
  ]));
});

test('marketplace estimate validates required route fields', async () => {
  const res = await request(app)
    .post('/api/marketplace/estimate')
    .send({ vehicleType: 'Lorry' });

  expect(res.status).toBe(422);
  expect(res.body.errors.map(error => error.field)).toEqual(expect.arrayContaining(['pickup', 'destination']));
});
