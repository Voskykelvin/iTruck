# iTruck

iTruck is a logistics marketplace and operations platform for moving cargo across African routes. It connects shippers who need reliable transport with verified truck owners, while giving both sides tools for booking, bidding, tracking, document handling, wallet/payment records, notifications, and trust controls.

The project is currently a launch-prep MVP: it has a working Express/MongoDB backend, a static public frontend, a React operations workspace, production hardening for live mode, Docker/Render deployment assets, and a growing checklist for payments, notifications, and real-world logistics integrations.

## Product Vision

Logistics in many African corridors is fragmented. Shippers often manage transport through phone calls, informal brokers, manual paperwork, delayed proof of delivery, and limited visibility into vehicle or owner reliability. Truck owners face the opposite problem: inconsistent access to high-quality loads, slow document checks, poor payment certainty, and little tooling to present fleet readiness.

iTruck is designed to become a trusted digital operating layer for this market.

Core goals:

- Help shippers create transport requests quickly and compare verified truck options.
- Help truck owners discover available loads, submit bids, and manage fleet readiness.
- Reduce operational friction around waybills, proof of delivery, insurance, cargo photos, and customs paperwork.
- Improve trust with owner KYC, driver identity, vehicle logbooks, insurance status, route history, and admin risk controls.
- Support escrow-style payment workflows so owners and shippers can transact with more confidence.
- Provide a modern mobile-first workspace for teams that work in the field, at depots, and on the road.

## Current Status

This repository contains a functional MVP with both demo-friendly and live-mode behavior.

Implemented:

- Public landing pages and static HTML dashboards.
- React workspace served at `/app`.
- Shipper dashboard, booking form, marketplace, tracking, owner workspace, admin workspace, and profile/verification views.
- Express API for auth, users, trucks, bookings, payments, documents, notifications, uploads, admin metrics, marketplace helpers, workflow records, and Stripe webhooks.
- MongoDB models with production indexes for core records.
- JWT access tokens plus refresh-token cookie support.
- Password hashing with bcrypt.
- Protected API routes with role restrictions.
- Request validation on important write routes.
- Helmet, CORS, NoSQL sanitization, HTTP parameter pollution protection, and rate limiting.
- Optional Redis-backed Socket.io adapter and Redis-backed rate limiter for horizontal scaling.
- Cloudinary upload integration with live-mode enforcement.
- Pino structured logging.
- PDF document generation for waybill, POD, invoice, and customs documents.
- PWA manifest, install icons, service worker caching, and offline fallback page.
- Dockerfile, docker-compose setup, Nginx config, Render config, and GitHub Actions checks.
- Jest/Supertest backend tests.

Still in progress before full business launch:

- Real payment-provider reconciliation for Stripe, M-Pesa, MTN MoMo, and owner payouts.
- Real SMS and email delivery providers.
- Production Google Maps API integration for live route markers and route polylines.
- Deeper admin workflows for bid awards, dispute handling, document review, and payment release.
- Full audit logging for high-risk admin actions.
- Production monitoring, analytics, and incident alerting.

## Tech Stack

### Frontend

- Static HTML, CSS, and JavaScript in `frontend/`.
- React 18 workspace in `workspace/`.
- Vite 5 for workspace development and builds.
- Lucide React icons.
- CSS custom properties for theme tokens.
- Progressive Web App assets through `manifest.json`, icons, and `sw.js`.

### Backend

- Node.js and Express.
- MongoDB with Mongoose.
- Socket.io for realtime transport events.
- Redis support for multi-instance Socket.io and shared rate limits.
- JWT authentication with refresh-token session records.
- bcryptjs for password hashing.
- multer and Cloudinary for file uploads.
- PDFKit for generated logistics documents.
- Stripe webhook route with raw body parsing and signature verification.
- Pino and pino-http for structured logging.
- Jest and Supertest for backend tests.

### Infrastructure

- Dockerfile for containerized deployment.
- docker-compose for local container orchestration.
- Nginx reverse proxy config.
- Render deployment blueprint.
- GitHub Actions for CI checks.

## Repository Structure

```text
.
+-- backend/                 # Express API, models, routes, services, sockets, tests
+-- docs/                    # Deployment and go-live notes
+-- frontend/                # Static public site, static dashboards, PWA files, built React app
|   +-- app/                 # Production build output from workspace/
|   +-- css/                 # Static page styles
|   +-- js/                  # Static page scripts
|   +-- pages/               # Static HTML dashboard pages
+-- nginx/                   # Reverse proxy config
+-- workspace/               # React/Vite source app
+-- Dockerfile               # Production container
+-- docker-compose.yml       # Local compose setup
+-- render.yaml              # Render deployment blueprint
+-- package.json             # Root convenience scripts
```

## Application Surfaces

### Public Website

The public website lives in `frontend/index.html` and related CSS/JS files. It introduces iTruck, routes users into the app, and supports direct static-file browsing for quick visual review.

Static pages include:

- `frontend/pages/book-truck.html`
- `frontend/pages/dashboard-client.html`
- `frontend/pages/dashboard-owner.html`
- `frontend/pages/listings.html`
- `frontend/pages/tracking.html`
- `frontend/pages/profile.html`
- `frontend/pages/admin/admin-dashboard.html`

