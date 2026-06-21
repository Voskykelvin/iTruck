# Engineering Audit — June 21, 2026

## Verified State

- Clean installs pass for the root, backend, and React workspace lockfiles.
- `npm run ci:check` passes:
  - ESLint
  - Prettier
  - 14 Jest suites and 122 tests
  - Vite production build
- Backend and frontend dependency audits report zero known vulnerabilities.
- Demo runtime smoke checks pass for:
  - health endpoint
  - client login
  - complete client registration
  - authenticated booking list
  - document list
  - React SPA fallback
  - direct-backend CSP and Permissions Policy headers
- Frontend dead-export and dependency analysis is clean.

## Improvements Completed

- Repaired lockfiles that previously failed `npm ci`.
- Upgraded Multer to the patched 2.x line and added safe upload-limit errors.
- Patched the test dependency tree against `CVE-2026-53550` through `js-yaml` 4.2.0.
- Added working Resend, SendGrid, and SMTP email providers.
- Aligned go-live email validation with the providers the application actually supports.
- Completed the React registration form contract for phone, country, country code, and device ID.
- Removed the exposed but unimplemented Google sign-in flow.
- Removed duplicate service-worker registration and its conflicting update behavior.
- Added CSP and Permissions Policy headers to direct Node deployments and tightened the Nginx CSP.
- Removed unused frontend API wrappers and exports.

## Remaining Path Toward Higher Assurance

The application is materially stronger, but “100%” cannot honestly be claimed without live infrastructure and broader
coverage.

1. Increase backend coverage from the current baseline:
   - statements: 56.16%
   - branches: 39.65%
   - functions: 56.95%
   - lines: 60.95%
   - prioritize authentication persistence, admin actions, workflow routes, document synchronization, webhooks, and
     provider failure paths.
2. Add browser end-to-end tests for shipper, owner, and admin journeys using Playwright or Cypress.
3. Run integration tests against disposable MongoDB and Redis instances in CI.
4. Validate real sandbox credentials for Cloudinary, Stripe or mobile money, Africa's Talking, email, and maps.
5. Decompose `workspace/src/App.jsx` into route-level modules and feature components before adding major UI features.
6. Plan major dependency migrations separately:
   - Express 5
   - React 19
   - Mongoose 9
   - Redis 6
   - Stripe SDK 22
   These are intentionally not mixed into this reliability pass because each carries behavior or API changes.
7. Build and smoke-test the Docker image on a machine with Docker available. Docker was not installed in this audit
   environment.

Use `npm run test:coverage` to reproduce the coverage baseline and `npm run live:check` after production credentials are
configured.
