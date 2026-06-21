# Production Gate

This checklist is the final stop before treating the structure as frozen.

## Local Gate

Run from the repository root:

```bash
npm ci
npm ci --prefix backend
npm ci --include=dev --prefix workspace
npm run ci:check
npm --prefix backend audit --omit=dev
npm --prefix workspace audit --omit=dev
```

Expected result:

- Lint passes.
- Prettier check passes.
- Backend tests pass.
- Workspace build writes `frontend/app`.
- Backend and workspace production dependency audits report no vulnerabilities.

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
- `EMAIL_PROVIDER_MODULE`, or `EMAIL_FROM` plus `SENDGRID_API_KEY`, `RESEND_API_KEY`, `SMTP_URL`, or SMTP host
  credentials
- `GOOGLE_MAPS_API_KEY` for server-side geocoding/routes
- `GOOGLE_MAPS_BROWSER_KEY` restricted to production web origins, plus `GOOGLE_MAPS_MAP_ID`

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
- Changing a password revokes existing refresh sessions.
- Concurrent expired-access-token requests trigger one refresh operation and recover without signing the user out.
- Unauthenticated Socket.IO clients are rejected.
- Authenticated users cannot join booking rooms they cannot access.
- Owner can create a truck but cannot self-verify it.
- Owner can archive a truck and archived trucks no longer appear in public/fleet listings.
- Public truck responses omit owner identity, registration number, chassis number, and document records.
- Admin can verify the truck and review user/truck documents.
- Admin cannot approve a document that has no uploaded or generated evidence.
- Shipper can create a booking.
- Unverified owners, owners missing required documents, and unverified trucks cannot submit production bids.
- Verified owner can submit a bid only with an approved, available truck.
- Shipper can accept a bid.
- Owner/admin can move booking status through the allowed state machine.
- Assigned owner/admin can post single and batch tracking updates only for confirmed or in-transit bookings.
- Owner workspace GPS tracking starts/stops from the selected job and queues points while offline.
- Shipper tracking view receives `tracking-updated` booking-room events without refreshing.
- Shipper/admin can confirm delivery only after POD or receiver confirmation is uploaded.
- Delivery confirmation and generated POD output respect the destination geofence when destination coordinates are present.
- LTL booking creation stores cargo weight, reserved capacity, consolidation eligibility, and route key metadata.
- `GET /api/marketplace/clusters` returns authenticated lane-level LTL consolidation summaries without exposing individual shipper records.
- Stripe webhook signature verification succeeds and reconciles a test payment into a booking payment status.
- M-Pesa/MTN callback endpoints reject missing or invalid callback tokens and accept the configured token.
- A repeated or out-of-order M-Pesa callback cannot regress a completed payment, and amount mismatches remain unreconciled.
- Application and bundled Nginx request logs redact or omit mobile-money callback tokens.
- Admin payment release is blocked until delivery, escrowed funds, and approved POD or receiver confirmation are present.
- Admin payment release credits the owner wallet once and records an audit log.
- Repeating a payment, withdrawal, or release request with the same `Idempotency-Key` does not create duplicate ledger entries.
- Documents generate only for users who can see the booking.
- Notifications only mark current-user records as read.
- Support cases expose internal comments only to admins.
- Formal disputes hold the booking and only case resolution can resume, cancel, or confirm it.
- Funded dispute cancellations require the `refund_required` outcome and remain `refund_pending` until provider
  reconciliation completes.
- SLA breach scans escalate once per breach type, and solved cases auto-close after the configured window.
- Uploads reject unsupported or MIME-spoofed file types and store allowed files.
- Local/demo upload URLs are not served in live mode.

## External Gates

These are not complete until verified against real services:

- MongoDB Atlas backups, restore test, and index build status.
- Render or hosting rollback path.
- Cloudinary upload and document caching.
- Stripe dashboard webhook delivery and retries.
- Africa's Talking SMS delivery from real booking events.
- Resend, SendGrid, or SMTP delivery from real booking events.
- Routing/geocoding accuracy, ETA behavior, quota controls, and key restrictions.
- Background worker activity on the deployed topology, including retry timing and one active operational-scan lease.
- Provider delivery receipts and bounce/failure callbacks when those integrations are added.
- Live support staffing, SLA target acceptance, escalation routing, and refund-required case reconciliation.
- Error monitoring/alerting destination.
