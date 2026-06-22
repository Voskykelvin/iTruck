# Final Launch Audit

The launch decision requires green evidence for:

- backend, frontend, infrastructure, authorization, and financial tests;
- Chromium, Firefox, and WebKit E2E plus automated WCAG serious/critical checks;
- staging rehearsal and rollback drill;
- load thresholds using production-like data and topology;
- verified backup and isolated restore;
- monitoring dashboards, alert routing, and on-call ownership;
- provider certification evidence;
- privacy and terms reviewed for every operating jurisdiction;
- no unresolved critical/high security findings;
- a named launch owner and rollback decision-maker.

Run `npm run launch:audit` for the repository/environment gate. It supplements, rather than replaces, the signed human launch review.
