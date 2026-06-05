# Change Summary

This file summarizes the security hardening, workflow fixes, and latest iTruck workspace feature updates.

---

## 1) Security and Logic Hardening

### Protected document draft generation
- **File:** `backend/routes/documents.js`
- Added `protect` middleware to `POST /api/documents/draft/:type`.
- Limited draft generation input by passing only whitelisted fields into `draftPayload(...)`.

### Enforced bid ownership consistency
- **File:** `backend/routes/bookings.js`
- Updated bid acceptance helper to require `ownerUserId`.
- Enforced that embedded bid ownership matches the authenticated bid owner before acceptance.
- Applied the same guard in both memory and Mongo booking paths.

---

## 2) Auth and Account UX

- **File:** `workspace/src/App.jsx`
- Added a full registration flow to `ProfilePage`.
- Added first name, last name, email, password, and role selection for sign-up.
- Added `signin`, `signup`, `forgot`, and `reset` auth modes.
- Auto-signs users in after successful registration with `api.register(...)`.
- Improved forgot/reset password status handling and reset-token validation.

---

## 3) Booking and Owner Workflow Improvements

- **File:** `workspace/src/App.jsx`
- Added shipper booking cancellation from the dashboard with confirmation.
- Sends `{ status: 'cancelled' }` through `api.updateBookingStatus(...)`.
- Updates local shipment state immediately after cancellation.
- Wired owner queue actions to real flows:
  - Submit bid opens the first available load review.
  - Upload insurance navigates to the relevant profile document upload.
  - Confirm pickup updates the booking to `in_transit`.

---

## 4) Document and Vehicle Management

- **Files:** `backend/routes/users.js`, `backend/validators/users.js`, `backend/routes/trucks.js`, `backend/validators/trucks.js`, `workspace/src/App.jsx`, `workspace/src/api.js`
- Fixed document upload validation for optional URLs.
- Added document and vehicle cleanup endpoints/API methods.
- Added owner fleet vehicle removal with confirmation.
- Added per-document status badges for profile and truck documents.
- Disabled upload buttons for already approved documents.
- Added vehicle photo uploads through `premium-upload-zone`.
- Refreshes fleet data after truck document upload.
- Added Socket.io document status refresh on `document:updated`.

---

## 5) Workspace App Shell and Productivity Features

- **Files:** `workspace/src/App.jsx`, `workspace/src/styles.css`
- Added the upgraded `AppShell` as the exported workspace shell.
- Added dark mode with persisted user preference.
- Added topbar notification bell with unread count and dropdown.
- Added global search overlay for bookings and trucks.
- Added onboarding progress banner for shipper and owner flows.
- Added owner document expiry banner.
- Added profile completeness score.
- Added mobile bottom navigation and expanded topbar action controls.

---

## 6) Operational UI Components

- **Files:** `workspace/src/App.jsx`, `workspace/src/styles.css`
- Added issue reporting modal UI.
- Added wallet top-up modal UI and transaction styling.
- Added shipment status timeline.
- Added bid comparison table with price/rating/time sorting.
- Added new styles for modals, notifications, search, timeline, onboarding, document alerts, profile score, wallet top-up, and bid comparison.

---

## 7) Styling and Build Setup

- **Files:** `workspace/src/styles.css`, `workspace/tailwind.config.js`, `workspace/src/App.jsx`, `workspace/vite.config.js`, `workspace/package.json`, `workspace/package-lock.json`
- Added Tailwind CSS import to the workspace stylesheet.
- Added Tailwind Vite plugin to the workspace Vite config.
- Added Tailwind Vite dependencies to `workspace/package.json` so the workspace build resolves them locally.
- Removed the redundant PostCSS config path and kept the Vite plugin as the Tailwind integration point.
- Added `socket.io-client` for real-time document status updates.
- Generated a fresh production bundle in `frontend/app`.

---

## Files Modified

- `CHANGE_SUMMARY.md`
- `package.json`
- `package-lock.json`
- `workspace/package.json`
- `workspace/package-lock.json`
- `workspace/tailwind.config.js`
- `workspace/vite.config.js`
- `workspace/src/App.jsx`
- `workspace/src/styles.css`
- `frontend/app/index.html`
- `frontend/app/assets/*`

Earlier hardening rounds also touched:

- `backend/routes/documents.js`
- `backend/routes/bookings.js`
- `backend/routes/users.js`
- `backend/routes/trucks.js`
- `backend/validators/users.js`
- `backend/validators/trucks.js`
- `workspace/src/api.js`

---

## Validation

### Production workspace build

```bash
npm.cmd run app:build
```

Result: passed on June 6, 2026.

Build output:

- `frontend/app/index.html`
- `frontend/app/assets/index-BGSZQZZl.css`
- `frontend/app/assets/index-D0-p9MoH.js`

Note: PowerShell blocked `npm` through `npm.ps1` on this machine, so `npm.cmd` was used.

---

## Manual Test Checklist

1. Sign up from `/app/profile` and confirm role-based navigation appears.
2. Sign in with an existing account and verify dashboard access.
3. Request a forgot-password reset and confirm the status hint appears.
4. Create a shipment and verify it appears on the shipper dashboard.
5. Cancel a shipment and verify the status changes to Cancelled.
6. As an owner, use queue actions for bid submission, insurance upload, and pickup confirmation.
7. Upload profile or truck documents and verify per-document status badges.
8. Approve/reject a document as admin and confirm owner document status refreshes.
9. Toggle dark mode and confirm the preference persists after reload.
10. Open global search and confirm booking/truck results navigate correctly.