### React Workspace

The main logged-in workspace lives in `workspace/` and builds into `frontend/app/`.

Express serves it at:

```text
http://localhost:5000/app
```

Workspace routes include:

- `/app/shipper`
- `/app/book`
- `/app/marketplace`
- `/app/tracking`
- `/app/owner`
- `/app/admin`
- `/app/profile`

### Backend API

The API is served from the same Express process under `/api`.

Important route groups:

```text
GET    /api/health
POST   /api/auth/register/owner
POST   /api/auth/register/client
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/trucks
POST   /api/trucks
GET    /api/trucks/fleet

GET    /api/bookings
GET    /api/bookings/open
POST   /api/bookings
POST   /api/bookings/:id/bids
PATCH  /api/bookings/:id/status

GET    /api/payments/wallet
POST   /api/payments/wallet/debit
POST   /api/payments/wallet/credit

GET    /api/documents/waybill/:bookingId
GET    /api/documents/pod/:bookingId
GET    /api/documents/invoice/:bookingId
GET    /api/documents/customs/:bookingId

GET    /api/notifications
GET    /api/notifications/count
PATCH  /api/notifications/:id/read

POST   /api/upload/avatar
POST   /api/upload/cargo

GET    /api/admin/stats
GET    /api/admin/users
GET    /api/admin/trucks
GET    /api/admin/bookings
GET    /api/admin/payments
POST   /api/admin/notify

GET    /api/marketplace/trust
GET    /api/marketplace/localization
POST   /api/marketplace/estimate

GET    /api/workflow
POST   /api/workflow/requests
POST   /api/workflow/bids
POST   /api/workflow/messages
POST   /api/workflow/reports

POST   /api/webhooks/stripe
```

## Local Development

### Prerequisites

- Node.js 18 or newer.
- npm.
- MongoDB for database-backed development.
- Optional Redis if testing shared sockets or shared rate limits.
- Optional Cloudinary account if testing real uploads.

### Install Dependencies

From the repository root:

```bash
npm install
npm --prefix backend install
npm --prefix workspace install
```

### Environment Setup

Copy the example file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

For quick local UI work without a database, keep demo mode enabled or omit `MONGODB_URI`. For database-backed local work, set:

```text
MONGODB_URI=mongodb://localhost:27017/itruck
JWT_SECRET=replace-with-at-least-32-random-characters
DEMO_MODE=false
```

### Run The Full App

Start Express, the API, static frontend, and built React workspace:

```bash
npm start
```

Open:

```text
http://localhost:5000
http://localhost:5000/app
```

### Run The React Workspace In Vite

```bash
npm run app:dev
```

Vite will print the local workspace URL. This is useful for rapid React UI work.

### Build The React Workspace

```bash
npm run app:build
```

This builds `workspace/` into `frontend/app/`, which is what Express serves at `/app`.

### Seed Demo Data

Use the destructive seed only for local development databases:

```bash
npm run seed
```

Use the safe upsert installer when you do not want to wipe existing records:

```bash
npm --prefix backend run install:users
```

Demo admin:

```text
admin@itruck.africa
Admin2025!
```

Demo owners and clients use:

```text
Demo2025!
```

## Scripts

Root scripts:

```text
npm start          # Start backend server
npm run dev        # Start backend with nodemon
npm run app:dev    # Start React workspace with Vite
npm run app:build  # Build React workspace into frontend/app
npm run build      # Alias for workspace build
npm run seed       # Seed local demo data
npm test           # Run backend tests
npm run live:check # Validate required live environment variables
npm run docker:up  # Start docker-compose services
```

Backend scripts:

```text
npm --prefix backend start
npm --prefix backend run dev
npm --prefix backend test
npm --prefix backend run seed
npm --prefix backend run install:users
npm --prefix backend run live:check
```

Workspace scripts:

```text
npm --prefix workspace run dev
npm --prefix workspace run build
npm --prefix workspace run preview
```

## Testing

Run backend tests:

```bash
npm test
```

The current Jest/Supertest suite covers important API behavior around:

- Authentication.
- Bookings.
- Payments.
- Notifications.

Before a live deploy, also run:

```bash
npm run app:build
npm run live:check
```

## Demo Mode vs Live Mode

iTruck supports a local demo-friendly mode and a stricter live mode.

### Demo Mode

Demo mode is useful for UI development, product walkthroughs, and local testing without a database.

In demo/local mode:

- The backend can start without MongoDB.
- Some routes can use limited in-memory fallback data.
- Upload services may return mock local URLs if Cloudinary is not configured.
- The React workspace can fall back to local demo records.

### Live Mode

Live mode is intended for staging and production.

Enable it with:

```text
NODE_ENV=production
LIVE_MODE=true
DEMO_MODE=false
```

In live mode:

- `MONGODB_URI` is required.
- `JWT_SECRET` is required.
- `FRONTEND_URL` or `ALLOWED_ORIGINS` is required.
- Cloudinary credentials are required.
- The server exits if MongoDB is not available at startup.
- Protected routes return service errors instead of silently using memory fallback data.
- Upload routes fail if Cloudinary is not configured.

