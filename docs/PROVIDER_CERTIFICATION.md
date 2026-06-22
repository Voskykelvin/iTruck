# Provider Certification

Run `npm run providers:certify` for the configuration gate and `npm run providers:probe` in an approved sandbox/staging environment to verify provider authentication without moving money.

Final certification must record, for each enabled provider:

- one successful and one failed refund;
- one successful and one failed payout, including wallet compensation;
- duplicate callback and duplicate idempotency-key behavior;
- callback authentication and final status reconciliation;
- email and SMS provider acceptance plus delivery/failed receipts;
- web-push subscription, delivery, click-through, expiry, and unsubscribe;
- sandbox evidence, production credentials, approved callback URLs, limits, fees, settlement times, and support contacts.

Provider onboarding and live transaction certification cannot be completed from source code alone. Store signed provider approval and transaction references with the launch evidence.
