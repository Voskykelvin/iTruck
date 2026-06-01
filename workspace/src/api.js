import { getDeviceId } from './utils/deviceId.js';

const configuredApiBase = import.meta.env.VITE_API_BASE || '';
const API_BASE = configuredApiBase.includes('your-domain.example') ? '/api' : configuredApiBase || '/api';

function token() {
  return localStorage.getItem('itruck_token') || '';
}

function idempotencyKey(scope) {
  const suffix =
    globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${scope}:${suffix}`;
}

async function tryRefresh() {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Device-Id': getDeviceId() }
    });
    if (!response.ok) return false;
    const data = await response.json();
    setSession(data);
    return Boolean(data.token);
  } catch (_err) {
    return false;
  }
}

async function request(path, options = {}, retry = true) {
  const isForm = options.body instanceof FormData;
  const headers = isForm
    ? {
        'X-Device-Id': getDeviceId(),
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        ...(options.headers || {})
      }
    : {
        'Content-Type': 'application/json',
        'X-Device-Id': getDeviceId(),
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        ...(options.headers || {})
      };

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
  } catch (_err) {
    throw new Error('Unable to reach iTruck API');
  }

  if (response.status === 401 && retry && !path.startsWith('/auth/login') && path !== '/auth/refresh') {
    const refreshed = await tryRefresh();
    if (refreshed) return request(path, options, false);
    clearSession();
  }

  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json().catch(() => ({})) : await response.text();
  if (!response.ok) throw new Error(data.message || data || 'Request failed');
  return data;
}

async function downloadFile(path, filename, options = {}, retry = true) {
  const isForm = options.body instanceof FormData;
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        ...(options.body && !isForm ? { 'Content-Type': 'application/json' } : {}),
        'X-Device-Id': getDeviceId(),
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        ...(options.headers || {})
      }
    });
  } catch (_err) {
    throw new Error('Unable to reach iTruck API');
  }

  if (response.status === 401 && retry) {
    const refreshed = await tryRefresh();
    if (refreshed) return downloadFile(path, filename, options, false);
    clearSession();
  }

  if (!response.ok) {
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json().catch(() => ({})) : await response.text();
    throw new Error(data.message || data || 'Download failed');
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return { filename };
}

function documentFilename(type, bookingId) {
  return `${bookingId}-${type}.pdf`;
}

function filesBody(field, files) {
  const body = new FormData();
  Array.from(files || []).forEach((file) => body.append(field, file));
  return body;
}

async function uploadCargoFiles(files) {
  return request('/upload/cargo', { method: 'POST', body: filesBody('files', files) });
}

async function uploadDocument(path, documentType, file) {
  const data = await uploadCargoFiles([file]);
  const url = data.urls?.[0];
  if (!url) throw new Error('Document upload did not return a URL');
  return request(path, {
    method: 'PATCH',
    body: JSON.stringify({ url, fileName: file.name, documentType })
  });
}

export const api = {
  request,
  health: () => request('/health'),
  estimate: (payload) => request('/marketplace/estimate', { method: 'POST', body: JSON.stringify(payload) }),
  listTrucks: () => request('/trucks'),
  fleetTrucks: () => request('/trucks/fleet'),
  listBookings: () => request('/bookings'),
  listOpenBookings: () => request('/bookings/open'),
  getBooking: (bookingId) => request(`/bookings/${encodeURIComponent(bookingId)}`),
  createBooking: (payload) => request('/bookings', { method: 'POST', body: JSON.stringify(payload) }),
  confirmDelivery: (bookingId) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/confirm-delivery`, { method: 'PATCH' }),
  updateBookingStatus: (bookingId, payload) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  createTruck: (payload) => request('/trucks', { method: 'POST', body: JSON.stringify(payload) }),
  rateBooking: (bookingId, payload) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/ratings`, { method: 'POST', body: JSON.stringify(payload) }),
  rateTruck: (id, payload) =>
    request(`/trucks/${encodeURIComponent(id)}/ratings`, { method: 'POST', body: JSON.stringify(payload) }),
  wallet: () => request('/payments/wallet'),
  releasePayment: (bookingId) =>
    request(`/payments/bookings/${encodeURIComponent(bookingId)}/release`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey('release') }
    }),
  withdraw: (payload) =>
    request('/payments/withdraw', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey('withdraw') },
      body: JSON.stringify(payload)
    }),
  workflow: (query) => request(`/workflow${query || ''}`),
  listMessages: (bookingId) => request(`/workflow/messages?booking=${encodeURIComponent(bookingId)}`),
  sendMessage: (payload) => request('/workflow/messages', { method: 'POST', body: JSON.stringify(payload) }),
  listNotifications: (limit = 20) => request(`/notifications?limit=${encodeURIComponent(limit)}`),
  notificationCount: () => request('/notifications/count'),
  markNotificationRead: (id) => request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' }),
  downloadDocument: (type, bookingId) =>
    downloadFile(
      `/documents/${encodeURIComponent(type)}/${encodeURIComponent(bookingId)}`,
      documentFilename(type, bookingId)
    ),
  downloadDraftDocument: (type, payload) =>
    downloadFile(`/documents/draft/${encodeURIComponent(type)}`, `draft-${type}.pdf`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  uploadCargo: uploadCargoFiles,
  uploadAvatar: (file) => {
    const body = new FormData();
    body.append('file', file);
    return request('/upload/avatar', { method: 'POST', body });
  },
  uploadProfileDocument: (documentType, file) =>
    uploadDocument(`/users/documents/${encodeURIComponent(documentType)}`, documentType, file),
  uploadTruckDocument: (truckId, documentType, file) =>
    uploadDocument(
      `/trucks/${encodeURIComponent(truckId)}/documents/${encodeURIComponent(documentType)}`,
      documentType,
      file
    ),
  uploadTruckPhoto: async (truckId, file) => {
    const data = await uploadCargoFiles([file]);
    const url = data.urls?.[0];
    if (!url) throw new Error('Photo upload did not return a URL');
    return request(`/trucks/${encodeURIComponent(truckId)}/photos`, {
      method: 'PATCH',
      body: JSON.stringify({ url, fileName: file.name })
    });
  },
  adminStats: () => request('/admin/stats'),
  adminListUsers: () => request('/admin/users'),
  adminListTrucks: () => request('/admin/trucks'),
  adminListBookings: () => request('/admin/bookings'),
  adminListPayments: () => request('/admin/payments'),
  adminAuditLogs: () => request('/admin/audit-logs'),
  adminSetUserActive: (userId, isActive) =>
    request(`/admin/users/${encodeURIComponent(userId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive })
    }),
  adminVerifyTruck: (truckId, isVerified) =>
    request(`/admin/trucks/${encodeURIComponent(truckId)}/verification`, {
      method: 'PATCH',
      body: JSON.stringify({ isVerified })
    }),
  adminReviewUserDocument: (userId, documentType, payload) =>
    request(`/admin/users/${encodeURIComponent(userId)}/documents/${encodeURIComponent(documentType)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  adminReviewTruckDocument: (truckId, documentType, payload) =>
    request(`/admin/trucks/${encodeURIComponent(truckId)}/documents/${encodeURIComponent(documentType)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  adminNotify: (payload) => request('/admin/notify', { method: 'POST', body: JSON.stringify(payload) }),
  acceptBookingBid: (bookingId, bidId) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/bids/${encodeURIComponent(bidId)}/accept`, {
      method: 'PATCH'
    }),
  submitBookingBid: (bookingId, payload) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/bids`, { method: 'POST', body: JSON.stringify(payload) }),
  submitBid: (payload) => request('/workflow/bids', { method: 'POST', body: JSON.stringify(payload) }),
  reportIssue: (payload) => request('/workflow/reports', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ ...payload, deviceId: getDeviceId() }) }),
  logout: () => request('/auth/logout', { method: 'POST' }).finally(clearSession),
  listSessions: () => request('/auth/sessions'),
  revokeSession: (id) => request(`/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  revokeOtherSessions: () => request('/auth/sessions', { method: 'DELETE' }),
  revokeEverywhere: () => request('/auth/sessions?everywhere=true', { method: 'DELETE' }),
  register: (role, payload) =>
    request(`/auth/register/${role}`, { method: 'POST', body: JSON.stringify({ ...payload, deviceId: getDeviceId() }) })
};

export function setSession(data) {
  if (data?.token || data?.accessToken) localStorage.setItem('itruck_token', data.token || data.accessToken);
  if (data?.user) localStorage.setItem('itruck_user', JSON.stringify(data.user));
}

export function clearSession() {
  localStorage.removeItem('itruck_token');
  localStorage.removeItem('itruck_user');
}

export function currentUser() {
  return JSON.parse(localStorage.getItem('itruck_user') || '{}');
}
