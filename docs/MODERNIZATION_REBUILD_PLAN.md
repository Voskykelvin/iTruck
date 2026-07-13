# iTruck End-to-End Modernization and Rebuild Plan

Date: 2026-07-13  
Status: Proposed implementation plan  
Scope: Public website, shipper, fleet owner, driver, administrator, API, operations, and production assurance

> Implementation is tracked batch by batch in [MODERNIZATION_BATCHES.md](./MODERNIZATION_BATCHES.md).

## Executive Decision

Rebuild the product experience, but do not discard the working backend.

The safest and highest-value approach is a progressive frontend rebuild around the existing logistics domain, followed by targeted backend restructuring where the audit finds weak contracts, incomplete persistence, or operational risk. The backend already contains meaningful business rules for verification, booking state transitions, bidding, matching, dispatch, tracking, payments, documents, delivery proof, disputes, notifications, and auditing. Rewriting those rules from scratch would add risk without improving the customer experience.

The rebuild should:

1. replace the two disconnected frontend surfaces with one coherent product and design system;
2. organize work around shipments, jobs, and exceptions instead of a collection of overlapping pages;
3. make the server the source of truth for every business action;
4. make offline work explicit, queued, and reconcilable instead of presenting local fallback data as success;
5. expose only actions currently allowed by the backend state and the user's role;
6. prove each critical journey through contract, integration, and browser tests;
7. ship incrementally behind route or feature flags, with rollback available throughout.

## 1. What Exists Today

### Product foundation worth preserving

- Express and MongoDB backend with validation, authentication, CSRF-protected cookie sessions, role restrictions, rate limiting, security headers, and audit support.
- Shipper, owner, driver, and administrator roles.
- Booking state machine with guarded transitions.
- Bid submit, counteroffer, accept, reject, withdraw, expiry, and carrier acknowledgement workflows.
- Verified-truck matching, auto-assignment, LTL capacity reservation, dispatch plans, and stop sequencing.
- Route geocoding, road-route computation, ETA, live GPS ingestion, route deviation detection, Socket.IO updates, and offline telemetry queueing.
- Wallet, escrow, mobile-money/card provider adapters, refund and payout operations, idempotency records, and payment reconciliation logic.
- Document upload/review/generation, receiver OTP, typed or drawn signature, photo hashes, custody events, geofence checks, and proof-of-delivery closeout.
- Support/dispute cases, SLA fields, resolution outcomes, notifications, delivery workers, and operational scans.
- Backend, frontend, accessibility, end-to-end, security, and operational test infrastructure.

### Evidence from the current codebase

- The production React bundle is a single JavaScript asset of about 417 KB plus about 70 KB of CSS before transfer compression. Route-level code splitting is not in place.
- `AdminPage.jsx` is about 67 KB, `TrackingPage.jsx` about 49 KB, `ProfilePage.jsx` about 29 KB, `api.js` about 22 KB, and the global stylesheet about 81 KB. These files combine unrelated responsibilities and slow safe iteration.
- Routing is managed with `window.history`, pathname string checks, and a top-level state variable rather than a router with nested routes, loaders, error boundaries, and URL-owned state.
- The static public site has separate HTML/CSS/JavaScript auth forms, while the workspace implements the same access concerns again in React.
- Jobs and bid review appear in both the owner dashboard and Bids page. Tracking also contains chat, support, delivery proof, cases, ratings, dispatch, and documents. The same shipment is therefore represented differently depending on the page used to reach it.
- Data loading is implemented through page-level effects with many silent catches. Loading, empty, offline, unauthorized, and server-error states are often indistinguishable.
- Some failed server mutations are saved locally and presented as if useful work completed. Examples include owner vehicle creation, bid submission, booking drafts, messages, reports, and estimate fallback. Offline telemetry is a valid queued workflow; unsynchronized financial, bidding, or fleet actions must not be described as completed.
- Marketplace filtering and sorting are primarily client-side and limited to the first server result set. Public truck listing can include unverified vehicles unless the caller supplies a filter.
- Marketplace “Request” links pass a truck query parameter, but the booking page does not currently consume it. This is a broken cross-screen promise.
- Currency presentation is predominantly hard-coded to USD even though the product targets multiple African markets and the backend exposes localization concepts.
- Admin collections are fetched in broad batches and rendered inside one large console rather than server-paginated, filterable queues.
- Existing research/audit documents are stale relative to the code: features still marked missing now exist. Documentation needs a current capability ledger generated or checked against routes and tests.

