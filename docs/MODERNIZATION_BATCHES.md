# iTruck Modernization Batches

Date started: 2026-07-13

This file is the implementation tracker for the strategy in
[MODERNIZATION_REBUILD_PLAN.md](./MODERNIZATION_REBUILD_PLAN.md). Each batch must be releasable, preserve current
working behavior, and finish with tests and an explicit handoff.

## Batch 1 — Trustworthy Commercial Flow

Status: implemented

Goal: ensure marketplace, booking, fleet, and bidding actions tell the truth about server state.

Delivered:

- Verified and available trucks are the default marketplace discovery set.
- Marketplace type and verification filters are sent to the backend instead of operating only on the initial result
  set.
- “Request truck” now carries the selected truck ID into booking.
- Bookings persist the selection as `requestedTruck`, separate from the awarded `truck`, so carrier preference cannot
  bypass bidding, capacity reservation, or assignment rules.
- The backend rejects a requested truck that is no longer verified and available.
- Matching identifies and boosts an eligible shipper-preferred vehicle without guaranteeing assignment.
- Booking displays the carrier preference and explains that final assignment still requires an eligible award.
- Failed booking, bid, and fleet mutations remain failed and retryable. They are no longer written to local storage or
  displayed as completed business records.
- Regression coverage was added for marketplace-to-booking preference, failed owner mutations, failed bid submission,
  carrier preference validation, and matching preference.

Exit checks:

- [x] A marketplace selection reaches the booking request.
- [x] The selected truck is a preference, not an assignment.
- [x] Unavailable/unverified preferences are rejected server-side.
- [x] Failed vehicle, bid, and booking submissions do not create local success records.
- [x] A failed bid stays open for retry.
- [x] Focused frontend and matching tests pass.
- [x] Lint, formatting, and production build pass.
- [ ] Focused MongoDB route integration suite completes in the local environment (local startup timed out; CI still
      required).
- [ ] Full backend and frontend suites pass in CI.

## Batch 2 — Application Foundation

Status: in progress

Delivered so far:

- React Router now owns browser location/history while a compatibility adapter preserves existing navigation calls.
- All current role URLs, query strings, redirects, and direct links continue to work.
- Page modules are lazy-loaded behind route-level pending and resettable error UI.
- The previous single 417 KB raw JavaScript bundle is now a 305 KB shell plus independent page/component chunks.
- React Query is installed and configured with conservative read retry/staleness defaults and no automatic mutation
  retry.
- Navigation icon names now resolve to actual accessible SVG components instead of unknown custom HTML elements.
- App routing tests wait for lazy routes and cover a direct marketplace-preference booking URL.
- Marketplace fleet discovery, carrier preference lookup, quote calculation, and booking submission now use shared
  React Query hooks and stable query keys.
- Marketplace filtering preserves the last live result set during refresh and clearly distinguishes loading, empty,
  stale-error, and unavailable states.
- Live fleet and quote failures no longer substitute demo vehicles or locally calculated prices.
- Booking mutations expose an inline, retryable failure state and invalidate the shared booking cache after success.
- Each application mount owns an isolated query client, with a reusable test provider for page-level coverage.
- Shipper shipment lists, owner opportunities, submitted bids, fleet choices, and carrier offers now share normalized
  booking/open-load query caches.
- Booking cancellation, bid submission, counteroffers, withdrawals, acknowledgements, awards, and auto-assignment
  apply the returned server record to every cached shipment view.
- Shipment and opportunity read failures show explicit retry states instead of substituting sample bookings or loads.
- The navigation compatibility adapter verifies browser location changed and falls back to native history when a stale
  router callback cannot complete navigation.
- Tracking now reads the shared booking list, keeps selection stable by booking identity, and shows explicit loading,
  unavailable, retry, and genuine-empty states.
- GPS telemetry acknowledgements, trip status changes, document generation, delivery proof finalization, delivery
  confirmation, and socket events all update the same normalized booking cache.
