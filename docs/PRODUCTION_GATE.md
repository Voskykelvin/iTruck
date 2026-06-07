# Production Gate

This checklist is the final stop before treating the structure as frozen.

## Local Gate

Run from the repository root:

```bash
npm ci
npm ci --prefix backend
npm ci --prefix workspace
npm run ci:check
npm --prefix backend audit --omit=dev
```

Expected result:

- Lint passes.
- Prettier check passes.
- Backend tests pass.
- Workspace build writes `frontend/app`.
- Backend production dependency audit reports no vulnerabilities.

The workspace audit can report Vite/esbuild dev-server advisories. Those do not ship in the production build, but they should still be revisited when upgrading Vite is low-risk.

## Staging Gate

Deploy with live-mode settings:

- `NODE_ENV=production`
- `APP_MODE=live` or `LIVE_MODE=true`
- `DEMO_MODE=false`
- `MONGODB_URI`
- `JWT_SECRET` with at least 32 random characters
- `FRONTEND_URL`
- `ALLOWED_ORIGINS`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `REDIS_URL` if running more than one instance or using shared rate limits
- `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, or equivalent M-Pesa/MTN MoMo live credentials
- `AFRICASTALKING_API_KEY` and `AFRICASTALKING_USERNAME`, or a custom `SMS_PROVIDER_MODULE`
- `EMAIL_PROVIDER_MODULE`, `SENDGRID_API_KEY`, or `RESEND_API_KEY`
- `GOOGLE_MAPS_API_KEY` or `VITE_GOOGLE_MAPS_API_KEY`

Run:

```bash
npm run live:check
```

Then verify:

- `/api/health` returns `200`.
- Unknown `/api/*` paths return JSON `404`.
- `/app` loads the React workspace.
- Nginx serves `/app` with SPA fallback, forwards `/api` and `/socket.io`, sends security headers, and does not cache `/sw.js`.
- The container image runs the backend as the non-root `node` user.
- A staged frontend deployment shows the update prompt when a new service worker is waiting.
- Register, login, refresh, logout, and session revocation work with secure cookies.
- Owner can create a truck but cannot self-verify it.
- Owner can archive a truck and archived trucks no longer appear in public/fleet listings.
- Admin can verify the truck and review user/truck documents.
- Shipper can create a booking.
- Unverified owners, owners missing required documents, and unverified trucks cannot submit production bids.
- Verified owner can submit a bid only with an approved, available truck.
- Shipper can accept a bid.
- Owner/admin can move booking status through the allowed state machine.
- Shipper/admin can confirm delivery only after POD or receiver confirmation is uploaded.
- Delivery confirmation and generated POD output respect the destination geofence when destination coordinates are present.
- LTL booking creation stores cargo weight, reserved capacity, consolidation eligibility, and route key metadata.
- `GET /api/marketplace/clusters` returns authenticated lane-level LTL consolidation summaries without exposing individual shipper records.
- Stripe webhook signature verification succeeds and reconciles a test payment into a booking payment status.
- Admin payment release is blocked until delivery, escrowed funds, and approved POD or receiver confirmation are present.
- Admin payment release credits the owner wallet once and records an audit log.
- Repeating a payment, withdrawal, or release request with the same `Idempotency-Key` does not create duplicate ledger entries.
- Documents generate only for users who can see the booking.
- Notifications only mark current-user records as read.
- Uploads reject unsupported file types and store allowed files.

## External Gates

These are not complete until verified against real services:

- MongoDB Atlas backups, restore test, and index build status.
- Render or hosting rollback path.
- Cloudinary upload and document caching.
- Stripe dashboard webhook delivery and retries.
- Error monitoring/alerting destination.
