# iTruck Backend Deployment Guide

This guide moves the backend from local demo mode to live mode.

## 1. Provision MongoDB Atlas

1. Create a MongoDB Atlas cluster.
2. Create a database user with read/write permissions.
3. Add your deployment host to the Atlas IP access list.
   - For managed hosts with changing outbound IPs, `0.0.0.0/0` can unblock launch testing.
   - Prefer a fixed outbound IP or private networking before serious production traffic.
4. Copy the Atlas connection string and set it as `MONGODB_URI`.

## 2. Configure Cloudinary

Live uploads require Cloudinary. Without it, local development returns mock upload URLs, but live mode now refuses to start without Cloudinary credentials.

Set:

```text
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

## 3. Set Live Environment Variables

Required:

```text
NODE_ENV=production
LIVE_MODE=true
DEMO_MODE=false
MONGODB_URI=mongodb+srv://...
JWT_SECRET=<at-least-32-random-characters>
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
JWT_EXPIRES=7d
FRONTEND_URL=https://your-domain.example
ALLOWED_ORIGINS=https://your-domain.example
REFRESH_COOKIE_SAMESITE=none
LOG_LEVEL=info
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Recommended when running more than one backend instance:

```text
REDIS_URL=redis://...
```

`REDIS_URL` enables shared Socket.io rooms and shared API/auth rate-limit counters across instances.

Optional payment webhook settings:

```text
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Stripe webhook notifications should point to:

```text
https://your-backend-domain.com/api/webhooks/stripe
```

The Stripe webhook route uses raw request bodies and rejects requests without a valid `stripe-signature`.

Check them before deploy:

```bash
npm run live:check
```

## 4. Deploy On Render

Use `render.yaml` from the repo root or create a Web Service manually.

Manual settings:

```text
Runtime: Node
Build Command: npm install && npm --prefix backend install && npm --prefix workspace install && npm run app:build
Start Command: npm start
Health Check Path: /api/health
```

Add the required environment variables in Render's Environment tab.

## 5. Seed Production Safely

Do not run `npm run seed` against a database with real users. It deletes existing users and trucks.

Use the safe upsert script:

```bash
npm run install:users
```

You can run this on the server, or locally with `.env.production` pointing at Atlas.

## 6. Verify

After deploy:

```text
https://your-backend-domain.com/api/health
```

Then verify:

- Login with the production admin.
- Create a client booking.
- Add an owner truck.
- Upload an avatar or cargo image and confirm the URL is Cloudinary-hosted.
- Confirm protected routes do not serve demo memory data when MongoDB is unavailable.

## 7. Still Stubbed After Backend Launch

These services are deployment-ready structurally but not yet business-live:

- Email templates currently log/queue through the stub service.
- SMS/OTP currently uses simple generated OTP helpers.
- Payment providers include wallet behavior and provider shells. Stripe webhook signature verification is wired, but real Stripe/M-Pesa/MTN reconciliation still needs integration.
