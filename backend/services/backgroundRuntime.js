const logger = require('../config/logger');
const { mongoReady } = require('../config/runtime');
const { acquireLease, processPendingDeliveries } = require('./notificationWorker');
const { runOperationalNotificationScan } = require('./operationalJobs');
const metrics = require('./metrics');
const { sendAlert } = require('./alerting');

let deliveryTimer;
let operationsTimer;
let runningDeliveries = false;
let runningOperations = false;

function intervalFromEnv(value, fallback, minimum) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum ? Math.floor(parsed) : fallback;
}

async function runDeliveryCycle() {
  if (runningDeliveries || !mongoReady()) return;
  runningDeliveries = true;
  const started = process.hrtime.bigint();
  try {
    const summary = await processPendingDeliveries();
    metrics.recordJob('notification-delivery', 'success', Number(process.hrtime.bigint() - started) / 1e9, summary);
    if (summary.processed) logger.info(summary, 'Notification delivery cycle complete');
  } catch (err) {
    metrics.recordJob('notification-delivery', 'error', Number(process.hrtime.bigint() - started) / 1e9);
    logger.error({ err }, 'Notification delivery cycle failed');
    await sendAlert('notification-delivery-failed', 'Notification delivery cycle failed', { error: err.message });
  } finally {
    runningDeliveries = false;
  }
}

async function runOperationsCycle(io) {
  if (runningOperations || !mongoReady()) return;
  runningOperations = true;
  const started = process.hrtime.bigint();
  try {
    const intervalMs = intervalFromEnv(process.env.OPERATIONS_SCAN_INTERVAL_MS, 15 * 60 * 1000, 60_000);
    const acquired = await acquireLease('operational-notification-scan', intervalMs);
    if (acquired) {
      const summary = await runOperationalNotificationScan({ io });
      metrics.recordJob('operational-scan', 'success', Number(process.hrtime.bigint() - started) / 1e9, summary);
    }
  } catch (err) {
    metrics.recordJob('operational-scan', 'error', Number(process.hrtime.bigint() - started) / 1e9);
    logger.error({ err }, 'Operational notification scan failed');
    await sendAlert('operational-scan-failed', 'Operational scan failed', { error: err.message });
  } finally {
    runningOperations = false;
  }
}

function startBackgroundRuntime(io) {
  if (process.env.DISABLE_BACKGROUND_JOBS === 'true') {
    logger.info('Background jobs disabled by configuration');
    return;
  }
  if (deliveryTimer || operationsTimer) return;

  const deliveryIntervalMs = intervalFromEnv(process.env.NOTIFICATION_WORKER_INTERVAL_MS, 15_000, 1000);
  const operationsIntervalMs = intervalFromEnv(process.env.OPERATIONS_SCAN_INTERVAL_MS, 15 * 60 * 1000, 60_000);
  deliveryTimer = setInterval(runDeliveryCycle, deliveryIntervalMs);
  operationsTimer = setInterval(() => runOperationsCycle(io), operationsIntervalMs);
  deliveryTimer.unref();
  operationsTimer.unref();

  setImmediate(runDeliveryCycle);
  setImmediate(() => runOperationsCycle(io));
  logger.info({ deliveryIntervalMs, operationsIntervalMs }, 'Background notification runtime started');
}

function stopBackgroundRuntime() {
  if (deliveryTimer) clearInterval(deliveryTimer);
  if (operationsTimer) clearInterval(operationsTimer);
  deliveryTimer = undefined;
  operationsTimer = undefined;
}

module.exports = {
  runDeliveryCycle,
  runOperationsCycle,
  startBackgroundRuntime,
  stopBackgroundRuntime
};
