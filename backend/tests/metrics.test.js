const metrics = require('../services/metrics');

beforeEach(() => metrics.reset());

test('metrics record HTTP outcomes and background job state in Prometheus format', () => {
  const req = { method: 'GET', path: '/health/live', route: { path: '/health/live' } };
  const listeners = {};
  const res = {
    statusCode: 200,
    on: jest.fn((event, callback) => {
      listeners[event] = callback;
    })
  };
  metrics.middleware(req, res, jest.fn());
  listeners.finish();
  metrics.recordJob('operational-scan', 'success', 1.25, { abandonedBookings: 2 });

  const output = metrics.renderPrometheus({ itruck_mongodb_ready: 1 });
  expect(output).toContain('itruck_http_requests_total{method="GET",route="/health/live",status="200"} 1');
  expect(output).toContain('itruck_background_job_runs_total{job="operational_scan",status="success"} 1');
  expect(output).toContain('itruck_mongodb_ready 1');
  expect(metrics.snapshot().operational_scan.summary.abandonedBookings).toBe(2);
});