## Environment Variables

Core live variables:

```text
NODE_ENV=production
LIVE_MODE=true
DEMO_MODE=false
PORT=5000
MONGODB_URI=mongodb+srv://USER:PASSWORD@HOST/itruck
JWT_SECRET=replace-with-at-least-32-random-characters
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
JWT_EXPIRES=7d
FRONTEND_URL=https://your-domain.example
APP_URL=https://your-domain.example
ALLOWED_ORIGINS=https://your-domain.example
REFRESH_COOKIE_SAMESITE=none
LOG_LEVEL=info
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```

Optional integrations:

```text
REDIS_URL=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
MPESA_CONSUMER_KEY=
MPESA_CONSUMER_SECRET=
AFRICASTALKING_USERNAME=
AFRICASTALKING_API_KEY=
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
```

Frontend workspace variables:

```text
VITE_DEMO_MODE=false
VITE_API_BASE=https://your-domain.example/api
```

## Security And Production Readiness

The backend includes several protections that are important before exposing the app publicly:

- Helmet security headers.
- CORS configuration with credential-safe origin handling.
- Express JSON body limits.
- NoSQL injection sanitization through `express-mongo-sanitize`.
- HTTP parameter pollution protection through `hpp`.
- Rate limiting for API and auth routes.
- Redis-backed rate limit option for multi-instance deployments.
- Protected routes with JWT authentication.
- Role restrictions for owner and admin operations.
- Refresh token persistence and logout revocation support.
- Production error masking.
- Atomic wallet debit logic to avoid double-spend race conditions.
- Mongoose indexes on high-traffic query fields.
- Cloudinary-only uploads in live mode.
- Stripe webhook signature verification using raw request bodies.
- Pino structured logging.

Security work still recommended before public scale:

- Full audit logs for admin actions.
- Real provider webhooks for M-Pesa and MTN MoMo with signature validation.
- More request schemas across every write route.
- Fine-grained authorization on each booking, document, and payment transition.
- Secret rotation and environment-specific deployment credentials.

## Deployment

See the detailed guides:

- [Go-Live Checklist](docs/GO_LIVE.md)
- [Backend Deployment Guide](docs/DEPLOY_BACKEND.md)

Typical managed-host flow:

1. Provision MongoDB Atlas.
2. Provision Cloudinary.
3. Provision Redis if running multiple instances.
4. Set the live environment variables in the host dashboard.
5. Build the React workspace.
6. Run backend tests.
7. Run the live environment check.
8. Deploy the Node/Express service.
9. Verify `/api/health`.
10. Verify login, booking, marketplace, owner, admin, upload, and document flows.

Render-compatible settings:

```text
Build Command: npm install && npm --prefix backend install && npm --prefix workspace install && npm run app:build
Start Command: npm start
Health Check Path: /api/health
```

## Docker

Build the image:

```bash
npm run docker:build
```

Run with compose:

```bash
npm run docker:up
```

View logs:

```bash
npm run docker:logs
```

Stop:

```bash
npm run docker:down
```

## PWA Behavior

The frontend includes installability and offline support:

- `frontend/manifest.json` defines the app name, colors, display mode, and icons.
- `frontend/assets/icon-192.png` and `frontend/assets/icon-512.png` support home-screen installation.
- `frontend/sw.js` precaches important assets and serves `frontend/offline.html` for offline navigation fallback.

## Business Model Direction

iTruck can support several revenue paths as the platform matures:

- Commission on completed shipments.
- Subscription plans for fleet owners who want more load access or advanced tools.
- Premium verification for trucks, owners, and drivers.
- Escrow/payment handling fees.
- Document automation fees for waybills, customs packs, invoices, and PODs.
- Route intelligence, fleet performance reports, and enterprise shipper dashboards.

The MVP is built around the workflows needed to support these models: booking, bidding, trust checks, documents, tracking, payments, notifications, and admin review.

## Project Origin

This reconstruction was built from:

- `i truck kevin - Google Drive.pdf`
- `iTruck-Project-Reference (5).md`

The PDF extraction contained a mix of source-like code and rendered page text. This project is therefore a runnable reconstruction aligned with the project reference and product goals, not a byte-for-byte restoration of every original snippet.

## Recommended Next Steps

Highest-value next engineering tasks:

1. Connect real payment providers and reconciliation.
2. Replace email/SMS stubs with production providers.
3. Complete bid award, payment release, and dispute workflows.
4. Add full document upload and review states for KYC, insurance, logbooks, cargo photos, and proof of delivery.
5. Add production maps with live vehicle positions.
6. Add admin audit logging.
7. Expand tests around authorization, wallet transactions, uploads, and booking state transitions.

Highest-value go-to-market tasks:

1. Launch a controlled pilot with a small set of verified owners and shippers.
2. Focus on one or two high-value corridors before expanding.
3. Track fill rate, bid response time, completed delivery rate, dispute rate, and payment release time.
4. Use early shipment data to improve pricing, route risk, and owner trust scoring.
