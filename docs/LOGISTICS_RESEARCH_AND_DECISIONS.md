# iTruck Logistics Research And Product Decisions

Date: 2026-05-25

## Research Inputs

- Uber Freight app and shipper pages emphasize instant booking, upfront pricing, facility details, POD upload, real-time tracking, 24/7 support, carrier ratings, multi-stop shipment support, and one workspace for quote/book/track/pay.
- DAT One user feedback highlights a strong need for scan-friendly load summaries: rate, mileage, weight, delivery window, truck type, market context, and filters before users spend time calling.
- Truckstop reviews show that users value easy filtering, visible load/payment/pickup information, factoring/broker reliability signals, and decision tools. Users dislike duplicated/unclear listings, inaccurate details, overwhelming setup, and poor support navigation.
- Freightos user feedback is positive on quote comparison, booking, tracking, chat, and shipment management. Negative feedback clusters around surprise fees, unclear service inclusions, customs/document ambiguity, and hard-to-reach human support when shipments drift.
- African logistics competitors such as Lori Systems and Kobo360 center their value on vetted transporters, rate certainty, cargo safety, real-time or periodic status updates, wallet/payment release, electronic delivery confirmation, and route/cost optimization.
- Amitruck and similar East African freight marketplaces validate demand for direct shipper-to-transporter matching, but also show why iTruck needs stricter trust gates, document proof, payment-release discipline, and SME/LTL differentiation instead of being only a bid board.
- 2026 delivery-proof research reinforced that a digital POD should capture receiver identity/signature or confirmation, timestamp, location/GPS, cargo condition photos, and notes. Sources reviewed: [Project44 POD overview](https://www.project44.com/resources/what-is-a-proof-of-delivery-pod-in-supply-chain/), [ShipBob POD confirmation guide](https://www.shipbob.com/blog/proof-of-delivery-confirmation/), [Planlogi ePOD guide](https://planlogi.com/proof-of-delivery), [Arrivy POD/ePOD guide](https://www.arrivy.com/blog/the-role-of-proof-of-delivery-document/), and [Maersk shipping documentation guidance](https://www.maersk.com/logistics-explained/shipping-documentation/2023/09/27/shipping-documents-us).

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

## Regressive Or Deferred

- Did not add a subscription tier, factoring, or financing surface yet. Those can be high value for owners, but adding them without backend workflows would create promises the product cannot fulfill.
- Did not add aggressive background GPS or broad permission prompts. Tracking is owner-controlled from active jobs and only sends updates for confirmed or in-transit bookings.
- Did not hide bus/matatu listings. They may be useful for mixed passenger and parcel logistics in African corridors, but they should remain clearly labeled rather than blended into heavy freight.

## Next High-Value Backlog

- Bid comparison persistence: award bid, counteroffer, rejection reason, and carrier acceptance should become real API-backed workflows.
- Full LTL dispatch and capacity allocation: pickup windows, truck capacity remaining, cargo compatibility, and multi-stop sequencing.
- Facility and depot ratings: wait time, detention history, contact reliability, and loading constraints.
- Support case tracking: status, owner, SLA timer, escalation trail, and issue categories tied to shipment IDs.
- Receiver e-signature, richer cargo photo evidence, and dispute evidence trails around proof of delivery.
- Duplicate load/truck detection in marketplace results.
- Low-data mode for maps and tracking: text milestones, SMS share links, map fallback, and driver-side WhatsApp/SMS update bridges.
- Production maps upgrade: Google Maps JavaScript markers, route polylines, ETA, and optional geocoding once API keys and quota rules are ready.
