const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { app } = require('../../app');
const User = require('../../models/User');
const RefreshToken = require('../../models/RefreshToken');
const { userFactory, registrationPayload, loginPayload } = require('../factories');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-secret';
const PRIMARY_DEVICE = '00000000-0000-4000-8000-000000000000';
const SECONDARY_DEVICE = '11111111-1111-4000-8000-000000000000';
const TERTIARY_DEVICE = '22222222-2222-4000-8000-000000000000';

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) await collections[key].deleteMany({});
});

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Mint an access token directly (no login round-trip needed). */
function tokenFor(user) {
  return jwt.sign({ id: String(user._id), role: user.role }, JWT_SECRET);
}

/** Perform a real login and return the raw cookies + parsed csrf value. */
async function loginAs(email, password, deviceId = PRIMARY_DEVICE) {
  const res = await request(app).post('/api/auth/login').send(loginPayload({ email, password, deviceId })).expect(200);

  const cookies = res.headers['set-cookie'];
  const refreshCookie = cookies.find((c) => c.startsWith('itruck_refresh='));
  const csrfCookie = cookies.find((c) => c.startsWith('itruck_csrf='));
  const csrfToken = csrfCookie ? csrfCookie.split(';')[0].split('=')[1] : null;

  return { res, cookies, refreshCookie, csrfCookie, csrfToken };
}

/** Build a cookie string + header value for a self-matched CSRF pair. */
function fakeCsrfPair(value = crypto.randomBytes(24).toString('hex')) {
  return {
    csrfCookieStr: `itruck_csrf=${value}`,
    csrfHeaderValue: value
  };
}

// ── Integration tests ─────────────────────────────────────────────────────────

