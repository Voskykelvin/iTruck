# iTruck Deployment Guide

## Pre-Deployment Checklist

### 1. Environment Variables

Before deploying, ensure all production secrets are configured:

**Critical (no fallback):**

- [ ] `MONGODB_URI` — Production MongoDB connection string
- [ ] `JWT_SECRET` — Strong 32+ character secret ✅ Already set
- [ ] `FRONTEND_URL` — Your production domain (e.g., https://itruck.africa)
- [ ] `CLOUDINARY_*` — Image upload credentials ✅ Already configured

**Optional (has fallback, required for Phase 2):**

- [ ] `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` — Payment processing
- [ ] `AFRICASTALKING_*` or `SMS_PROVIDER_MODULE` — SMS notifications
- [ ] `EMAIL_FROM` plus `RESEND_API_KEY`, `SENDGRID_API_KEY`, or SMTP credentials; alternatively use
      `EMAIL_PROVIDER_MODULE` — Email confirmations and password resets
- [ ] `GOOGLE_MAPS_API_KEY` — Server-side geocoding and road routes
- [ ] `GOOGLE_MAPS_BROWSER_KEY` and `GOOGLE_MAPS_MAP_ID` — Referrer-restricted live map rendering
- [ ] `REDIS_URL` — Caching & rate limiting

### 2. Code Readiness

- [ ] Backend tests passing: `npm.cmd --prefix backend test` - 165 tests pass
- [ ] Code linting: `npm run lint` ✅ Passes
- [ ] Build artifacts generated: `npm run app:build` ✅ In `frontend/app/`
- [ ] No `DEMO_MODE` in production code

Current backend verification: `npm.cmd --prefix backend test` passes with 165 tests.

### 3. Database Setup

```bash
# Connect to your production MongoDB
# Create indexes:
node backend/scripts/install-users.js  # (optional: seed local admin)
```

### 4. Security Review

- [ ] HTTPS/TLS enabled on domain
- [ ] CORS properly configured (`ALLOWED_ORIGINS`)
- [ ] Rate limiting enabled (Nginx config included)
- [ ] Content Security Policy headers active (Nginx config)
- [ ] JWT secret is strong ✅
- [ ] No demo credentials in production

---

## Deployment Options

### Option A: Render.com (Recommended for first deploy)

**Advantages:**

- Zero-config Docker support
- Built-in MongoDB database option
- Free tier available for testing
- Auto-deploys from Git

**Steps:**

1. Push your code to GitHub
2. Create new Web Service on Render.com
3. Connect GitHub repo
4. Render uses `render.yaml` — it already has:
   - Build command ✅
   - Start command ✅
   - All env var placeholders ✅
5. Add secrets in Render dashboard for `sync: false` vars (MONGODB_URI, JWT_SECRET, etc.)
6. Deploy!

**Set these in Render dashboard:**

```
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/itruck
JWT_SECRET=paste-a-strong-32-character-secret
FRONTEND_URL=https://your-app.onrender.com
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
ALLOWED_ORIGINS=https://your-app.onrender.com
```

### Option B: Docker + Self-Hosted / VPS

**Using the included Dockerfile:**

```bash
# Build image
docker build -t itruck:latest .

# Run with env file
docker run -p 5000:5000 --env-file .env.production itruck:latest
```

**With docker-compose (production):**
Create `docker-compose.production.yml`:

```yaml
version: '3.8'
services:
  app:
    build: .
    ports: ['5000:5000']
    env_file: .env.production
    depends_on: [mongo, redis]
  mongo:
    image: mongo:7
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: ${DB_PASSWORD}
  redis:
    image: redis:7-alpine
  nginx:
    image: nginx:alpine
    ports: ['80:80', '443:443']
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./frontend:/usr/share/nginx/html:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro # SSL certificates
```

### Option C: Heroku / Railway / Fly.io

Same process as Render — connect repo, set secrets, deploy.

---

## Post-Deployment Verification

### 1. Health Check

```bash
curl https://your-domain.example/api/health
# Should return 200 with status
```

### 2. Frontend Loads

```bash
curl https://your-domain.example/app/
# Should return React app HTML
```

### 3. Authentication Works

```bash
# Try login with a test account
# Or register new shipper/owner
```

### 4. Image Upload Works

```bash
# Create a truck listing with photo
# Verify image appears from Cloudinary
```

### 5. Production Safeguards Work

- Verify unapproved owners or trucks cannot bid.
- Verify POD or receiver confirmation is required before delivery completion.
- Verify destination geofence enforcement when a booking has destination coordinates.
- Verify admin payment release requires delivery, escrow, and approved delivery proof.
- Verify LTL estimate and authenticated marketplace cluster routes respond.
- Verify owner live tracking accepts single/batch GPS updates only for assigned confirmed or in-transit jobs.
- Verify the shipper tracking page receives live booking-room location updates without refresh.

### 6. Check Logs

```bash
# On Render: Dashboard > Logs
# On Docker: docker logs <container_id>
# Look for errors, warnings, startup messages
```

---

## Common Issues & Fixes

**"DEMO_MODE is not disabled"**
→ Ensure `DEMO_MODE=false` in env vars, not just code

**"Cloudinary upload fails"**
→ Check API Key is correct (you just added it ✅)
→ Verify file size < 12MB (configured in Nginx)

**"Can't connect to MongoDB"**
→ Check `MONGODB_URI` is reachable from server
→ Verify IP whitelist allows your server
→ Try connecting from local: `mongosh "mongodb+srv://..."`

**"JWT validation fails"**
→ Ensure same `JWT_SECRET` on all replicas
→ Check token expiry: `JWT_EXPIRES=7d`

**"CORS errors on frontend"**
→ Add your domain to `ALLOWED_ORIGINS`
→ Check Nginx CSP header allows the domain

---

## Rollback Plan

If deployment fails:

1. **Keep previous version tagged in Git**

   ```bash
   git tag -a v1.0-prod -m "First production release"
   git push origin v1.0-prod
   ```

2. **Revert on Render:**
   - Go to Render dashboard → Deployments
   - Select previous deployment → Redeploy

3. **Revert on Docker:**
   ```bash
   docker run -p 5000:5000 --env-file .env.production itruck:previous-tag
   ```

---

## Monitoring & Maintenance

### Daily

- Check error logs for crashes
- Monitor API response times (< 500ms target)
- Spot-check user registrations & bookings working

### Weekly

- Review database growth
- Check payment/SMS provider status pages
- Backup MongoDB

### Monthly

- Rotate JWT_SECRET (update in all replicas)
- Review security logs
- Update dependencies for patches

---

## Soft Launch Recommendations

**Phase 1: Closed Beta (Week 1)**

- Deploy to production with real domain
- Test with 10-20 internal users (team, friends, trusted partners)
- Fix bugs, iterate
- **Do NOT advertise yet**

**Phase 2: Limited Release (Week 2)**

- Open registration to specific country/region only
- Monitor for edge cases
- Prepare customer support

**Phase 3: Public Launch (Week 3+)**

- Enable all markets
- Marketing campaign
- Scale infrastructure if needed

---

## Your Status Right Now ✅

```
Code:          ✅ Ready (all tests pass)
Cloudinary:    ✅ Configured
JWT Secret:    ✅ Strong secret set
Environment:   🟡 Ready (needs domain + MongoDB)
Deployment:    🟡 Ready (Render.yaml configured)
```

Safeguards status: verified bidding, POD/geofence, payment release, LTL foundations, and tracking authorization are covered by backend tests.

**Next step:** Get MongoDB URI + domain, then deploy to Render in 10 minutes.
