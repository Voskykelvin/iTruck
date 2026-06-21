const DB_NAME = 'iTruckOfflineTrackingDB';
const STORE_NAME = 'pendingTelemetry';
const DB_VERSION = 1;
const DEFAULT_MIN_DISTANCE_METERS = 10;
const DEFAULT_HEARTBEAT_MS = 30000;
const DEFAULT_SPEED_DELTA_KPH = 5;
const MAX_FLUSH_POINTS = 250;
const LOCAL_STORAGE_PREFIX = 'itruck_tracking_queue_';

let dbPromise;

function distanceMeters(pos1, pos2) {
  if (!pos1 || !pos2) return Infinity;
  const lat1 = Number(pos1.lat);
  const lng1 = Number(pos1.lng);
  const lat2 = Number(pos2.lat);
  const lng2 = Number(pos2.lng);
  if (![lat1, lng1, lat2, lng2].every(Number.isFinite)) return Infinity;

  const earthRadiusMeters = 6371000;
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function normalizeBrowserPosition(position) {
  const coords = position?.coords || {};
  const speedMetersPerSecond = Number(coords.speed);
  const heading = Number(coords.heading);
  const accuracy = Number(coords.accuracy);
  return {
    lat: Number(coords.latitude),
    lng: Number(coords.longitude),
    speed: Number.isFinite(speedMetersPerSecond) ? Number((speedMetersPerSecond * 3.6).toFixed(1)) : 0,
    heading: Number.isFinite(heading) ? heading : 0,
    accuracy: Number.isFinite(accuracy) ? Math.round(accuracy) : undefined,
    timestamp: new Date(position?.timestamp || Date.now()).toISOString()
  };
}

export function shouldSendTelemetry(nextPoint, previousPoint, previousSentAt, options = {}) {
  if (!Number.isFinite(Number(nextPoint?.lat)) || !Number.isFinite(Number(nextPoint?.lng))) return false;
  if (!previousPoint) return true;

  const minDistanceMeters = Number(options.minDistanceMeters || DEFAULT_MIN_DISTANCE_METERS);
  const heartbeatMs = Number(options.heartbeatMs || DEFAULT_HEARTBEAT_MS);
  const speedDeltaKph = Number(options.speedDeltaKph || DEFAULT_SPEED_DELTA_KPH);
  const moved = distanceMeters(nextPoint, previousPoint);
  const speedChanged = Math.abs(Number(nextPoint.speed || 0) - Number(previousPoint.speed || 0));
  const elapsed = previousSentAt ? Date.now() - previousSentAt : Infinity;

  return moved > minDistanceMeters || speedChanged > speedDeltaKph || elapsed > heartbeatMs;
}

function headingDelta(a, b) {
  const delta = Math.abs(Number(a || 0) - Number(b || 0)) % 360;
  return delta > 180 ? 360 - delta : delta;
}

function simplifyTrajectory(points = []) {
  const list = points
    .filter((point) => Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)))
    .sort((a, b) => new Date(a.timestamp || a.queuedAt || 0) - new Date(b.timestamp || b.queuedAt || 0));

  if (list.length <= 2) return list;

  const simplified = [list[0]];
  for (let index = 1; index < list.length - 1; index += 1) {
    const prev = simplified[simplified.length - 1];
    const curr = list[index];
    const bearingDelta = headingDelta(curr.heading, prev.heading);
    const speedDelta = Math.abs(Number(curr.speed || 0) - Number(prev.speed || 0));
    const timeDelta = new Date(curr.timestamp || curr.queuedAt) - new Date(prev.timestamp || prev.queuedAt);

    if (bearingDelta > 15 || speedDelta > DEFAULT_SPEED_DELTA_KPH || timeDelta > 120000) {
      simplified.push(curr);
    }
  }

  simplified.push(list[list.length - 1]);
  return simplified.slice(-MAX_FLUSH_POINTS);
}

function openTrackingDb() {
  if (typeof window === 'undefined' || !('indexedDB' in window)) return Promise.resolve(null);
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('bookingId', 'bookingId', { unique: false });
      }
    };
    request.onsuccess = (event) => resolve(event.target.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

function queueKey(bookingId) {
  return `${LOCAL_STORAGE_PREFIX}${String(bookingId || 'unknown')}`;
}

function readLocalQueue(bookingId) {
  if (typeof localStorage === 'undefined') return [];
  try {
    const value = localStorage.getItem(queueKey(bookingId));
    return value ? JSON.parse(value) : [];
  } catch (_err) {
    return [];
  }
}

function writeLocalQueue(bookingId, points) {
  if (typeof localStorage === 'undefined') return false;
  localStorage.setItem(queueKey(bookingId), JSON.stringify(points.slice(-MAX_FLUSH_POINTS * 2)));
  return true;
}

async function storeRequest(mode = 'readonly') {
  try {
    const db = await openTrackingDb();
    if (!db) return null;
    return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
  } catch (_err) {
    dbPromise = null;
    return null;
  }
}

export async function queueTelemetryPoint(bookingId, point) {
  const store = await storeRequest('readwrite');
  if (!store) {
    const queued = readLocalQueue(bookingId);
    return writeLocalQueue(bookingId, [
      ...queued,
      { ...point, bookingId: String(bookingId), queuedAt: new Date().toISOString() }
    ]);
  }
  return new Promise((resolve, reject) => {
    const request = store.add({ ...point, bookingId: String(bookingId), queuedAt: new Date().toISOString() });
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

async function readTelemetryQueue(bookingId) {
  const store = await storeRequest('readonly');
  if (!store) return readLocalQueue(bookingId);
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => {
      resolve((request.result || []).filter((item) => String(item.bookingId) === String(bookingId)));
    };
    request.onerror = () => reject(request.error);
  });
}

async function clearTelemetryQueue(bookingId) {
  const store = await storeRequest('readwrite');
  if (!store) return writeLocalQueue(bookingId, []);
  return new Promise((resolve, reject) => {
    const request = store.openCursor();
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (!cursor) return resolve(true);
      if (String(cursor.value.bookingId) === String(bookingId)) cursor.delete();
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

export async function flushTelemetryQueue(bookingId, sendBatch) {
  if (typeof sendBatch !== 'function') return { sent: 0, compressed: 0, raw: 0, skipped: true };
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { sent: 0, compressed: 0, raw: 0, skipped: true };
  }
  const queued = await readTelemetryQueue(bookingId);
  if (!queued.length) return { sent: 0, compressed: 0, raw: 0 };

  const compacted = simplifyTrajectory(queued);
  await sendBatch(compacted);
  await clearTelemetryQueue(bookingId);
  return { sent: compacted.length, compressed: queued.length - compacted.length, raw: queued.length };
}
