const target = new URL(process.env.LOAD_TEST_URL || process.argv[2] || 'http://127.0.0.1:5000/api/health/live');
const durationSeconds = Math.max(1, Number(process.env.LOAD_TEST_DURATION_SECONDS || 15));
const concurrency = Math.max(1, Number(process.env.LOAD_TEST_CONCURRENCY || 20));
const maxP95Ms = Math.max(1, Number(process.env.LOAD_TEST_MAX_P95_MS || 750));
const maxErrorRate = Math.max(0, Number(process.env.LOAD_TEST_MAX_ERROR_RATE || 0.01));
const stopAt = Date.now() + durationSeconds * 1000;
const latencies = [];
let requests = 0;
let errors = 0;

async function worker() {
  while (Date.now() < stopAt) {
    const started = performance.now();
    try {
      const response = await fetch(target, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) errors += 1;
      await response.arrayBuffer();
    } catch (_err) {
      errors += 1;
    } finally {
      latencies.push(performance.now() - started);
      requests += 1;
    }
  }
}

Promise.all(Array.from({ length: concurrency }, worker)).then(() => {
  latencies.sort((a, b) => a - b);
  const percentile = (value) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * value))] || 0;
  const errorRate = requests ? errors / requests : 1;
  const result = {
    target: target.toString(),
    durationSeconds,
    concurrency,
    requests,
    requestsPerSecond: Number((requests / durationSeconds).toFixed(2)),
    errors,
    errorRate: Number(errorRate.toFixed(4)),
    p50Ms: Number(percentile(0.5).toFixed(2)),
    p95Ms: Number(percentile(0.95).toFixed(2)),
    p99Ms: Number(percentile(0.99).toFixed(2))
  };
  console.log(JSON.stringify(result, null, 2));
  if (result.p95Ms > maxP95Ms || errorRate > maxErrorRate) process.exit(1);
});