describe('Auth Integration Tests', () => {
  // ─────────────────────────────────────────────────────────
  // Registration
  // ─────────────────────────────────────────────────────────
  describe('POST /api/auth/register/owner & /register/client', () => {
    test('successfully registers an owner user', async () => {
      const payload = registrationPayload({ role: 'owner', deviceId: PRIMARY_DEVICE });

      const res = await request(app).post('/api/auth/register/owner').send(payload).expect(201);

      expect(res.body.user.email).toBe(payload.email.toLowerCase());
      expect(res.body.user.role).toBe('owner');
      expect(res.body.user.password).toBeUndefined();

      const cookies = res.headers['set-cookie'] || [];
      expect(cookies.some((c) => c.includes('itruck_access'))).toBe(true);
      expect(cookies.some((c) => c.includes('itruck_refresh'))).toBe(true);
      expect(cookies.some((c) => c.includes('itruck_csrf'))).toBe(true);

      const dbUser = await User.findOne({ email: payload.email });
      expect(dbUser).toBeTruthy();
      expect(dbUser.role).toBe('owner');
    });

    test('successfully registers a client user', async () => {
      const payload = registrationPayload({ role: 'client', deviceId: PRIMARY_DEVICE });
      const res = await request(app).post('/api/auth/register/client').send(payload).expect(201);
      expect(res.body.user.role).toBe('client');
    });

    test('returns 409 Conflict on duplicate email', async () => {
      const p1 = registrationPayload({ email: 'dup@example.com', deviceId: PRIMARY_DEVICE });
      const p2 = registrationPayload({ email: 'dup@example.com', deviceId: SECONDARY_DEVICE });

      await request(app).post('/api/auth/register/client').send(p1).expect(201);
      const res = await request(app).post('/api/auth/register/client').send(p2).expect(409);
      expect(res.body.message).toBeDefined();
    });

    test('returns 422 when deviceId is missing or invalid', async () => {
      const payload = registrationPayload({ deviceId: 'invalid-device-id' });
      const res = await request(app).post('/api/auth/register/client').send(payload).expect(422);
      expect(res.body.errors).toBeDefined();
      expect(res.body.errors.some((e) => e.field === 'deviceId')).toBe(true);
    });

    test('returns 422 when required fields are missing', async () => {
      const res = await request(app)
        .post('/api/auth/register/client')
        .send({ email: 'incomplete@example.com' })
        .expect(422);
      expect(res.body.errors).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────
  // Login
  // ─────────────────────────────────────────────────────────
  describe('POST /api/auth/login', () => {
    const RAW_PASSWORD = 'Password123!';
    let _user;

    beforeEach(async () => {
      _user = await User.create(userFactory({ email: 'login@example.com', password: RAW_PASSWORD, isVerified: true }));
    });

    test('successfully logs in with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send(loginPayload({ email: 'login@example.com', password: RAW_PASSWORD, deviceId: PRIMARY_DEVICE }))
        .expect(200);

      expect(res.body.user.email).toBe('login@example.com');
      const cookies = res.headers['set-cookie'] || [];
      expect(cookies.some((c) => c.includes('itruck_access'))).toBe(true);
    });

    test('fails on wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send(loginPayload({ email: 'login@example.com', password: 'WrongPassword!', deviceId: PRIMARY_DEVICE }))
        .expect(401);
      expect(res.body.message).toMatch(/Invalid email or password/i);
    });

    test('fails on unregistered email', async () => {
      await request(app)
        .post('/api/auth/login')
        .send(loginPayload({ email: 'notfound@example.com', password: RAW_PASSWORD, deviceId: PRIMARY_DEVICE }))
        .expect(401);
    });
  });

  // ─────────────────────────────────────────────────────────
  // Forgot / Reset password
  // ─────────────────────────────────────────────────────────
  describe('POST /api/auth/forgot-password & /reset-password', () => {
    let user;

    beforeEach(async () => {
      user = await User.create(userFactory({ email: 'reset@example.com', isVerified: true }));
    });

    test('forgot-password: registered email stores reset token', async () => {
      const res = await request(app).post('/api/auth/forgot-password').send({ email: 'reset@example.com' }).expect(200);

      expect(res.body.message).toContain('password reset instructions have been sent');

      const updated = await User.findOne({ email: 'reset@example.com' }).select(
        '+passwordResetToken +passwordResetExpires'
      );
      expect(updated.passwordResetToken).toBeDefined();
      expect(updated.passwordResetExpires).toBeDefined();
    });

    test('forgot-password: unregistered email returns same message', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'unregistered@example.com' })
        .expect(200);
      expect(res.body.message).toContain('password reset instructions have been sent');
    });

    test('reset-password: succeeds with valid token', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      user.passwordResetToken = crypto.createHash('sha256').update(rawToken).digest('hex');
      user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ email: 'reset@example.com', token: rawToken, password: 'NewPassword123!' })
        .expect(200);

      expect(res.body.message).toContain('Password updated');

      const dbUser = await User.findOne({ email: 'reset@example.com' }).select('+password');
      expect(await dbUser.comparePassword('NewPassword123!')).toBe(true);
    });

    test('reset-password: fails with invalid or expired token', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          email: 'reset@example.com',
          token: crypto.randomBytes(32).toString('hex'),
          password: 'NewPassword123!'
        })
        .expect(401);
      expect(res.body.message).toContain('invalid or expired');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Refresh
  // ─────────────────────────────────────────────────────────
  describe('POST /api/auth/refresh', () => {
    let user;

    beforeEach(async () => {
      user = await User.create(
        userFactory({ email: 'refresh@example.com', password: 'TestPassword123!', isVerified: true })
      );
    });

    test('fails with missing token', async () => {
      const res = await request(app).post('/api/auth/refresh').send({ deviceId: PRIMARY_DEVICE }).expect(401);
      expect(res.body.message).toMatch(/token required/i);
    });

    test('fails with missing deviceId', async () => {
      // Pass token via body so CSRF is not triggered
      const res = await request(app).post('/api/auth/refresh').send({ refreshToken: 'sometoken' }).expect(401);
      expect(res.body.message).toMatch(/Device id required/i);
    });

    test('fails with a tampered / invalid JWT (via body — no CSRF)', async () => {
      // Use body to avoid triggering the cookie-based CSRF guard
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: 'completely.invalid.token', deviceId: PRIMARY_DEVICE })
        .expect(401);
      expect(res.body.message).toMatch(/invalid|expired/i);
    });

    test('fails when token type is access (not refresh) (via body — no CSRF)', async () => {
      const accessToken = jwt.sign({ id: String(user._id), role: user.role }, JWT_SECRET);

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: accessToken, deviceId: PRIMARY_DEVICE })
        .expect(401);
      expect(res.body.message).toMatch(/Invalid refresh token/i);
    });

    test('fails when session not found in DB / token revoked (via body — no CSRF)', async () => {
      const fakeSessionId = new mongoose.Types.ObjectId();
      const fakeToken = jwt.sign(
        { id: String(user._id), role: user.role, sid: String(fakeSessionId), type: 'refresh' },
        JWT_SECRET
      );

      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: fakeToken, deviceId: PRIMARY_DEVICE })
        .expect(401);
      expect(res.body.message).toMatch(/revoked|expired/i);
    });

    test('revokes all sessions when a previously revoked token is re-used (token compromise detection)', async () => {
      // 1. Log in to get a real session + tokens
      const { refreshCookie, csrfCookie, csrfToken } = await loginAs(
        'refresh@example.com',
        'TestPassword123!',
        PRIMARY_DEVICE
      );

      // 2. Do a successful refresh so the old session gets replaced (revokedAt + replacedByTokenHash set)
      const _refreshRes = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [refreshCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ deviceId: PRIMARY_DEVICE })
        .expect(200);

      // 3. Extract the OLD refresh token value from the original cookie
      const oldToken = refreshCookie.split(';')[0].split('=')[1];

      // 4. Try to re-use the OLD (now revoked) token via body — triggers compromise detection
      const res = await request(app)
        .post('/api/auth/refresh')
        .send({ refreshToken: oldToken, deviceId: PRIMARY_DEVICE })
        .expect(401);

      // All sessions should be revoked + token rejected
      expect(res.body.message).toMatch(/revoked|expired/i);
      const remaining = await RefreshToken.countDocuments({ user: user._id, revokedAt: null });
      expect(remaining).toBe(0);
    });

    test('successfully refreshes with valid cookie & CSRF', async () => {
      const { refreshCookie, csrfCookie, csrfToken } = await loginAs(
        'refresh@example.com',
        'TestPassword123!',
        PRIMARY_DEVICE
      );

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [refreshCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ deviceId: PRIMARY_DEVICE })
        .expect(200);

      expect(res.body.user).toBeDefined();
      const newCookies = res.headers['set-cookie'] || [];
      expect(newCookies.some((c) => c.includes('itruck_access'))).toBe(true);
      expect(newCookies.some((c) => c.includes('itruck_refresh'))).toBe(true);
    });

    test('fails when user is deactivated', async () => {
      const { refreshCookie, csrfCookie, csrfToken } = await loginAs(
        'refresh@example.com',
        'TestPassword123!',
        PRIMARY_DEVICE
      );

      await User.findByIdAndUpdate(user._id, { isActive: false });

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [refreshCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ deviceId: PRIMARY_DEVICE })
        .expect(401);
      expect(res.body.message).toMatch(/no longer exists/i);
    });

    test('fails with device mismatch', async () => {
      const { refreshCookie, csrfCookie, csrfToken } = await loginAs(
        'refresh@example.com',
        'TestPassword123!',
        PRIMARY_DEVICE
      );

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [refreshCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .send({ deviceId: SECONDARY_DEVICE }) // different device
        .expect(401);
      expect(res.body.message).toMatch(/Device mismatch/i);
    });
  });

  // ─────────────────────────────────────────────────────────
  // Logout
  // ─────────────────────────────────────────────────────────
  describe('POST /api/auth/logout', () => {
    let user;

    beforeEach(async () => {
      user = await User.create(
        userFactory({ email: 'logout@example.com', password: 'TestPassword123!', isVerified: true })
      );
    });

    test('logs out without a session cookie (no-op) and clears cookies', async () => {
      const res = await request(app).post('/api/auth/logout').expect(200);

      expect(res.body.message).toBe('Logged out');
      const cookies = res.headers['set-cookie'] || [];
      expect(cookies.some((c) => c.includes('itruck_access=;'))).toBe(true);
      expect(cookies.some((c) => c.includes('itruck_refresh=;'))).toBe(true);
    });

    test('logs out with an active session and revokes the refresh token', async () => {
      const { refreshCookie, csrfCookie, csrfToken } = await loginAs(
        'logout@example.com',
        'TestPassword123!',
        PRIMARY_DEVICE
      );

      const beforeCount = await RefreshToken.countDocuments({ user: user._id, revokedAt: null });
      expect(beforeCount).toBe(1);

      await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [refreshCookie, csrfCookie])
        .set('X-CSRF-Token', csrfToken)
        .expect(200);

      const afterCount = await RefreshToken.countDocuments({ user: user._id, revokedAt: null });
      expect(afterCount).toBe(0);
    });

    test('logs out gracefully when refresh cookie contains an invalid JWT (catch branch)', async () => {
      // Craft a matching CSRF pair so assertCsrf passes, then use an invalid JWT
      const { csrfCookieStr, csrfHeaderValue } = fakeCsrfPair();

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', [`itruck_refresh=invalid.jwt.token`, csrfCookieStr])
        .set('X-CSRF-Token', csrfHeaderValue)
        .expect(200);

      // Should still clear cookies and log out gracefully
      expect(res.body.message).toBe('Logged out');
    });
  });

  // ─────────────────────────────────────────────────────────
  // /me
  // ─────────────────────────────────────────────────────────
  describe('GET /api/auth/me', () => {
    let user;

    beforeEach(async () => {
      user = await User.create(userFactory({ email: 'me@example.com', isVerified: true }));
    });

    test('returns user when authenticated via bearer token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokenFor(user)}`)
        .expect(200);
      expect(res.body.user.email).toBe(user.email);
    });

    test('fails when unauthorized', async () => {
      await request(app).get('/api/auth/me').expect(401);
    });
  });

  // ─────────────────────────────────────────────────────────
  // Sessions
  // ─────────────────────────────────────────────────────────
  describe('GET & DELETE /api/auth/sessions', () => {
    let user;
    let token;

    beforeEach(async () => {
      user = await User.create(
        userFactory({ email: 'sessions@example.com', password: 'TestPassword123!', isVerified: true })
      );
      token = tokenFor(user);
    });

    test('returns empty sessions when no active sessions', async () => {
      const res = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${token}`).expect(200);
      expect(res.body.sessions).toHaveLength(0);
    });

    test('lists active sessions and marks current session', async () => {
      const { refreshCookie } = await loginAs('sessions@example.com', 'TestPassword123!', PRIMARY_DEVICE);

      const res = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${token}`)
        .set('Cookie', [refreshCookie])
        .send({ deviceId: PRIMARY_DEVICE })
        .expect(200);

      expect(res.body.sessions).toHaveLength(1);
      expect(res.body.sessions[0].deviceId).toBe(PRIMARY_DEVICE);
      expect(res.body.sessions[0].isCurrent).toBe(true);
    });

    test('deletes a specific session by id', async () => {
      const { refreshCookie } = await loginAs('sessions@example.com', 'TestPassword123!', PRIMARY_DEVICE);

      const resSessions = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${token}`)
        .set('Cookie', [refreshCookie])
        .expect(200);

      const sessionId = resSessions.body.sessions[0].id;

      const resDel = await request(app)
        .delete(`/api/auth/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(resDel.body.message).toMatch(/revoked/i);

      const resCheck = await request(app).get('/api/auth/sessions').set('Authorization', `Bearer ${token}`).expect(200);
      expect(resCheck.body.sessions).toHaveLength(0);
    });

    test('returns 404 when deleting a non-existent session', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      await request(app).delete(`/api/auth/sessions/${fakeId}`).set('Authorization', `Bearer ${token}`).expect(404);
    });

    test('revokes all other sessions (keeps current)', async () => {
      await loginAs('sessions@example.com', 'TestPassword123!', SECONDARY_DEVICE);
      const { refreshCookie, csrfCookie } = await loginAs('sessions@example.com', 'TestPassword123!', TERTIARY_DEVICE);

      const resRevoke = await request(app)
        .delete('/api/auth/sessions')
        .set('Authorization', `Bearer ${token}`)
        .set('Cookie', [refreshCookie, csrfCookie])
        .expect(200);
      expect(resRevoke.body.message).toContain('other sessions revoked');

      const resSessions = await request(app)
        .get('/api/auth/sessions')
        .set('Authorization', `Bearer ${token}`)
        .set('Cookie', [refreshCookie])
        .expect(200);

      expect(resSessions.body.sessions).toHaveLength(1);
      expect(resSessions.body.sessions[0].deviceId).toBe(TERTIARY_DEVICE);
    });

    test('revokes ALL sessions including current when everywhere=true', async () => {
      await loginAs('sessions@example.com', 'TestPassword123!', PRIMARY_DEVICE);
      const { refreshCookie, csrfCookie } = await loginAs('sessions@example.com', 'TestPassword123!', SECONDARY_DEVICE);

      const res = await request(app)
        .delete('/api/auth/sessions?everywhere=true')
        .set('Authorization', `Bearer ${token}`)
        .set('Cookie', [refreshCookie, csrfCookie])
        .expect(200);
      expect(res.body.message).toContain('All sessions revoked');

      const total = await RefreshToken.countDocuments({ user: user._id, revokedAt: null });
      expect(total).toBe(0);
    });

    test('fails to delete session when unauthenticated', async () => {
      const fakeId = new mongoose.Types.ObjectId().toString();
      await request(app).delete(`/api/auth/sessions/${fakeId}`).expect(401);
    });
  });
});
