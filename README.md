# iTruck

iTruck is a full-stack logistics platform for shippers, fleet owners, drivers, and operations teams. The application covers booking, bidding, fleet and driver management, shipment workflows, documents, messaging, delivery proof, wallets, notifications, and administration.

## Architecture

- `workspace/` — React 18 single-page application built with Vite and TanStack Query.
- `backend/` — Express API, Socket.IO, MongoDB/Mongoose models, and provider integrations.
- `frontend/` — generated production build output; ignored by Git and recreated by `npm run build`.
- `docs/` — active operational, production, provider, and legal documentation.
- `scripts/` — deployment rehearsal, load, Docker, and launch checks.
- `nginx/` — optional reverse proxy for the container stack.

The Vite application builds directly into `frontend/`. Express serves that directory and falls back to `frontend/index.html` for browser routes. API routes remain under `/api`.

## Requirements

- Node.js 20.19 or newer (Node 22 recommended)
- npm 10
- MongoDB for persistent/live operation
- Redis for multi-instance rate limiting, Socket.IO fan-out, and coordinated background work

## Install

```bash
npm install
npm install --prefix backend
npm install --include=dev --include=optional --prefix workspace
```

Copy `.env.example` to `.env` and replace every production placeholder. Never commit environment files or credentials.

## Development

Run the API:

```bash
npm run dev
```

Run Vite in another terminal:

```bash
npm run app:dev
```

Vite proxies `/api` and `/socket.io` to `http://127.0.0.1:5000`.

To run the production-shaped application locally:

```bash
npm run build
npm start
```

Then open `http://127.0.0.1:5000`.

## Quality Checks

```bash
npm run lint
npm run format:check
npm test
npm run test:frontend
npm run app:build
```

Run the complete CI gate with:

```bash
npm run ci:check
```

Browser tests build the frontend and start the backend automatically:

```bash
npm run test:e2e
```

Additional release checks include `npm run docker:verify`, `npm run staging:rehearse`, `npm run launch:audit`, and `npm run live:check`.

## Main Routes

Public routes:

- `/` — product site
- `/login` and `/register` — authentication
- `/privacy` and `/terms` — legal notices

Authenticated routes are under `/app` and protected by role:

- Shippers: dashboard, booking, marketplace, shipments, documents, wallet, messages, and settings
- Owners: dashboard, load board, fleet, drivers, shipments, documents, wallet, messages, and verification
- Drivers: assigned shipments, documents, messages, and settings
- Admins: operations console and authorized cross-role workflows

## Runtime Modes

Demo/development mode can use in-memory fallbacks where supported. Live mode (`LIVE_MODE=true`, `DEMO_MODE=false`) requires persistent infrastructure and configured providers. Run `npm run live:check` before starting a production release.

At minimum, live deployments require secure MongoDB, JWT and delivery-OTP secrets, allowed origins, Cloudinary, and the integrations used by the selected payment, messaging, email, and maps flows. See `.env.example` for the current configuration contract.

## Deployment

`render.yaml` defines the hosted service. `Dockerfile` builds the React application in a separate stage and copies its generated output into the non-root backend image. `docker-compose.yml` provides the application, MongoDB, Redis, and optional Nginx reverse proxy.

Before deployment, follow [Production Gate](docs/PRODUCTION_GATE.md), [Operations Runbook](docs/OPERATIONS_RUNBOOK.md), and [Rollback Runbook](docs/ROLLBACK_RUNBOOK.md).

Provider onboarding and backup procedures are documented in [Provider Certification](docs/PROVIDER_CERTIFICATION.md) and [Backup/Restore Runbook](docs/BACKUP_RESTORE_RUNBOOK.md).

## Legal Status

The included [Privacy Notice](docs/PRIVACY.md) and [Terms of Service](docs/TERMS.md) are implementation drafts. They require qualified local legal review and jurisdiction-specific details before launch.