- Offline GPS queueing and retry behavior remain intact; only successful backend responses change canonical shipment
  state.
- The owner workspace now reads fleet vehicles, open loads, bookings, and wallet balance through shared query caches;
  live failures no longer restore demo fleet or job records.
- Vehicle creation and removal update the shared fleet cache only after backend success, with disabled pending controls,
  genuine empty states, and retryable read failures.
- The existing driver operations panel is now part of the owner workspace instead of being unreachable. Driver list,
  invitation, revocation, vehicle assignment, and vehicle unassignment actions are wired to the driver backend and
  refresh the affected fleet/driver caches.
- Direct tests cover driver invitation/revocation, assignment/unassignment, failed driver reads, and the owner fleet
  lifecycle.
- Customer document workflows now share profile, fleet, booking, and document query keys across Documents,
  Onboarding, Profile, and the shipper dashboard.
- Profile, vehicle, vehicle-photo, and shipment uploads apply only the user, truck, or booking returned by the backend;
  upload failures remain visible and retryable without manufacturing a local review state.
- Document downloads invalidate the booking/document caches so generated paperwork can be reflected by every shipment
  surface, while socket and polling refreshes reuse the same canonical queries.
- The Documents workspace now distinguishes loading, genuine empty, unavailable, and retry states and no longer
  restores demo shipments or vehicles after live read failures.
- Owner onboarding fleet reads and vehicle registration now use the shared fleet cache instead of a duplicate local
  collection.
- Wallet balance and transaction history now use one normalized server-state record across the owner, shipper, and
  payments workspaces.
- Wallet escrow, mobile-money authorization, withdrawal, admin credit, invoice generation, and admin release actions
  share payment mutations that update returned bookings and reconcile the wallet from the backend.
- Withdrawals no longer subtract requested funds optimistically. Failed or unconfirmed payout requests leave the
  authoritative wallet balance unchanged, while successful operations refresh the live balance and activity history.
- The payments workspace now includes wallet activity plus distinct wallet and booking loading, empty, unavailable,
  pending, and retry states; failed booking reads no longer restore demo billing records.
- Messages and Tracking now share booking-scoped conversation query keys, normalized message records, and one cache
  for loaded history, successful sends, and live `message:new` socket events.
- Sending a message is server-confirmed: drafts clear only after success, failed sends remain editable, and neither
  workspace manufactures a local delivered message when the backend rejects the request.
- Message booking selection is stable by booking identity, and both conversation surfaces distinguish booking/history
  loading, genuine empty, unavailable, retry, and pending states without restoring demo conversations.
- Tracking support cases now use shared booking-scoped queries and mutations for report, reply, and reopen actions.
  Backend-returned cases update the canonical cache, while failed escalations remain in the open form and never create
  a local success record.
- Direct messaging tests cover history, server-confirmed sending, retained failed drafts, shipment switching, socket
  delivery, and retryable booking/history failures. Tracking tests also protect the failed-escalation integrity rule.
- Notification history is now a shared server-state query used by the application shell and live socket events.
  Mark-all-read changes the visible unread state only after backend confirmation; failures preserve unread items and
  surface an error instead of disappearing silently.
- The notification bell now distinguishes loading, unavailable, retry, empty, and mutation-pending states, while
  socket-delivered records reconcile into the same bounded and de-duplicated history cache.
- Profile updates reconcile the returned user into the shared profile cache. Rejected saves retain the customer's
  edited draft and do not publish a local success or replace the authenticated user.
- Notification preferences now use shared query and mutation state with explicit loading, unavailable, retry, saving,
  and test-delivery states. Backend failures no longer display default preferences as though they were live settings.
- The admin console now loads statistics, profiles, vehicles, bookings, documents, payments, support cases,
  notification deliveries, and audit logs through one resilient query workspace with 30-second refreshes.
- Partial admin outages retain last-known successful queue data and name every unavailable resource. Failed queue
  requests are no longer converted into misleading zero metrics or successful empty-review messages.
