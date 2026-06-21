jest.mock('../config/runtime', () => ({
  mongoReady: jest.fn(() => true)
}));
jest.mock('../services/notificationWorker', () => ({
  acquireLease: jest.fn(),
  processPendingDeliveries: jest.fn()
}));
jest.mock('../services/operationalJobs', () => ({
  runOperationalNotificationScan: jest.fn()
}));

const { mongoReady } = require('../config/runtime');
const { acquireLease, processPendingDeliveries } = require('../services/notificationWorker');
const { runOperationalNotificationScan } = require('../services/operationalJobs');
const {
  runDeliveryCycle,
  runOperationsCycle,
  startBackgroundRuntime,
  stopBackgroundRuntime
} = require('../services/backgroundRuntime');

beforeEach(() => {
  jest.clearAllMocks();
  delete process.env.DISABLE_BACKGROUND_JOBS;
  delete process.env.NOTIFICATION_WORKER_INTERVAL_MS;
  delete process.env.OPERATIONS_SCAN_INTERVAL_MS;
  mongoReady.mockReturnValue(true);
  processPendingDeliveries.mockResolvedValue({ processed: 1, sent: 1, failed: 0, retried: 0 });
  acquireLease.mockResolvedValue(true);
  runOperationalNotificationScan.mockResolvedValue({ expired: 0, expiring: 0, staleTracking: 0 });
});

afterEach(() => {
  stopBackgroundRuntime();
  jest.restoreAllMocks();
});

test('delivery cycle only runs while MongoDB is ready', async () => {
  mongoReady.mockReturnValueOnce(false);
  await runDeliveryCycle();
  expect(processPendingDeliveries).not.toHaveBeenCalled();

  await runDeliveryCycle();
  expect(processPendingDeliveries).toHaveBeenCalledTimes(1);
});

test('operations cycle requires the distributed lease', async () => {
  acquireLease.mockResolvedValueOnce(false);
  await runOperationsCycle({ marker: 'io' });
  expect(runOperationalNotificationScan).not.toHaveBeenCalled();

  await runOperationsCycle({ marker: 'io' });
  expect(runOperationalNotificationScan).toHaveBeenCalledWith({ io: { marker: 'io' } });
});

test('background runtime schedules immediate and recurring work and can stop cleanly', async () => {
  const timers = [];
  const setIntervalSpy = jest.spyOn(global, 'setInterval').mockImplementation((callback, delay) => {
    const timer = { callback, delay, unref: jest.fn() };
    timers.push(timer);
    return timer;
  });
  const clearIntervalSpy = jest.spyOn(global, 'clearInterval').mockImplementation(() => {});
  jest.spyOn(global, 'setImmediate').mockImplementation((callback) => {
    callback();
    return {};
  });

  startBackgroundRuntime({ marker: 'io' });
  await Promise.resolve();
  await Promise.resolve();

  expect(setIntervalSpy).toHaveBeenCalledTimes(2);
  expect(timers.map((timer) => timer.delay)).toEqual([15_000, 15 * 60 * 1000]);
  expect(timers.every((timer) => timer.unref.mock.calls.length === 1)).toBe(true);
  expect(processPendingDeliveries).toHaveBeenCalled();
  expect(runOperationalNotificationScan).toHaveBeenCalled();

  stopBackgroundRuntime();
  expect(clearIntervalSpy).toHaveBeenCalledTimes(2);
});

test('background runtime respects the disable flag', () => {
  process.env.DISABLE_BACKGROUND_JOBS = 'true';
  const setIntervalSpy = jest.spyOn(global, 'setInterval');

  startBackgroundRuntime();

  expect(setIntervalSpy).not.toHaveBeenCalled();
});
