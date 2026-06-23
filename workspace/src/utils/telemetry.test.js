import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getDeviceId } from './deviceId.js';
import {
  normalizeBrowserPosition,
  shouldSendTelemetry,
  queueTelemetryPoint,
  flushTelemetryQueue
} from './trackingTelemetry.js';

describe('deviceId.js tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('generates a new device ID and retrieves it', () => {
    const id1 = getDeviceId();
    expect(id1).toBeDefined();
    expect(typeof id1).toBe('string');
    expect(id1.length).toBeGreaterThan(10);

    const id2 = getDeviceId();
    expect(id2).toBe(id1);
  });
});

describe('trackingTelemetry.js tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('normalizeBrowserPosition', () => {
    const position = {
      coords: {
        latitude: 1.2921,
        longitude: 36.8219,
        speed: 10,
        heading: 45,
        accuracy: 5
      },
      timestamp: 1719129600000
    };
    const norm = normalizeBrowserPosition(position);
    expect(norm.lat).toBe(1.2921);
    expect(norm.lng).toBe(36.8219);
    expect(norm.speed).toBe(36); // 10 m/s = 36 kph
    expect(norm.heading).toBe(45);
    expect(norm.accuracy).toBe(5);
  });

  it('shouldSendTelemetry', () => {
    const next = { lat: 1.2921, lng: 36.8219, speed: 36 };
    const prev = { lat: 1.2921, lng: 36.8219, speed: 36 };

    // Initial point
    expect(shouldSendTelemetry(next, null, null)).toBe(true);

    // Distance/speed unchanged, no heartbeat elapsed
    expect(shouldSendTelemetry(next, prev, Date.now())).toBe(false);

    // Heartbeat elapsed
    expect(shouldSendTelemetry(next, prev, Date.now() - 60000)).toBe(true);

    // Moved significantly
    const farNext = { lat: 1.35, lng: 36.9, speed: 36 };
    expect(shouldSendTelemetry(farNext, prev, Date.now())).toBe(true);
  });

  it('queueTelemetryPoint and flushTelemetryQueue with localStorage fallback', async () => {
    const point = { lat: 1.2921, lng: 36.8219, speed: 36 };
    const bookingId = 'booking-123';

    // Queue point in fallback mode
    const success = await queueTelemetryPoint(bookingId, point);
    expect(success).toBe(true);

    // Flush telemetry
    const sendBatchSpy = vi.fn().mockResolvedValue(true);
    const flushResult = await flushTelemetryQueue(bookingId, sendBatchSpy);
    expect(flushResult.sent).toBe(1);
    expect(flushResult.raw).toBe(1);
    expect(sendBatchSpy).toHaveBeenCalled();
  });
});
