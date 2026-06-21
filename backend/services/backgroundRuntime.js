const logger = require('../config/logger');
const { mongoReady } = require('../config/runtime');
const { acquireLease, processPendingDeliveries } = require('./notificationWorker');
const { runOperationalNotificationScan } = require('./operationalJobs');

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
  try {
    const summary = await processPendingDeliveries();
    if (summary.processed) logger.info(summary, 'Notification delivery cycle complete');
  } catch (err) {
    logger.error({ err }, 'Notification delivery cycle failed');
  } finally {
    runningDeliveries = false;
  }
}

async function runOperationsCycle(io) {
  if (runningOperations || !mongoReady()) return;
  runningOperations = true;
  try {
    const intervalMs = intervalFromEnv(process.env.OPERATIONS_SCAN_INTERVAL_MS, 15 * 60 * 1000, 60_000);
    const acquired = await acquireLease('operational-notification-scan', intervalMs);
    if (acquired) await runOperationalNotificationScan({ io });
  } catch (err) {
    logger.error({ err }, 'Operational notification scan failed');
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
