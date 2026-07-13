# iTruck Logistics Research And Product Decisions

Date: 2026-05-25

> Modernization note (2026-07-13): The current end-to-end audit and proposed progressive rebuild are documented in
> [MODERNIZATION_REBUILD_PLAN.md](./MODERNIZATION_REBUILD_PLAN.md). That plan was checked against the current code;
> some older “missing” items below have since been implemented and should not be treated as the current backlog.

## Complete Codebase Sweep — 2026-06-20

- Required authentication for every Socket.IO connection and authorization before joining a booking room, closing a denial-of-service path and preventing arbitrary shipment subscriptions.
- Redacted owner identity, vehicle registration, chassis details, and document records from public truck responses while preserving full records for authorized fleet and admin views.
- Required real upload evidence before user, truck, or shipment documents can be approved, and added file-signature checks so renamed or MIME-spoofed uploads are rejected.
- Persisted demo uploads locally instead of returning dead placeholder URLs; local upload serving remains disabled in live mode.
- Revoked refresh sessions after password changes and added single-flight browser refresh handling to prevent concurrent `401` responses from rotating the same refresh token multiple times.
- Removed fake non-admin wallet top-ups from the workspace. Admin adjustments use the real API; shippers are directed to booking escrow/payment flows.
- Corrected report validation and evidence handling so issue severity matches the API and selected photos are uploaded before report submission.
- Added a React error boundary, accessible modal/toast semantics, safer service-worker caching, and a more defensible public landing page without unsupported scale or payment claims.
- Hardened deployment defaults with 15-minute access tokens, localhost-only development database ports, production dependency audits in CI, and a `.dockerignore` that excludes secrets and local artifacts.
- Updated runtime dependencies and added regression coverage for socket authorization, public truck redaction, upload spoofing, document evidence, CORS failures, generated POD records, and reset-token field privacy.

### Deferred After The Sweep

- Split the large React `App.jsx` into route-level features and add frontend component/integration tests.
- Move browser access tokens out of JavaScript-readable storage as part of a coordinated cookie/session API redesign.
- Add MongoDB transactions around multi-record financial and booking transitions where atomic single-document updates are not sufficient.
- Complete live provider certification, callback monitoring, refunds, disputes, and owner payouts for Stripe, M-Pesa, and MTN MoMo.
- Expand audit trails and authorization tests across every remaining high-risk admin and workflow transition.

## Backend Proposal Review — 2026-06-20

- Retained the existing atomic wallet debit and withdrawal implementation. It already performs the balance check and decrement in one filtered MongoDB update, includes idempotency records, and is integrated with booking escrow and payment release rules.
- Hardened M-Pesa and MTN MoMo callback authentication. Live mode now fails closed when a callback secret is missing, secret comparisons are timing-safe, and generated provider callback URLs carry the configured token.
- Hardened M-Pesa reconciliation with merchant-reference checks, required receipt/amount metadata, amount matching, and atomic pending-to-final transaction updates so duplicate callbacks cannot regress completed payments.
- Kept the existing single-write batch GPS design instead of adding a duplicate tracking collection. Incoming batches are now ordered by recorded time and atomically update both the bounded route history and a cached `lastKnownLocation`.
- Kept the centralized Express error boundary and enriched it with structured validation details plus request method, IP, and request ID logging context.

## Support And Dispute Case Batch - 2026-06-21

- Evolved the existing issue-report collection into the canonical support/dispute case system instead of creating a
  parallel ticket store.
- Used Mongoose transactions for case/booking dispute mutations when the connected MongoDB topology supports them,
  following the official transaction guidance for isolated multi-operation changes.
- Modeled waiting-on-participant states as SLA pauses, with priority-based first-response and resolution targets,
  breach escalation, and operator visibility. This follows Jira Service Management's start/pause/stop SLA pattern;
  iTruck currently counts elapsed time rather than business calendars.