- Admin actions refresh the canonical review workspace after backend confirmation, while existing pending controls
  and backend error reporting remain intact across document, verification, risk, payment, notification, and support
  operations.
- Application startup now confirms the active account through the protected profile endpoint before authorizing or
  redirecting workspace routes. Browser storage is retained only as a session hint and no longer decides the active
  role.
- Cookie-backed sessions restore protected direct links even when no local identity exists. A stale local role cannot
  expose a restricted page, and temporary session-service outages preserve the requested path and query string behind
  a retryable verification state.
- API errors now retain their HTTP status so authentication failures can be distinguished from temporary network or
  service failures without parsing display messages.
- Protected global search requests wait for a confirmed account, and notification/primary workspace controls are not
  displayed until session bootstrap succeeds.
- A shared accessible confirmation dialog now provides labelled alert-dialog semantics, initial safe-action focus,
  Escape and backdrop cancellation, and pending-state protection.
- Shipment cancellation and fleet vehicle removal use the shared dialog instead of native browser confirmations.
  Destructive backend calls begin only after the explicit confirmation step and failed calls keep their canonical
  records unchanged.

Validation completed:

- Frontend regression suite: 20 files and 155 tests passed.
- Routing-focused suite: 10 tests passed.
- ESLint and Prettier checks passed.
- Production build passed; the application shell is 317.51 KB raw / 100.80 KB gzip, with pages emitted as separate
  chunks.

Remaining scope:

- Standardize loading, empty, error, stale, retry, and offline states across each workflow.
- Expand direct-link coverage to the canonical shipment detail routes introduced in Batch 3.
- Begin TypeScript migration at the API boundary.

## Batch 3 — Canonical Shipment Workspace

Planned scope:

- Build shipment list and `/app/shipments/:id` detail routing.
- Add Overview, Offers, Route, Documents, Payments, Messages, Support, and Activity sections.
- Consolidate duplicate shipper dashboard, Bids, Tracking, and document actions around the same shipment resource.
- Return server-calculated `allowedActions` for role and state-aware controls.

## Batch 4 — Booking and Carrier Award

Planned scope:

- Add server-backed booking drafts and recovery.
- Add route autocomplete and server quote version, currency, expiry, and acknowledgement.
- Replace bid prompts/confirms with accessible negotiation and award dialogs.
- Add conflict recovery for simultaneous bid decisions.
- Complete server-side job and marketplace pagination/filtering.

## Batch 5 — Owner Dispatch and Driver Operations

Planned scope:

- Consolidate Find jobs, My offers, Active jobs, Fleet, and Drivers.
- Add explicit eligibility/readiness explanations.
- Build driver Today and Job detail experiences.
- Add explicit pickup, arrival, stop, and exception commands.
- Surface GPS permission, queued points, last sync, stale tracking, and low-data route views.

## Batch 6 — Documents and Delivery Proof

Planned scope:

- Add corridor/state-driven document requirements and correction loops.
- Build upload progress, failure, retry, review history, and version visibility.
- Complete the field POD flow for receiver OTP, identity, signature, photos, condition, location, and finalization.
- Show queued, uploading, submitted, verified, and needs-attention states separately.

## Batch 7 — Payments and Operations Control

Planned scope:

- Build a single collection, escrow, release, payout, refund, and dispute timeline.
- Add persistent idempotency keys across reload/retry for financial actions.
- Split administration into server-paginated verification, shipment exception, reconciliation, case, communication,
  audit, and health queues.
- Replace toast-only admin follow-ups with persisted tasks/cases/audit outcomes.

## Batch 8 — Production Hardening and Migration

Planned scope:

- Complete role/ownership authorization matrices and critical journey E2E coverage.
- Run WCAG 2.2 AA, low-end mobile, low-bandwidth, performance, load, backup/restore, and rollback reviews.
- Add provider and worker observability, alerts, and pilot dashboards.
- Retire legacy pages, duplicated static authentication, dead CSS, and obsolete local/demo business fallbacks after
  replacement parity is proven.
