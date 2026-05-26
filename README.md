# iTruck

Africa's premium logistics platform connecting shippers with truck owners across the continent.

This reconstruction was built from:

- `i truck kevin - Google Drive.pdf`
- `iTruck-Project-Reference (5).md`

## Structure

- `frontend/` - static HTML, CSS, and JavaScript pages
- `backend/` - Express API, Mongoose models, routes, services, socket layer, tests
- `nginx/` - production reverse proxy config
- `.github/workflows/` - CI and PR checks
- `Dockerfile` and `docker-compose.yml` - container setup

## Run Locally

Install backend dependencies:

```bash
cd backend
npm install
```

Start the API and static frontend:

```bash
npm start
```

Then open:

```text
http://localhost:5000
```

## Navigation Modes

The static HTML pages in `frontend/` use relative links, so `frontend/index.html`
can be opened directly from disk for quick visual checks. In that mode, the
homepage links route to `frontend/pages/*.html`.

The React workspace is a server-served app and should be opened through Express:

```text
http://localhost:5000/app
```

## React Workspace

The public homepage remains static in `frontend/`. The app workspace lives in `workspace/` and builds into `frontend/app` so Express can serve it at:

```text
http://localhost:5000/app
```

Install and build the workspace:

```bash
cd workspace
npm install
npm run build
```

From the repo root you can also run:

```bash
npm run app:dev
npm run app:build
```

## Seed Demo Data

With MongoDB running:

```bash
cd backend
npm run seed
```

To install or refresh demo users without deleting existing records:

```bash
cd backend
npm run install:users
```

Demo admin:

```text
admin@itruck.africa
Admin2025!
```

Demo clients and owners use:

```text
Demo2025!
```

## Notes

The PDF extraction contained a mix of source-like code and rendered page text. This project is therefore a runnable reconstruction aligned with the reference map, not a byte-for-byte restoration of every original snippet.

## Going Live

See [docs/GO_LIVE.md](docs/GO_LIVE.md) for the launch checklist.
See [docs/DEPLOY_BACKEND.md](docs/DEPLOY_BACKEND.md) for backend deployment steps.
