const counters = new Map();
const gauges = new Map();
const jobState = new Map();

function safeName(value) {
  return String(value || 'unknown')
    .replace(/[^a-zA-Z0-9_:]/g, '_')
    .replace(/_+/g, '_');
}

function labelString(labels = {}) {
  const entries = Object.entries(labels).filter(([, value]) => value !== undefined && value !== null);
  if (!entries.length) return '';
  return `{${entries
    .map(([key, value]) => `${safeName(key)}="${String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`)
    .join(',')}}`;
}

function metricKey(name, labels) {
  return `${safeName(name)}${labelString(labels)}`;
}

function increment(name, labels = {}, amount = 1) {
  const key = metricKey(name, labels);
  counters.set(key, (counters.get(key) || 0) + Number(amount || 0));
}

function gauge(name, value, labels = {}) {
  gauges.set(metricKey(name, labels), Number(value || 0));
}

function observeRequest(req, res, elapsedSeconds) {
  const route = req.route?.path || req.baseUrl || req.path || 'unmatched';
  const labels = {
    method: req.method,
    route: String(route).slice(0, 160),
    status: res.statusCode
  };
  increment('itruck_http_requests_total', labels);
  increment('itruck_http_request_duration_seconds_sum', labels, elapsedSeconds);
  increment('itruck_http_request_duration_seconds_count', labels);
}

function middleware(req, res, next) {
  if (req.path === '/metrics') return next();
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    const elapsed = Number(process.hrtime.bigint() - started) / 1e9;
    observeRequest(req, res, elapsed);
  });
  next();
}

function recordJob(name, status, durationSeconds, summary = {}) {
  const normalizedName = safeName(name);
  increment('itruck_background_job_runs_total', { job: normalizedName, status });
  increment('itruck_background_job_duration_seconds_sum', { job: normalizedName }, durationSeconds);
  increment('itruck_background_job_duration_seconds_count', { job: normalizedName });
  jobState.set(normalizedName, {
    status,
    completedAt: Date.now(),
    durationSeconds,
    summary
  });
}

function snapshot() {
  return Object.fromEntries(jobState.entries());
}

function renderPrometheus(extra = {}) {
  gauge('itruck_process_uptime_seconds', process.uptime());
  gauge('itruck_process_resident_memory_bytes', process.memoryUsage().rss);
  gauge('itruck_process_heap_used_bytes', process.memoryUsage().heapUsed);
  Object.entries(extra).forEach(([name, value]) => gauge(name, value));

  const lines = [
    '# HELP itruck_http_requests_total Total HTTP responses.',
    '# TYPE itruck_http_requests_total counter',
    '# HELP itruck_background_job_runs_total Background job outcomes.',
    '# TYPE itruck_background_job_runs_total counter'
  ];
  [...counters.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, value]) => lines.push(`${key} ${value}`));
  [...gauges.entries()].sort(([a], [b]) => a.localeCompare(b)).forEach(([key, value]) => lines.push(`${key} ${value}`));

  for (const [job, state] of [...jobState.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(
      `itruck_background_job_last_success_timestamp_seconds{job="${job}"} ${
        state.status === 'success' ? state.completedAt / 1000 : 0
      }`
    );
    lines.push(`itruck_background_job_last_duration_seconds{job="${job}"} ${Number(state.durationSeconds || 0)}`);
  }
  return `${lines.join('\n')}\n`;
}

function reset() {
  counters.clear();
  gauges.clear();
  jobState.clear();
}

module.exports = {
  gauge,
  increment,
  middleware,
  recordJob,
  renderPrometheus,
  reset,
  snapshot
};
