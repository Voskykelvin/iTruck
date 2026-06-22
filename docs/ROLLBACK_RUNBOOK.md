# Release and Rollback Runbook

## Before deployment

1. Record the current image tag and database migration state.
2. Confirm a recent verified backup.
3. Run CI, cross-browser E2E, Docker verification, load thresholds, launch audit, and staging rehearsal.
4. Confirm provider webhook endpoints and secrets in staging.

## Rollback drill

1. Deploy the candidate image to staging and complete a booking/payment/delivery smoke journey.
2. Re-deploy the previous immutable image tag.
3. Confirm `/api/health/ready`, login, booking reads, notification queue processing, and provider webhook acceptance.
4. If data compatibility changed, follow the documented forward-fix or restore decision; never restore over production before preserving the current database.
5. Record recovery time and any manual steps.

Production rollback is complete only after readiness is stable, error rate is normal, queues are draining, and financial reconciliation shows no duplicate movement.
