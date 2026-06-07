# iTruck Role Onboarding Flow

## Account Modes

iTruck uses one workspace shell with role-specific navigation.

- Shippers see shipment creation, bid review, orders, tracking, documents, payments, messages, and settings.
- Owners see verification, vehicles, available work, bids, jobs, documents, payments, messages, and settings.
- Admin pages are hidden from non-admin users and guarded by role checks.

## Registration

1. User chooses Shipper or Owner on the landing page.
2. Account is created with the selected backend role.
3. User lands on `/app/onboarding`.
4. User uploads role documents.
5. Owner users add each vehicle with plate, type, capacity, routes, and vehicle photos.
6. Owner users upload insurance, logbook, road license, and inspection proof for each vehicle.
7. Documents enter admin review with `pending` status.
8. Production bidding stays locked until required owner and truck documents are approved.

## Shipper Flow

1. Complete shipper verification.
2. Create a shipment request.
3. Choose full-truck or LTL/shared-capacity details where appropriate.
4. Review carrier bids from the Bids page.
5. Award a bid.
6. Track live shipment location, messages, documents, and invoices.
7. Upload POD or receiver confirmation before delivery is completed.
8. Rate the carrier after delivery is confirmed.

## Owner Flow

1. Complete owner verification.
2. Register vehicles.
3. Upload vehicle photos and vehicle documents.
4. Find open work from the Bids page.
5. Submit bids only with an approved, available vehicle.
6. Manage awarded jobs, live GPS tracking, pickup updates, messages, documents, and payouts.
7. Provide location updates for geofence-sensitive delivery completion when destination coordinates are present.
8. Rate the shipper after delivery is confirmed.

## Delivery and Payment Rules

- Delivery completion requires uploaded POD or receiver confirmation.
- Live tracking updates are accepted only from the assigned owner or admin while the booking is confirmed or in transit.
- When destination coordinates are present, delivery completion and generated POD output require the latest driver location to be inside the delivery geofence.
- Admin payment release requires delivered status, escrowed funds, and approved POD or receiver confirmation.
- Payment release actions are recorded in the admin audit log.

## LTL and Consolidation Rules

- Shippers can create LTL bookings with cargo weight and reserved-capacity metadata.
- LTL estimates use shared-capacity pricing and can recommend route clustering.
- Marketplace cluster summaries are authenticated and lane-level; they should not expose individual shipper records.

## Rating Rules

- Ratings are tied to delivered bookings, not public browsing cards.
- Shippers rate carriers/trucks after delivery.
- Owners rate shippers after delivery.
- Aggregate rating values are recomputed from completed booking ratings.
