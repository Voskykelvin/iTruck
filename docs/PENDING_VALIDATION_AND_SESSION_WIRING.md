# Pending Validation and Session Wiring Notes

Date noted: 2026-06-01

This note captures two proposed change batches from downloaded files. Both batches have now been implemented in adapted form. Treat the downloaded files as historical integration references, not drop-in code.

## Source Files

Validation batch:

- `C:\Users\PC\Downloads\files\common.js`
- `C:\Users\PC\Downloads\files\auth.js`
- `C:\Users\PC\Downloads\files\bookings.js`
- `C:\Users\PC\Downloads\files\trucks.js`
- `C:\Users\PC\Downloads\files\payments-and-rest.js`
- `C:\Users\PC\Downloads\files\WIRING.md`

Device/session batch:

- `C:\Users\PC\Downloads\files (1)\RefreshToken.js`
- `C:\Users\PC\Downloads\files (1)\auth.handlers.js`
- `C:\Users\PC\Downloads\files (1)\auth.routes.js`
- `C:\Users\PC\Downloads\files (1)\deviceParser.js`
- `C:\Users\PC\Downloads\files (1)\deviceId.js`
- `C:\Users\PC\Downloads\files (1)\api.js`
- `C:\Users\PC\Downloads\files (1)\SessionsManager.jsx`

## Batch 1: Centralized Validators

Implemented on 2026-06-01 in an adapted form.

The intended structure is a new `backend/validators/` folder with one file per domain. The schemas are plain `express-validator` middleware arrays and should be wired before the existing `validate` middleware.

High-value parts:

- Move inline schemas out of route files.
- Add missing param validation for ID-based routes.
- Add query validation for list/filter routes.
- Add validation coverage for workflow, documents, notifications, marketplace, and users where currently thin.
- Prevent bad ObjectId strings from becoming Mongoose CastErrors.

Current-repo caveats:

- `backend/middleware/validate.js` currently exports the function directly with `module.exports = validate`; the downloaded `WIRING.md` assumes `module.exports = { validate }`.
- Current `validate.js` returns `400`; the downloaded wiring recommends `422`. Either choice is fine, but tests and frontend error handling should match.
- Current `auth.js` already has inline `registerValidation` and `loginValidation`; extract those instead of replacing behavior blindly.
- Current auth route shape is `/register/owner`, `/register/client`, `/login`, `/refresh`, `/logout`, `/me`.
- Current booking payloads are mostly flat (`pickup`, `destination`, `cargo`, `vehicleType`, etc.). The downloaded `bookings.js` expects nested `pickup.address`, `cargo.description`, and `cargo.weightTonnes`, so it would reject existing frontend requests.
- Current truck types include values like `Lorry`, `Large Truck`, `Trailer`, and `Bus`; the downloaded enum uses `Mini Truck`, `Light Truck`, `Medium Truck`, etc.
- Current payments routes include `/wallet`, `/wallet/debit`, `/wallet/credit`, and `/withdraw`; the downloaded payment schemas do not cover withdrawal and expect fields that do not match all current handlers.
- Current workflow routes are `/requests`, `/bids`, `/messages`, `/reports`, and `GET /messages?booking=...`; the downloaded wiring references `/load-requests` and `/messages/:bookingId`.
- `common.mongoId()` validates URL params only. Do not use it for body fields such as `bookingId` unless it is rewritten to support `body()`.
- `payments-and-rest.js` contains multiple validator modules in one file; split it into `payments.js`, `marketplace.js`, `workflow.js`, `documents.js`, and `notifications.js` before adding it.

Implemented shape:

1. Added `backend/validators/` modules for auth, bookings, trucks, payments, workflow, documents, notifications, marketplace, admin, and users.
2. Kept the existing `module.exports = validate` style.
3. Changed validation failures to structured `422` responses with `status: 'fail'`.
4. Preserved current flat frontend payload shapes.
5. Added `backend/tests/validation.test.js` for empty login, bad truck query filters, missing booking fields, invalid notification IDs, and marketplace estimate validation.

## Batch 2: Device-Scoped Refresh Sessions

Implemented on 2026-06-01 in an adapted form.

The intended behavior:

- Add `deviceId`, `deviceName`, `deviceType`, `ipAddress`, and `lastUsedAt` to refresh sessions.
- Add `ua-parser-js` to classify devices.
- Include `X-Device-Id` from the frontend on API requests.
- Bind refresh-token rotation to the same device ID.
- Add session list, revoke one session, and revoke all sessions endpoints.
- Add a sessions UI to the profile page.

Current-repo caveats:

- Existing `RefreshToken.js` already uses JWT refresh tokens with a `sid`; the downloaded handler switches toward opaque random refresh tokens. Do this deliberately, not as a partial replacement.
- Existing user method is `comparePassword`; downloaded `auth.handlers.js` calls `correctPassword`.
- Existing auth responses use `{ token, user }`; downloaded frontend code expects `{ accessToken, user }`.
- Existing `workspace/src/api.js` exports `api`, not `Fe`.
- Existing frontend does not currently send `credentials: 'include'` on every request; adding refresh cookies requires careful CORS/cookie testing.
- Downloaded `SessionsManager.jsx` uses Tailwind classes and emoji icons; the current app uses local CSS and `lucide-react`.
- Downloaded `listSessions` builds `isCurrent` with an async callback inside `map`, which would return promises instead of booleans. Fix before use.
- A localStorage device ID only helps against cookie-only theft. It does not protect against XSS, because injected code can read and send the same device ID.
- `ua-parser-js` must be added to `backend/package.json` and installed.

Implemented shape:

1. Preserved the existing JWT refresh-token `sid` semantics.
2. Added device fields and session statics to `backend/models/RefreshToken.js`.
3. Added `backend/utils/deviceParser.js` and installed `ua-parser-js`.
4. Updated login, refresh, logout, and new `/api/auth/sessions` routes in `backend/routes/auth.js`.
5. Updated React and static frontend API clients to send `X-Device-Id` and use cookie credentials.
6. Added a native `SessionsManager` component to the profile page.
7. Added tests for device parsing and refresh-token session fields.

## Priority

Do validators first. They are lower risk and close real production gaps quickly.

Recommended sequence:

1. Centralized validators adapted to current payloads. Done.
2. Missing route validation and NoSQL/query hardening. Done.
3. AppError cleanup. Done.
4. CI lint/build/test gate. Done.
5. Device-scoped session management. Done.

## Later Production Policy Batch

Implemented on 2026-06-07 as native project code, not from the downloaded validation/session batches:

1. Production bidding gates for approved owner profiles and approved, available trucks.
2. POD or receiver-confirmation requirement before delivery completion.
3. Destination geofence checks for delivery completion and POD generation when coordinates are available.
4. Approved delivery proof requirement before admin payment release.
5. Admin audit logging for payment release.
6. LTL booking, shared-capacity estimate, and route-clustering foundations.
7. Owner-controlled live tracking ingestion, offline telemetry queueing, compressed batch sync, and shipper booking-room updates.

## Verification Checklist

After implementing validators:

- `npm.cmd test`
- `npm.cmd run app:build`
- Empty `POST /api/auth/login` returns structured validation errors.
- Bad ObjectId routes return validation errors, not Mongoose CastErrors.
- Existing frontend booking, truck, payment, and login flows still pass.

After implementing device sessions:

- Login creates one active refresh session for the browser device.
- Refresh succeeds only with matching `X-Device-Id`.
- Refresh token rotation revokes the old token.
- Reusing a revoked token clears sessions as intended.
- Session list marks the current browser correctly.
- Revoking another session does not log out the current browser.
