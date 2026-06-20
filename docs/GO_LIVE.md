# iTruck Go-Live Checklist

## Product Readiness

- MongoDB-backed records now replace demo memory-mode for live workflows:
  - Auth, users, trucks, bookings, payments, admin stats, documents, and workflow records use MongoDB when connected.
  - `/api/workflow` persists requests, bids, messages, and reports in MongoDB workflow models.
  - React workspace dashboards read bookings, open loads, fleet trucks, and admin stats from API endpoints before falling back to local demo mode.
- Production safeguards now enforce verified owner/truck bidding, delivery-proof-gated completion, approved-proof payment release, and payment-release audit logs.
- LTL booking fields, shared-capacity estimates, and protected marketplace route clustering are available for controlled SME pilots.
- Live tracking now supports owner-scoped single/batch GPS ingestion, offline queueing in the workspace, compressed sync, and booking-room realtime updates for the selected shipment.
- Finish deeper dashboard actions against real API data, including counteroffers, rejection reasons, dispute queues, route preferences, and expanded document review.
- Add production Google Maps integration with a Google Cloud API key.
- Expand shipment proof of delivery into receiver e-signature, cargo-photo evidence trails, and dispute review.
- Add client/owner notification preferences.
- Public and owner fleet listings exclude archived trucks; use the archive endpoint instead of hard-deleting vehicles.

## Infrastructure

- Provision MongoDB and Redis.
- Set production environment variables in `.env.production`.
- Set `NODE_ENV=production`, `LIVE_MODE=true`, and `DEMO_MODE=false`.
- Configure `APP_URL`, `FRONTEND_URL`, and `ALLOWED_ORIGINS`.
- Configure Cloudinary credentials; uploads are required to use cloud storage in live mode.
- Configure at least one real payment provider, one SMS provider, one email provider, and Google Maps keys before running the final go-live check.
- Deploy behind HTTPS using Nginx or a managed host.
- Enable process monitoring and restart policy.

## Security

- Rotate `JWT_SECRET`.
- Use short-lived access tokens with `JWT_ACCESS_EXPIRES=15m` and long-lived refresh cookies with `JWT_REFRESH_EXPIRES=7d`.
- Disable demo memory-mode accounts before public launch.
- Enable request validation on every write route.
- Confirm file upload type and size limits.
- Restrict admin routes to verified admin users only.
- Confirm audit logging for payment release, verification, document review, notification broadcast, and other high-risk admin actions.

## Maps

- Google Maps Embed API is enough for the first public route view.
- Current live tracking displays the latest driver GPS point and syncs updates through backend booking rooms.
- Google Maps JavaScript API is the next step for custom markers, route polylines, geocoding, and live vehicle updates.
- Store the API key server-side or inject it at build/deploy time.

## Payments

- Use sandbox keys until the full payment flow is tested.
- Point Stripe webhooks to `/api/webhooks/stripe` and configure `STRIPE_WEBHOOK_SECRET`.
- Point M-Pesa callbacks to `/api/payments/webhooks/mpesa/stk` and configure `MPESA_WEBHOOK_SECRET`.
- Point MTN MoMo callbacks to `/api/payments/webhooks/mtn/request-to-pay` and configure `MTN_MOMO_WEBHOOK_SECRET`.
- Mobile-money callback URLs automatically include the configured secret as a token; live mode rejects callbacks when authentication is missing or invalid.
- Validate transaction reconciliation against provider sandbox and live callback retries before releasing owner payouts.
- Confirm admin payment release is blocked until booking delivery, collected escrow funds, and approved POD or receiver confirmation are present.
- Send an `Idempotency-Key` header on payment, withdrawal, and release requests so client retries cannot duplicate charges or ledger entries.

## Launch Path

1. Copy `.env.example` to `.env.production` and fill real values.
2. Set `LIVE_MODE=true` and `DEMO_MODE=false`.
3. Set `workspace/.env` with `VITE_DEMO_MODE=false`.
4. Run `npm run live:check`.
5. Run `npm --prefix workspace install` and `npm run app:build`.
6. Run `npm --prefix backend install` and `npm test`.
7. Start with `NODE_ENV=production npm start`.
8. Confirm `/api/health`, `/app`, login, booking, marketplace, and admin routes.
9. Deploy staging behind HTTPS.
10. Test client booking, verified owner bid, LTL estimate, route cluster query, owner live GPS, offline tracking sync, shipper tracking refresh, POD/receiver-confirmation upload, geofence delivery confirmation, payment release, and admin verification.
11. Deploy production.

## Live Mode Behavior

- `LIVE_MODE=true` or `NODE_ENV=production` requires `MONGODB_URI`, `JWT_SECRET`, `FRONTEND_URL`, and Cloudinary credentials.
- `npm run live:check` also requires a configured payment provider, SMS provider, email provider, and maps key.
- In live mode, the API exits if MongoDB cannot connect.
- In live mode, protected routes return `503` instead of serving in-memory demo data if the database is unavailable.
- In live mode, upload routes fail instead of returning mock local URLs if Cloudinary is not configured.
- Login/register issue the existing access token response plus an httpOnly refresh cookie when MongoDB is available.
- Owner bids require approved profile and truck documents in live MongoDB-backed flows.
- Tracking updates require an assigned owner/admin and a confirmed or in-transit booking.
- The workspace queues driver GPS updates offline and syncs compressed batches after connectivity returns.
- Delivery confirmation and generated POD output enforce destination geofence checks when destination coordinates are present.
- Payment release requires approved delivery proof and writes an admin audit log.
- Demo users and demo trucks remain available only for local development when `DEMO_MODE` is not set to `false`.

## Local Demo Mode

Use this only for demos or UI development without a database:

```bash
DEMO_MODE=true npm start
```

For the React workspace demo data:

```bash
cd workspace
echo VITE_DEMO_MODE=true > .env
npm run dev
```