## 2. Research Applied to the Plan

The research supports a task-centered, transparent, mobile-resilient product rather than a visually refreshed version of the existing page map.

- Uber Freight presents quoting, booking, tracking, and operational status as one connected workflow; its developer platform similarly groups quotes, shipment booking/search, and tracking/visibility. This supports one canonical shipment workspace rather than separate disconnected tools. Sources: [Uber Freight shipper platform](https://insights.uberfreight.com/shipping-simplified), [Uber Freight developer portal](https://developer.uberfreight.com/get-started).
- project44's driver workflow emphasizes simple mobile visibility, predictive ETA, and digital POD without requiring a full telematics integration. This supports a focused driver “today/job/POD” experience and a low-friction tracking fallback. Source: [project44 DriveView](https://www.project44.com/carriers/connect/driveview/).
- WCAG 2.2 adds requirements particularly relevant to this application: consistent help, visible/unobscured focus, minimum target size, redundant-entry reduction, accessible authentication, and error prevention for financial and legal actions. The target is WCAG 2.2 AA for complete processes, not only isolated public pages. Source: [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/).
- React Router supports nested route modules, data loading, actions, pending UI, route error boundaries, and automatic code splitting in its current architecture. This directly addresses the hand-rolled routing and monolithic bundle. Source: [React Router documentation](https://reactrouter.com/home).
- TanStack Query distinguishes server state from local UI state and supports caching, invalidation, retry control, and offline-aware network modes. It is a good fit for data shared among shipment summary, detail, payments, messages, and notifications. Sources: [TanStack Query overview](https://tanstack.com/query/latest/docs/framework/react/overview), [network modes](https://tanstack.com/query/latest/docs/framework/react/guides/network-mode).
- OpenAPI provides a language-independent, machine-readable HTTP API contract. A contract can generate types, validate responses, power test fixtures, and make “is this UI action backed by an endpoint?” mechanically reviewable. Source: [OpenAPI Specification](https://spec.openapis.org/oas/latest.html).
- OWASP identifies object-level, property-level, and function-level authorization as leading API risks. Every shipment, bid, document, payment, driver, and case endpoint needs positive and negative role/ownership tests. Source: [OWASP API Security Top 10](https://owasp.org/API-Security/editions/2023/en/0xa1-broken-object-level-authorization/).
- Offline application guidance favors deliberate caching and synchronization strategies per resource. Read caches, GPS points, draft forms, and mutation outboxes have different safety rules and must not share a generic fallback. Source: [web.dev Offline Cookbook](https://web.dev/articles/offline-cookbook).

## 3. Product Outcomes and Measures

Baseline these metrics before changing navigation, then measure by role and connection quality.

| Outcome | Primary measure | Initial target for pilot |
| --- | --- | --- |
| Faster first shipment | Median time from verified sign-in to submitted booking | Under 5 minutes |
| Clearer booking | Booking completion rate after starting route entry | At least 70% |
| Faster carrier response | Median time to first eligible bid or match | Corridor-specific baseline, then 25% improvement |
| Less operational confusion | Support contacts asking only for current status | 30% reduction |
| Reliable delivery closeout | Delivered jobs with valid, approved digital POD | At least 95% |
| Faster owner payment | Median delivered-to-release time | Under 24 hours when no dispute exists |
| Better field reliability | GPS/POD queued offline and later synchronized successfully | At least 99% of queued records |
| Trustworthy actions | UI-confirmed mutations with a persisted server record or explicit queued state | 100% |
| Accessible completion | Critical journeys passing automated checks and manual keyboard/screen-reader review | WCAG 2.2 AA |
| Stable releases | Error-free sessions and critical API success rate | At least 99.5% during pilot |

Also track quote-to-book, bid-to-award, award-to-pickup, on-time pickup/delivery, route-deviation response, dispute rate, refund age, payout age, document rejection causes, and weekly active verified carriers.

## 4. Experience Model

### Shared vocabulary

Use one label for one concept everywhere:

- **Shipment**: the shipper's end-to-end record from draft through closeout.
- **Job**: the carrier/driver view of an awarded shipment.
- **Quote**: the platform estimate shown before submission.
- **Bid**: a carrier's commercial offer.
- **Payment**: collection, escrow, refund, release, or payout with a visible state.
- **Proof of delivery**: receiver verification, signature, location, photos, and custody history.
- **Case**: support request or formal dispute.

Do not mix “load,” “request,” “booking,” and “shipment” in customer-facing labels unless the distinction is required and explained.

### Canonical shipment workspace

Every role should reach the same underlying shipment resource at `/app/shipments/:shipmentId`, with role-specific actions and these sections:

1. **Overview** — route, current state, next action, parties, vehicle, ETA, exceptions.
2. **Offers & assignment** — quote, bids, counteroffers, award, driver/truck assignment.
3. **Route & stops** — map or low-data milestone view, latest update, ETA, deviation, dispatch sequence.
4. **Documents** — required, missing, pending review, approved, rejected, generated.
5. **Payments** — amount, collection/escrow state, release/refund/payout state, receipts.
6. **Messages** — shipment-scoped conversation with send/delivered/failed state.
7. **Support** — cases, disputes, evidence, SLA/status, resolution history.
8. **Activity** — a participant-safe timeline derived from backend events and custody/audit records.

The default Overview uses progressive disclosure: current state, ETA, exception, and one recommended next action appear first. Secondary details live in the relevant section.

### Role navigation

#### Shipper

- Overview
- Shipments
- Create shipment
- Payments
- Inbox
- Account & verification

Marketplace discovery becomes contextual to creating or assigning a shipment, rather than a separate catalogue that can imply a truck is directly bookable when it is not.

#### Fleet owner / dispatcher

- Overview
- Find jobs
- My offers
- Active jobs
- Fleet & drivers
- Earnings
- Inbox
- Account & verification

#### Driver

- Today
- Assigned jobs
- Updates & POD
- Inbox
- Profile

The driver interface is mobile-first, large-target, low-data, and restricted to assigned work. It should not inherit the dispatcher interface.

#### Administrator

- Control tower
- Verifications
- Shipments & exceptions
- Payments & reconciliation
- Cases & disputes
- Communications
- Audit & system health

Each admin area is its own server-paginated route with saved filters and an item detail drawer/page. “Queue follow-up” must create a persisted task, case, notification, or audit entry—not only show a toast.

## 5. Redesigned End-to-End Journeys

### A. Shipper: register to submit a shipment

1. Create an account and verify contact information.
2. Complete only the profile fields needed for the chosen shipment; show why each verification item is required.
3. Enter origin and destination using server geocoding and selectable results.
4. Enter schedule, cargo, weight/value, handling needs, border requirements, and receiver.
5. Choose full-truck or shared load with plain-language capacity guidance.
6. Receive a versioned server quote with line items, inclusions, exclusions, required documents, validity/expiry, and currency.
7. Save a server draft automatically. Offline changes are labelled “Saved on this device—sync required.”
8. Review a single confirmation summary and explicitly acknowledge price and operating terms.
9. Submit once with an idempotency key, receive the persisted shipment ID, and land on its Overview.

Required improvements:

- Add backend booking drafts or a dedicated draft resource; do not use generic local booking success.
- Persist quote version/hash, currency, expiry, and acknowledgement rather than only a mixed estimate object.
- Consume preselected truck/match context or remove the misleading marketplace action.
- Use server-supported country, corridor, currency, and phone metadata.

### B. Shipper: compare, negotiate, and award

1. Open Offers & assignment from the shipment.
2. Compare normalized total price, expiry, vehicle readiness, owner verification, capacity, route experience, rating count, response time, and exceptions.
3. Counter, reject with a reason, or award using accessible dialogs—not `window.prompt` or `window.confirm`.
4. Require a final confirmation for award because it changes commercial and capacity state.
5. Show the accepted carrier's acknowledgement deadline and assignment readiness.
6. Transition to funding and dispatch without sending the user to unrelated top-level pages.

The existing bid APIs remain, but responses should include allowed next actions, version/updated time, and normalized commercial fields. Concurrent decisions must return a conflict that the UI can recover from by refetching.

### C. Owner: qualify, bid, and dispatch

1. Verification checklist shows profile, document, vehicle, and driver readiness separately.
2. Find jobs uses server-side corridor, schedule, vehicle, capacity, risk, and price filters.
3. A job card exposes the minimum decision set before opening: route, pickup/delivery windows, distance, cargo/weight, vehicle, price/budget, documents, cross-border needs, and shipper trust indicators.
4. Bid form selects only eligible trucks and explains why another truck cannot be selected.
5. Submission is persisted or explicitly failed. It is never silently converted into a local bid.
6. On award, the owner acknowledges, assigns a driver, confirms vehicle readiness, and sees funding/dispatch blockers.
7. Active jobs appear in one dispatch board rather than both dashboard and Bids implementations.

### D. Driver: pickup to POD

1. Today shows assigned jobs, next stop, schedule, contact, and offline state.
2. Job detail supports accept/acknowledge, navigate, arrive, pickup checklist, start trip, milestone updates, and report exception.
3. Tracking consent and active capture are clear; GPS continues through the existing bounded offline queue.
4. Stop transitions require the minimum relevant evidence and use backend state commands.
5. At delivery, request receiver OTP, capture receiver identity and signature, condition notes/photos, location, and finalize POD.
6. Show “queued,” “uploading,” “submitted,” “verified,” or “needs attention” separately.
7. Do not show delivery complete until server finalization succeeds.

### E. Payments and release

1. The shipment shows one payment timeline: quote total → collection initiated → escrow confirmed → delivery approved → release/payout initiated → settled, or refund/dispute branch.
2. Provider initiation never implies payment completion. Pending states update by polling/socket and provider reconciliation.
3. Every financial mutation uses a stable client idempotency key that survives retry/reload.
4. Amount, currency, fees, payer/payee, provider, and expected timing appear before confirmation.
5. Admin exception queues surface unmatched callbacks, aging pending transactions, refunds, and payouts.
6. Receipt/invoice links are tied to real transaction or shipment records.

### F. Exception and dispute handling

1. “Get help” is consistently available from the shipment.
2. The form distinguishes a normal support case from a formal dispute and explains the operational/payment effect.
3. Evidence upload shows progress, failure, and retry.
4. Participants see public comments, status, next responsible party, SLA expectation, and resolution; internal notes remain admin-only.
5. Resolution commands display their shipment/payment consequence before confirmation.

## 6. Target Frontend Architecture

### Recommended structure

Keep Vite and React, then migrate by feature into TypeScript. Do not combine the UX rebuild with an unnecessary framework or backend-language rewrite.

```text
workspace/src/
  app/
    router/
    providers/
    layouts/
  features/
    auth/
    onboarding/
    shipments/
    quotes/
    bids/
    dispatch/
    fleet/
    tracking/
    delivery-proof/
    payments/
    documents/
    messaging/
    cases/
    admin/
  components/
    ui/
    forms/
    feedback/
  api/
    generated/
    client/
    query-keys/
  offline/
    gps-outbox/
    draft-outbox/
  styles/
    tokens.css
    globals.css
```

### Foundation decisions

- Use React Router data routes with nested layouts, route error boundaries, URL-based search/filter state, lazy route modules, and protected role routes.
- Use TanStack Query for server data, mutation invalidation, polling, cached read state, and explicit offline policy. Do not copy server collections into unrelated page state.
- Generate TypeScript request/response types from OpenAPI. Keep one small API transport for cookies, CSRF, idempotency, request IDs, and standardized errors.
- Use a schema-based form layer for shared client/server rules while keeping the backend authoritative.
- Add a design-system layer for buttons, links, dialogs, drawers, inputs, autocomplete, date/time, money, status, skeletons, empty/error/offline states, tables, pagination, and toasts.
- Replace browser prompts/confirms with accessible dialogs that display consequences and preserve focus.
- Lazy-load maps, admin, document/PDF, and analytics code. Provide a text route view when maps fail or low-data mode is enabled.
- Keep theme preference locally; keep authentication identity sourced from `/auth/me` with a non-sensitive session hint only. Do not treat a local user object as proof of authorization.
- Consolidate the public site into the same frontend build or a shared component/design package. Registration and login should have one implementation.

### State ownership rules

| State | Owner | Offline behavior |
| --- | --- | --- |
| Authentication and permissions | Server/session | Fail closed; cached UI is not authorization |
| Shipment, bid, fleet, payment, document, case | Server | Cached read allowed with “last updated”; mutations require server or explicit outbox support |
| GPS telemetry | Device outbox + server | Queue, deduplicate, batch, sync, show last successful sync |
| Booking draft | Server draft; device recovery copy | Show unsynced state and reconcile versions |
| Message draft | Device | Draft only; sent status comes from server |
| Message/report/financial mutation | Server | Never mark complete locally |
| Filters, theme, dismissed tips | URL/device | Local persistence allowed |

## 7. Design System and Visual Direction

The current green/mustard identity can remain recognizable, but the product should feel like an operations tool rather than a collection of similarly styled cards.

- Establish semantic tokens for canvas, surfaces, text, border, focus, brand, information, success, warning, danger, and disabled states in light and dark themes.
- Use fewer cards. Prefer clear page hierarchy, section boundaries, tables/lists for repeated operational data, and a sticky contextual action area on detail screens.
- Use a 12-column desktop grid, single-column mobile flow, and content widths appropriate to dense admin versus focused driver tasks.
- Create one status language mapped from backend enums. Color is supplemental; every state has a label and, where useful, an icon.
- Make the “next action” obvious and singular. Secondary actions go into contextual menus only when discoverable and accessible.
- Use skeletons only while initial content is expected; use inline retry panels for failures and specific empty states with a real next action.
- Set a minimum 44×44 CSS pixel product target even though WCAG AA permits smaller targets in some conditions.
- Respect reduced motion, 200% zoom/reflow, keyboard operation, visible focus, screen readers, and high-contrast needs.
- Format money with `Intl.NumberFormat`, dates with the user's locale/time zone, phone numbers by country, and distance/weight consistently.
- Validate the direction with low-fidelity journey prototypes before polishing visual screens. Test with at least shippers, owner/dispatchers, drivers on low-end phones, and operations staff.

## 8. Backend and API Modernization

### Preserve and reorganize

Keep the modular monolith. Split large route files into domain controller/service/repository/policy modules only as those areas are changed. Microservices are not justified at the current stage.

### Required platform work

1. **Capability ledger and OpenAPI contract**
   - Document every active endpoint, request/response schema, auth policy, idempotency rule, event, and error.
   - Generate frontend types and contract tests.
   - Deprecate duplicate `/workflow` paths where canonical booking/case/message routes exist.

2. **Consistent resource representation**
   - Use stable `id`, `reference`, `status`, `createdAt`, `updatedAt`, `links`, and `allowedActions` fields.
   - Return participant-safe shipment summaries and richer authorized detail projections.
   - Include currency on all monetary amounts; never infer it from presentation.

3. **Command-oriented transitions**
   - Keep domain state machines server-side.
   - Prefer explicit commands such as `start-pickup`, `arrive-stop`, `confirm-delivery`, `award-bid`, and `resolve-dispute` over a generic status patch for customer actions.
   - Require expected version/`If-Match` or equivalent conflict detection for high-contention decisions.

4. **Pagination and filtering**
   - Add cursor pagination, deterministic sort, search, status, corridor, date, assignee, risk, and exception filters to shipment, marketplace, payment, notification, document, case, and admin lists.
   - Return filter metadata where it helps build valid client options.

5. **Reliable mutations and events**
   - Extend idempotency to booking submission, bid commands, document finalization, case creation/comments, notifications, and admin operations where repeat requests can cause harm.
   - Use MongoDB transactions for remaining multi-record booking/capacity/payment/custody operations.
   - Add an outbox/event record so notification, audit, socket, and provider side effects can be retried without replaying the business transition.

6. **Operational tasks**
   - Persist admin follow-ups and high-value reviews as tasks/cases/audit records with owner, due time, state, and outcome.
   - Remove toast-only operational actions.

7. **Localization**
   - Define supported countries, corridors, currencies, units, phone metadata, payment methods, and document requirements in versioned server configuration.
   - Store all instants in UTC and retain the relevant operating time zone for schedules.

8. **Security**
   - Centralize object and function authorization policies.
   - Add a role × endpoint × ownership negative-test matrix.
   - Validate response projections to prevent sensitive owner, driver, payment, and document fields from leaking.
   - Add step-up confirmation or re-authentication for account deletion, payout-detail changes, large refunds/releases, and sensitive admin actions.

9. **Observability**
   - Correlate browser action, API request, domain event, provider operation, and worker attempt by request/operation ID.
   - Add error monitoring, traces for critical flows, structured business metrics, provider callback dashboards, queue age, and actionable alerts.

## 9. Feature-to-Backend Wiring Contract

Every interactive control must appear in this ledger during implementation. “Done” means the backend record is persisted, authorization is tested, the UI handles pending/success/error/conflict, telemetry exists, and an end-to-end test covers the result.

| Experience | Current backend foundation | Modernization gap |
| --- | --- | --- |
| Register/login/session | `/auth/*`, cookie/CSRF sessions, session revocation | One auth UI; bootstrap from server; accessible errors; remove duplicated static forms |
| Profile/verification | `/users/profile`, document upload/review | Server-driven requirements and progress; no profile/document duplication |
| Create shipment | estimate, maps, `POST /bookings` | Server draft, quote version/expiry/currency, idempotent submit, autocomplete |
| Shipment list/detail | booking list/detail | Cursor pagination, filters, role-safe view models, allowed actions |
| Marketplace/matching | truck list, matches, auto-assign, dispatch | Server filters/sort, verified-only discovery default, consume selection context |
| Bid negotiation | complete bid command set | Replace prompts, conflict/version handling, one canonical Offers UI |
| Fleet/driver management | trucks and driver invitations/assignments | Full vehicle forms, readiness reasons, assignment history, no local-success fallback |
| Tracking/ETA | route plan, telemetry, socket, deviation | Focused route UI, text/low-data fallback, sync health and stale indicators |
| Stop/job execution | booking status and dispatch plan | Explicit stop/pickup commands and checklists; clearer driver permissions |
| POD | OTP, photos, signature, custody hash/geofence | Field UX, upload progress/retry, approval state, complete E2E and tamper tests |
| Documents | upload/review/generation | Requirements by corridor/state, version/history, rejection correction loop |
| Messaging | booking messages | Server delivery/read state, pagination/socket, attachments policy, no fake sent state |
| Payments | wallet/escrow/provider/refund/payout/release | Unified timeline, currency, pending reconciliation UX, exception queues |
| Cases/disputes | participant/admin case APIs | Dedicated case detail, next owner/SLA, outcome consequence confirmation |
| Notifications | in-app/push/preferences/delivery worker | Deep links to exact records, per-item read wiring, provider receipts and failure UX |
| Admin | stats and domain queues | Split routes, server pagination, persisted tasks, saved filters, permission scopes |
| Search | client-loaded bookings/trucks | Auth-aware server search across permitted resources with pagination |

## 10. Delivery Roadmap

The timing below assumes a small cross-functional team with product/design, frontend, backend, and QA capacity. Re-estimate after the Phase 0 journey workshop and API ledger.

### Phase 0 — Truth, baseline, and prototypes (1–2 weeks)

- Reconcile documentation against current code and tests.
- Catalogue all visible controls and map each to endpoint, permission, state change, and side effect.
- Record baseline funnel, latency, failure, and support metrics.
- Interview/test representative shipper, owner/dispatcher, driver, and admin users.
- Prototype the canonical shipment workspace and the four role navigations.
- Freeze new top-level pages unless they match the target information architecture.
- Define feature flags, route coexistence, analytics events, and rollback rules.

Exit gate: approved journey maps, capability ledger, API gap list, clickable prototypes, baseline dashboard, and prioritized release slice.

### Phase 1 — Application foundation (2 weeks)

- Introduce TypeScript, real routing, route-level lazy loading, server-state/query layer, generated API types, and standardized errors.
- Create app shell, design tokens, core accessible components, permission/capability handling, and global online/offline/sync feedback.
- Consolidate auth into the new frontend and bootstrap identity from the server.
- Add OpenAPI contract generation/validation and CI drift checks.
- Establish test fixtures/builders that come from the contract rather than copied demo shapes.

Exit gate: new shell and auth work behind a flag; direct links, refresh, back/forward, error boundaries, session refresh, keyboard navigation, and bundle splitting pass.

### Phase 2 — Shipper and owner commercial flow (3–4 weeks)

- Build server-backed shipment drafts, route autocomplete, quote review, and idempotent submission.
- Build shipment list/detail Overview and Offers sections.
- Build Find jobs, My offers, negotiation, award, acknowledgement, fleet readiness, and driver/truck assignment.
- Move marketplace into contextual matching and implement server filtering/pagination.
- Remove local-success behavior for booking, vehicle, and bidding actions.

Exit gate: a verified shipper creates and awards a shipment; a verified owner bids, negotiates, acknowledges, and assigns a ready truck/driver in browser tests across desktop and mobile.

### Phase 3 — Trip execution, tracking, documents, and POD (3–4 weeks)

- Build driver Today and Job detail flows with explicit pickup/stop transitions.
- Build role-specific shipment Route, Documents, Messages, Support, and Activity sections.
- Integrate live route/ETA/deviation, stale-location warnings, low-data mode, and explicit offline sync state.
- Build the complete receiver OTP/signature/photo/geofence POD experience.
- Add document correction/re-upload loops and shipment requirements.

Exit gate: assigned driver completes pickup, offline/online tracking, exception reporting, and POD; shipper sees live state and confirms closeout; unauthorized users cannot access the job.

### Phase 4 — Money and operations control (3 weeks)

- Build payment timeline, provider initiation/pending/failure states, receipts, payout and refund visibility.
- Split admin into verification, shipment exception, reconciliation, case, communication, audit, and health queues.
- Add persisted operational tasks and provider exception dashboards.
- Add missing transaction boundaries, outbox delivery, and high-risk step-up confirmation.

Exit gate: sandbox/provider-certified collection through release/payout and refund/dispute branches pass reconciliation, idempotency, authorization, and E2E tests.

### Phase 5 — Hardening, migration, and pilot (2–3 weeks)

- Run complete WCAG 2.2 AA process review, low-end Android/low-bandwidth testing, performance budgets, load/security testing, backup/restore, and rollback rehearsal.
- Migrate deep links and retire old route implementations only after replacement parity is proven.
- Remove obsolete static auth, duplicated demo/local business fallbacks, dead CSS, and duplicate API paths.
- Run a corridor-limited pilot with feature flags, staffed support, daily metrics, and a documented rollback owner.

Exit gate: production gate evidence is signed, no critical/high unresolved findings remain, provider callbacks are monitored, restore/rollback is rehearsed, and pilot KPIs are visible.

## 11. Prioritized Backlog

### P0 — Required for a trustworthy rebuild

- Canonical shipment/job resource and navigation.
- Server-source-of-truth mutation policy; remove false local success.
- OpenAPI contract and generated frontend types.
- Route/data/query foundation and code splitting.
- Booking drafts, quote version/currency/expiry, and idempotent submit.
- Complete role-safe E2E for create → bid → award → fund → pickup → track → POD → release.
- Server pagination/filtering for operational lists.
- Accessible dialogs and complete-process WCAG 2.2 AA coverage.
- Provider and operational observability.

### P1 — High-value pilot improvements

- Low-data shipment tracking and explicit sync center.
- Persisted admin task/exception system.
- Message delivery/read states and exact deep links.
- Localization by launch corridor.
- Document requirement engine and correction loop.
- Saved admin/dispatcher filters and responsive operations tables.
- Product analytics and funnel dashboards.

### P2 — After stable corridor density

- Facility/depot intelligence, detention and reliability history.
- Richer multi-stop optimization and cargo compatibility.
- WhatsApp/SMS-assisted driver actions with secure short-lived links.
- Enterprise organization roles, teams, approval limits, and account billing.
- Financing/factoring only after provider reconciliation and POD reliability are proven.

## 12. Test and Release Strategy

### Required test pyramid

- Unit tests for pricing, normalization, state machines, matching, authorization policies, and UI state reducers.
- OpenAPI request/response contract tests for every route.
- Integration tests with real disposable MongoDB and Redis for transactions, locks, idempotency, outbox, and callbacks.
- Browser journey tests by role for happy, validation, conflict, offline, retry, and unauthorized paths.
- Provider sandbox tests plus signed callback fixtures and out-of-order/duplicate delivery tests.
- Automated accessibility checks on every major route plus manual keyboard, screen-reader, zoom, and mobile target review.
- Visual regression for the design system and critical responsive screens.
- Performance tests for representative low-end mobile, slow network, large admin datasets, tracking fan-out, uploads, and map fallback.

### Critical acceptance rule

A feature is not complete because a button calls an API. It is complete only when:

1. the server authorizes and validates the action;
2. the domain transition and all required records are atomic or recoverable;
3. repeated requests are safe;
4. the UI shows pending, success, error, conflict, offline, and stale states honestly;
5. the resulting server state is visible after refresh and to other authorized participants;
6. an audit/event trail exists where required;
7. metrics and errors are observable;
8. automated tests cover success and misuse.

### Performance budgets

Set final budgets after baseline measurement. Initial targets for new routes:

- route-level initial JavaScript under 200 KB compressed for common mobile journeys, excluding lazy map/PDF/admin modules;
- Core Web Vitals “good” at the 75th percentile on representative mobile traffic;
- non-map cached shipment summary usable on a poor connection;
- no unbounded list response or DOM rendering;
- visible feedback within 100 ms of user action and a specific progress state for longer operations.

## 13. Migration and Rollback

Use a route-by-route strangler migration:

1. new shell and authentication;
2. new shipment list/detail alongside legacy pages;
3. new create/offer/dispatch journeys;
4. new tracking/POD;
5. new payments/admin;
6. remove legacy code only after usage, error, and parity gates pass.

The old and new UI must not independently mutate the same workflow with different rules. During coexistence, both call the same canonical APIs and events. Feature flags are evaluated by role/account, direct links remain stable or redirect explicitly, and each phase has a tested rollback to the previous frontend bundle without rolling back compatible backend schema additions.

## 14. Decisions to Confirm in Phase 0

- First launch corridors and their currencies/payment providers.
- Whether customers choose a specific carrier/truck or request a verified match; the current marketplace copy implies both.
- Who performs each pickup/delivery transition: driver, dispatcher, shipper, receiver, or administrator.
- Required funding point: before bidding, before award, or before dispatch.
- Driver device/browser minimums and acceptable background-tracking constraints.
- Support staffing hours and accepted SLA targets.
- Organization/team support needed for the pilot versus individual accounts only.
- Legal retention, consent, and jurisdiction requirements for GPS, receiver identity/signature, documents, payments, and audit history.

## 15. Immediate Next Slice

Start with one vertical slice, not a visual-only redesign:

**New shipper shipment list → shipment Overview → Offers → award confirmation**, backed by the existing booking and bid APIs plus the minimum contract/pagination/capability changes.

This slice proves the new router, server-state layer, design system, role permissions, canonical shipment model, conflict handling, responsive layout, accessibility, analytics, and migration approach. Once it is stable, reuse the same shipment workspace for owner dispatch, driver execution, documents, tracking, payments, and support.
