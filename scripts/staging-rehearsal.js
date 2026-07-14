const baseUrl = String(process.env.STAGING_URL || process.argv[2] || '').replace(/\/$/, '');
if (!baseUrl) {
  console.error('Usage: STAGING_URL=https://staging.example node scripts/staging-rehearsal.js');
  process.exit(1);
}

const checks = [
  { name: 'liveness', path: '/api/health/live', status: 200 },
  { name: 'readiness', path: '/api/health/ready', status: 200 },
  { name: 'privacy', path: '/privacy', status: 200 },
  { name: 'terms', path: '/terms', status: 200 }
];
const results = [];

(async () => {
  for (const check of checks) {
    try {
      const response = await fetch(`${baseUrl}${check.path}`, {
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000)
      });
      const body = await response.text();
      const passed =
        response.status === check.status &&
        (!check.contains || body.toLowerCase().includes(check.contains.toLowerCase())) &&
        Boolean(response.headers.get('x-content-type-options'));
      results.push({
        name: check.name,
        passed,
        status: response.status,
        securityHeaders: {
          contentTypeOptions: response.headers.get('x-content-type-options'),
          frameOptions: response.headers.get('x-frame-options'),
          contentSecurityPolicy: Boolean(response.headers.get('content-security-policy'))
        }
      });
    } catch (err) {
      results.push({ name: check.name, passed: false, error: err.message });
    }
  }
  console.log(JSON.stringify({ baseUrl, checkedAt: new Date().toISOString(), results }, null, 2));
  if (results.some((result) => !result.passed)) process.exit(1);
})();
