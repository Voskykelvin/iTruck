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

## Shipper Flow

1. Complete shipper verification.
2. Create a shipment request.
3. Review carrier bids from the Bids page.
4. Award a bid.
5. Track shipment, messages, documents, and invoices.
6. Rate the carrier after delivery is confirmed.

## Owner Flow

1. Complete owner verification.
2. Register vehicles.
3. Upload vehicle photos and vehicle documents.
4. Find open work from the Bids page.
5. Submit bids.
6. Manage awarded jobs, pickup updates, messages, documents, and payouts.
7. Rate the shipper after delivery is confirmed.

## Rating Rules

- Ratings are tied to delivered bookings, not public browsing cards.
- Shippers rate carriers/trucks after delivery.
- Owners rate shippers after delivery.
- Aggregate rating values are recomputed from completed booking ratings.
