# Wave 2: Drivers, Security, and Testing

## Driver operations

- Fleet owners invite drivers through expiring, single-use links.
- Drivers receive first-class accounts without public driver registration.
- One active driver-to-truck assignment is enforced per driver and truck.
- Confirmed bookings inherit the truck's assigned driver; owners can also assign an eligible driver explicitly.
- Drivers can access only assigned bookings, GPS tracking, messages, documents, cases, dispatch stops, and receiver
  proof workflows.

## Security and assurance

- Browser access and refresh tokens use HttpOnly cookies.
- A readable CSRF cookie must match the `X-CSRF-Token` header for cookie-authenticated mutations.
- Bearer tokens remain supported for trusted API integrations and automated tests.
- Successful authenticated mutations create actor-aware audit records.
- Wallet credit, debit, and withdrawal records use MongoDB transactions when the topology supports them.

## Test and maintainability changes

- Vitest covers frontend role policy and production route decoding.
- Playwright verifies the production bundle in Chromium and confirms access tokens never enter local storage.
- GitHub Actions provisions real MongoDB and Redis services for integration checks.
- Driver management, invitation acceptance, production maps, and role policy moved out of `App.jsx`.
