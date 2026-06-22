# iTruck Operations Runbook

## Service signals

- Liveness: `GET /api/health/live`
- Readiness: `GET /api/health/ready`
- Prometheus metrics: `GET /api/metrics` with `Authorization: Bearer $METRICS_AUTH_TOKEN`
- Background-job state: `GET /api/operations/jobs` with the same token

Alert on sustained readiness failures, HTTP 5xx rate, p95 latency, failed notification deliveries, failed operational scans, Mongo capacity, Redis memory, and backup age. Configure `OPERATIONS_ALERT_WEBHOOK_URL` for immediate background-job failure alerts.

## Incident response

1. Confirm liveness and readiness independently.
2. Check the deployment log and the metrics for the failing route or job.
3. Stop payment/provider retries if duplicate external movement is possible.
4. Preserve provider payloads, transaction IDs, audit records, and timestamps.
5. Roll back using `ROLLBACK_RUNBOOK.md` when the current release is causal.
6. Record impact, recovery time, and follow-up actions.

## Routine checks

- Daily: readiness, alerts, failed notification deliveries, pending withdrawals, payment callbacks.
- Weekly: restore the latest backup into an isolated database and run smoke tests.
- Before every release: `npm run ci:check`, browser E2E, `npm run docker:verify`, staging rehearsal, and launch audit.
