const DEVICE_ID_KEY = 'itruck_device_id';

function fallbackUuid() {
  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, value =>
    (Number(value) ^ (Math.random() * 16 >> (Number(value) / 4))).toString(16)
  );
}

export function getDeviceId() {
  let value = localStorage.getItem(DEVICE_ID_KEY);
  if (!value) {
    value = globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : fallbackUuid();
    localStorage.setItem(DEVICE_ID_KEY, value);
  }
  return value;
}

export function clearDeviceId() {
  localStorage.removeItem(DEVICE_ID_KEY);
}