- Kept resolved cases reopenable for a configurable period and made closed cases immutable. Automatic closure defaults
  to seven days, consistent with common solved-to-closed support lifecycle patterns.
- Formal disputes hold the booking. Resolution can resume, cancel, or confirm it; funded cancellations must use
  `refund_required`, which records `refund_pending` until a payment provider confirms the real refund.
- Sources reviewed: [Mongoose transactions](https://mongoosejs.com/docs/transactions.html),
  [Atlassian SLA conditions](https://support.atlassian.com/jira-service-management-cloud/docs/set-up-sla-conditions/),
  [Zendesk ticket lifecycle](https://support.zendesk.com/hc/en-us/articles/8263915942938-About-the-ticket-lifecycle-and-ticket-statuses),
  and [Stripe disputes](https://docs.stripe.com/disputes).

## Research Inputs

- Uber Freight app and shipper pages emphasize instant booking, upfront pricing, facility details, POD upload, real-time tracking, 24/7 support, carrier ratings, multi-stop shipment support, and one workspace for quote/book/track/pay.
- DAT One user feedback highlights a strong need for scan-friendly load summaries: rate, mileage, weight, delivery window, truck type, market context, and filters before users spend time calling.
- Truckstop reviews show that users value easy filtering, visible load/payment/pickup information, factoring/broker reliability signals, and decision tools. Users dislike duplicated/unclear listings, inaccurate details, overwhelming setup, and poor support navigation.
- Freightos user feedback is positive on quote comparison, booking, tracking, chat, and shipment management. Negative feedback clusters around surprise fees, unclear service inclusions, customs/document ambiguity, and hard-to-reach human support when shipments drift.
- African logistics competitors such as Lori Systems and Kobo360 center their value on vetted transporters, rate certainty, cargo safety, real-time or periodic status updates, wallet/payment release, electronic delivery confirmation, and route/cost optimization.
- Amitruck and similar East African freight marketplaces validate demand for direct shipper-to-transporter matching, but also show why iTruck needs stricter trust gates, document proof, payment-release discipline, and SME/LTL differentiation instead of being only a bid board.
- 2026 delivery-proof research reinforced that a digital POD should capture receiver identity/signature or confirmation, timestamp, location/GPS, cargo condition photos, and notes. Sources reviewed: [Project44 POD overview](https://www.project44.com/resources/what-is-a-proof-of-delivery-pod-in-supply-chain/), [ShipBob POD confirmation guide](https://www.shipbob.com/blog/proof-of-delivery-confirmation/), [Planlogi ePOD guide](https://planlogi.com/proof-of-delivery), [Arrivy POD/ePOD guide](https://www.arrivy.com/blog/the-role-of-proof-of-delivery-document/), and [Maersk shipping documentation guidance](https://www.maersk.com/logistics-explained/shipping-documentation/2023/09/27/shipping-documents-us).
- 2026 tracking-page UX review reinforced progressive disclosure for non-technical users: keep the default screen focused on current location/ETA, delivery stage, courier/carrier identity, proof status, and the next action; move secondary tools like full document lists, chat, ratings, and issue workflows behind explicit actions. Sources reviewed: [NN/g progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/), [Baymard order tracking examples](https://baymard.com/ecommerce-design-examples/63-order-tracking-page), [ShipBob POD guide](https://www.shipbob.com/blog/proof-of-delivery-confirmation/), [Pitney Bowes POD guide](https://www.pitneybowes.com/us/blog/proof-of-delivery-guide.html), and [nShift last-mile delivery features](https://nshift.com/blog/last-mile-delivery-management-system-features).

## Codebase Findings

- The app already has the right bones: role-based signup, truck browsing, booking, client and owner workspaces, tracking, documents, payments, notifications, admin, and in-memory demo fallbacks.
- The booking workflow was too thin for real logistics risk. It captured route, vehicle, cargo, payment, and budget, but missed receiver contacts, pickup windows, optional service choices, quote acknowledgement, and document responsibility.
- Estimate logic returned only a total and a few fees. This was vulnerable to the exact user pain seen in reviews: hidden surcharges, unclear inclusions, and weak confidence signals.
- Truck marketplace cards had basic route, price, rating, and verification, but lacked sortable decision context such as best fit, availability, document status, response time, and clearer rate/rating/trip summaries.
- Homepage credibility was weakened by broad claims such as `12,000 verified trucks` and `54 African countries` that the current product and demo data do not substantiate.

## Shipped Decisions

- Added a richer backend estimate engine with line items, cross-border handling, escrow, insurance, optional service fees, required documents, route risk, confidence, and warning messages.
- Persisted booking details that matter operationally: distance, border type, pickup window, cargo value, requirements, receiver contact, communication preference, quiet hours, optional services, estimate, and quote acknowledgement.
- Expanded the booking wizard to six steps: route, vehicle, cargo, contact, review, confirm. The review step now shows fee breakdowns and required documents before confirmation.
- Added explicit quote acknowledgement before a booking can be submitted.
- Improved marketplace filters with best-fit, price, rating, and completed-trip sorting plus minimum rating.
- Improved truck cards with fit score, availability, document status, response time, rate, rating, trip count, capacity, and route chips.
- Reduced homepage overclaiming by changing inflated coverage metrics to smaller priority-lane language.
- Enforced production bidding rules so owners need approved profile documents and an approved, available truck before submitting bids.
- Required delivery proof before delivery completion and approved delivery proof before owner payment release.
- Added destination geofence checks for delivery completion and POD generation when destination coordinates are available.
- Added LTL booking fields, shared-capacity estimates, route keys, and a protected marketplace route-clustering endpoint.
- Added owner-controlled live GPS tracking endpoints, offline telemetry queueing, compressed batch sync, and booking-room realtime tracking updates.
- Clarified delivery closeout in the app: cargo photos are shipper-uploaded evidence visible to the owner/admin, POD or receiver confirmation gates delivery confirmation, and approved delivery proof gates admin payment release.
- Simplified the tracking right rail so the default page now separates shipment status, generated trip documents, delivery closeout, support, and chat. Chat appears only after Contact is chosen, ratings only appear after delivery, and the contact action is role-aware: owners contact shippers, while shippers contact drivers.
- Reduced tracking-page document clutter to two default operational documents: auto-generated waybill and auto-generated delivery proof/receiver confirmation. Generated POD/receiver-confirmation records now count as delivery proof for closeout, while the full document workbench remains available on the Documents page.
- Changed the profile completion prompt so missing verification documents open the Documents page instead of keeping document work inside Settings.

## Regressive Or Deferred

- Did not add a subscription tier, factoring, or financing surface yet. Those can be high value for owners, but adding them without backend workflows would create promises the product cannot fulfill.
- Did not add aggressive background GPS or broad permission prompts. Tracking is owner-controlled from active jobs and only sends updates for confirmed or in-transit bookings.
- Did not hide bus/matatu listings. They may be useful for mixed passenger and parcel logistics in African corridors, but they should remain clearly labeled rather than blended into heavy freight.

## Next High-Value Backlog

- Bid comparison persistence: award bid, counteroffer, rejection reason, and carrier acceptance should become real API-backed workflows.
- Full LTL dispatch and capacity allocation: pickup windows, truck capacity remaining, cargo compatibility, and multi-stop sequencing.
- Facility and depot ratings: wait time, detention history, contact reliability, and loading constraints.
- Receiver e-signature, richer cargo photo evidence, and dispute evidence trails around proof of delivery.
- Duplicate load/truck detection in marketplace results.
- Low-data mode for maps and tracking: text milestones, SMS share links, map fallback, and driver-side WhatsApp/SMS update bridges.
- Production maps upgrade: add routing/geocoding, live markers, road polylines, calculated ETA, and route-deviation
  detection once API keys and quota rules are ready.
