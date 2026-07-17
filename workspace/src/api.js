import { getDeviceId } from './utils/deviceId.js';

const configuredApiBase = import.meta.env.VITE_API_BASE || '';
const API_BASE = configuredApiBase.includes('your-domain.example') ? '/api' : configuredApiBase || '/api';
const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const documentUploadTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const imageUploadTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
let refreshPromise = null;

function cookieValue(name) {
  if (typeof document === 'undefined') return '';
  const prefix = `${encodeURIComponent(name)}=`;
  const value = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return value ? decodeURIComponent(value.slice(prefix.length)) : '';
}

function csrfHeaders() {
  const csrf = cookieValue('itruck_csrf');
  return csrf ? { 'X-CSRF-Token': csrf } : {};
}

function hasSessionHint() {
  if (cookieValue('itruck_csrf')) return true;
  try {
    return Boolean(JSON.parse(localStorage.getItem('itruck_user') || '{}')?.email);
  } catch (_err) {
    return false;
  }
}

function idempotencyKey(scope) {
  const suffix =
    globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `${scope}:${suffix}`;
}

function messageFromValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(messageFromValue).filter(Boolean).join(', ');

  if (typeof value === 'object') {
    if (value.message) return messageFromValue(value.message);
    if (value.msg) return messageFromValue(value.msg);
    if (value.error) return messageFromValue(value.error);

    const field = value.field || value.path || value.param;
    const detail = value.detail || value.reason || value.description;
    if (field && detail) return `${field}: ${messageFromValue(detail)}`;
    if (field && value.value) return `${field}: ${messageFromValue(value.value)}`;

    return Object.entries(value)
      .map(([key, nested]) => {
        const message = messageFromValue(nested);
        return message ? `${key}: ${message}` : '';
      })
      .filter(Boolean)
      .join(', ');
  }

  return '';
}

function apiErrorMessage(data, fallback) {
  if (typeof data === 'string') return data || fallback;
  if (!data || typeof data !== 'object') return fallback;

  const details = messageFromValue(data.errors || data.details);
  const message = messageFromValue(data.message || data.error);
  if (message && details) return `${message}: ${details}`;
  return message || details || messageFromValue(data) || fallback;
}

async function refreshSession() {
  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Device-Id': getDeviceId(), ...csrfHeaders() }
    });
    if (!response.ok) return false;
    const data = await response.json();
    setSession(data);
    return Boolean(data.user);
  } catch (_err) {
    return false;
  }
}

async function tryRefresh() {
  if (!refreshPromise) {
    refreshPromise = refreshSession().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

async function request(path, options = {}, retry = true) {
  const isForm = options.body instanceof FormData;
  const headers = isForm
    ? {
        'X-Device-Id': getDeviceId(),
        ...csrfHeaders(),
        ...(options.headers || {})
      }
    : {
        'Content-Type': 'application/json',
        'X-Device-Id': getDeviceId(),
        ...csrfHeaders(),
        ...(options.headers || {})
      };

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
  } catch (_err) {
    throw new Error('Unable to reach iTruck API');
  }

  if (response.status === 401 && retry && !path.startsWith('/auth/login') && path !== '/auth/refresh') {
    const refreshed = hasSessionHint() ? await tryRefresh() : false;
    if (refreshed) return request(path, options, false);
    clearSession();
  }

  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json().catch(() => ({})) : await response.text();
  if (!response.ok) {
    const error = new Error(apiErrorMessage(data, 'Request failed'));
    error.status = response.status;
    throw error;
  }
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
        ...csrfHeaders(),
        ...(options.headers || {})
      }
    });
  } catch (_err) {
    throw new Error('Unable to reach iTruck API');
  }

  if (response.status === 401 && retry) {
    const refreshed = hasSessionHint() ? await tryRefresh() : false;
    if (refreshed) return downloadFile(path, filename, options, false);
    clearSession();
  }

  if (!response.ok) {
    const type = response.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await response.json().catch(() => ({})) : await response.text();
    throw new Error(apiErrorMessage(data, 'Download failed'));
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

function queryString(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') query.set(key, value);
  });
  const text = query.toString();
  return text ? `?${text}` : '';
}

function filesBody(field, files) {
  const body = new FormData();
  Array.from(files || []).forEach((file) => body.append(field, file));
  return body;
}

async function uploadCargoFiles(files) {
  return request('/upload/cargo', { method: 'POST', body: filesBody('files', files) });
}

async function uploadVehicleFile(file, allowedTypes, label) {
  assertUploadFile(file, allowedTypes, label);
  return request('/upload/vehicle', { method: 'POST', body: filesBody('file', [file]) });
}

async function uploadDeliveryProofPhotos(bookingId, files, metadata) {
  const list = Array.from(files || []);
  if (!list.length) throw new Error('At least one delivery photo is required');
  list.forEach((file) => assertUploadFile(file, imageUploadTypes, 'Delivery photo'));

  const body = filesBody('files', list);
  if (metadata?.capturedAt) body.set('capturedAt', metadata.capturedAt);
  if (metadata?.lat !== undefined && metadata?.lat !== null) body.set('lat', metadata.lat);
  if (metadata?.lng !== undefined && metadata?.lng !== null) body.set('lng', metadata.lng);
  if (metadata?.accuracy !== undefined && metadata?.accuracy !== null) body.set('accuracy', metadata.accuracy);
  return request(`/bookings/${encodeURIComponent(bookingId)}/delivery-proof/assets`, {
    method: 'POST',
    body
  });
}

async function uploadDocument(path, documentType, file) {
  return uploadDocuments(path, documentType, [file]);
}

async function uploadDocuments(path, documentType, files) {
  const list = Array.from(files || []);
  if (!list.length) throw new Error('Document file is required');
  list.forEach((file) => assertUploadFile(file, documentUploadTypes, 'Document'));
  const data = await uploadCargoFiles(list);
  const url = data.urls?.[0];
  if (!url) throw new Error('Document upload did not return a URL');
  return request(path, {
    method: 'PATCH',
    body: JSON.stringify({
      url,
      urls: data.urls || [],
      fileName: list[0]?.name,
      fileNames: list.map((file) => file.name),
      documentType
    })
  });
}

function assertUploadFile(file, allowedTypes, label) {
  if (!file) throw new Error(`${label} file is required`);
  if (file.size > DOCUMENT_MAX_BYTES) throw new Error(`${label} must be 10 MB or smaller`);
  if (file.type && !allowedTypes.has(file.type)) throw new Error(`${label} file type is not supported`);
}

export const api = {
  request,
  profile: () => request('/users/profile'),
  updateProfile: (payload) => request('/users/profile', { method: 'PATCH', body: JSON.stringify(payload) }),
  estimate: (payload) => request('/marketplace/estimate', { method: 'POST', body: JSON.stringify(payload) }),
  mapsConfig: () => request('/maps/config'),
  geocode: (payload) => request('/maps/geocode', { method: 'POST', body: JSON.stringify(payload) }),
  computeRoute: (payload) => request('/maps/route', { method: 'POST', body: JSON.stringify(payload) }),
  listTrucks: (params = {}) => request(`/trucks${queryString(params)}`),
  fleetTrucks: () => request('/trucks/fleet'),
  listBookings: () => request('/bookings'),
  listOpenBookings: () => request('/bookings/open'),
  getBooking: (bookingId) => request(`/bookings/${encodeURIComponent(bookingId)}`),
  getBookingDraft: () => request('/bookings/draft'),
  saveBookingDraft: (payload) => request('/bookings/draft', { method: 'POST', body: JSON.stringify(payload) }),
  deleteBookingDraft: () => request('/bookings/draft', { method: 'DELETE' }),
  createBooking: (payload) => request('/bookings', { method: 'POST', body: JSON.stringify(payload) }),
  confirmDelivery: (bookingId, payload = {}) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/confirm-delivery`, {
      method: 'PATCH',
      ...(Object.keys(payload || {}).length ? { body: JSON.stringify(payload) } : {})
    }),
  getDeliveryProof: (bookingId) => request(`/bookings/${encodeURIComponent(bookingId)}/delivery-proof`),
  getDeliveryProofPolicy: () => request('/bookings/delivery-proof/policy'),
  requestDeliveryOtp: (bookingId) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/delivery-proof/otp`, { method: 'POST' }),
  uploadDeliveryProofPhotos,
  finalizeDeliveryProof: (bookingId, payload) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/delivery-proof/finalize`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  sendTrackingUpdate: (bookingId, payload) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/tracking`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  sendTrackingBatch: (bookingId, updates) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/tracking/batch`, {
      method: 'POST',
      body: JSON.stringify({ updates })
    }),
  updateBookingStatus: (bookingId, payload) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  createTruck: (payload) => request('/trucks', { method: 'POST', body: JSON.stringify(payload) }),
  rateBooking: (bookingId, payload) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/ratings`, { method: 'POST', body: JSON.stringify(payload) }),
  wallet: () => request('/payments/wallet'),
  paymentMethods: () => request('/payments/methods'),
  creditWallet: (payload) =>
    request('/payments/wallet/credit', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey('wallet-credit') },
      body: JSON.stringify(payload)
    }),
  releasePayment: (bookingId) =>
    request(`/payments/bookings/${encodeURIComponent(bookingId)}/release`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey('release') }
    }),
  initiateMobileMoneyEscrow: (bookingId, payload = {}) =>
    request(`/payments/bookings/${encodeURIComponent(bookingId)}/mobile-money`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey('mobile-escrow') },
      body: JSON.stringify(payload)
    }),
  initiateCardCheckout: (bookingId, payload = {}) =>
    request(`/payments/bookings/${encodeURIComponent(bookingId)}/card-checkout`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey('card-checkout') },
      body: JSON.stringify(payload)
    }),
  withdraw: (payload) =>
    request('/payments/withdraw', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey('withdraw') },
      body: JSON.stringify(payload)
    }),
  listMessages: (bookingId) => request(`/workflow/messages?booking=${encodeURIComponent(bookingId)}`),
  sendMessage: (payload) => request('/workflow/messages', { method: 'POST', body: JSON.stringify(payload) }),
  listCases: (params = {}) => request(`/cases${queryString(params)}`),
  createCase: (payload) => request('/cases', { method: 'POST', body: JSON.stringify(payload) }),
  caseDetails: (id) => request(`/cases/${encodeURIComponent(id)}`),
  addCaseComment: (id, payload) =>
    request(`/cases/${encodeURIComponent(id)}/comments`, { method: 'POST', body: JSON.stringify(payload) }),
  reopenCase: (id, payload = {}) =>
    request(`/cases/${encodeURIComponent(id)}/reopen`, { method: 'POST', body: JSON.stringify(payload) }),
  listNotifications: (options = 20) => {
    const limit = typeof options === 'object' ? options.limit : options;
    return request(`/notifications?limit=${encodeURIComponent(limit || 20)}`);
  },
  notificationPreferences: () => request('/notifications/preferences'),
  updateNotificationPreferences: (payload) =>
    request('/notifications/preferences', { method: 'PATCH', body: JSON.stringify(payload) }),
  sendTestNotification: () => request('/notifications/test', { method: 'POST' }),
  pushConfig: () => request('/notifications/push/config'),
  subscribePush: (subscription) =>
    request('/notifications/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription })
    }),
  unsubscribePush: () => request('/notifications/push/subscribe', { method: 'DELETE' }),
  markAllNotificationsRead: () => request('/notifications/read-all', { method: 'PATCH' }),
  markNotificationRead: (id) => request(`/notifications/${encodeURIComponent(id)}/read`, { method: 'PATCH' }),
  listDocuments: (params = {}) => request(`/documents${queryString(params)}`),
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
  uploadProfileDocument: (documentType, file) =>
    uploadDocument(`/users/documents/${encodeURIComponent(documentType)}`, documentType, file),
  uploadTruckDocument: async (truckId, documentType, file) => {
    const data = await uploadVehicleFile(file, documentUploadTypes, 'Vehicle document');
    return request(`/trucks/${encodeURIComponent(truckId)}/documents/${encodeURIComponent(documentType)}`, {
      method: 'PATCH',
      body: JSON.stringify({ url: data.url, fileName: data.fileName || file.name, documentType })
    });
  },
  uploadBookingDocument: (bookingId, documentType, files) =>
    uploadDocuments(
      `/bookings/${encodeURIComponent(bookingId)}/documents/${encodeURIComponent(documentType)}`,
      documentType,
      Array.isArray(files) ? files : [files]
    ),
  uploadTruckPhoto: async (truckId, file) => {
    const data = await uploadVehicleFile(file, imageUploadTypes, 'Vehicle photo');
    const url = data.url;
    if (!url) throw new Error('Photo upload did not return a URL');
    return request(`/trucks/${encodeURIComponent(truckId)}/photos`, {
      method: 'PATCH',
      body: JSON.stringify({ url, fileName: file.name })
    });
  },
  removeTruck: (truckId, reason = '') =>
    request(`/trucks/${encodeURIComponent(truckId)}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason })
    }),
  adminStats: () => request('/admin/stats'),
  adminListUsers: () => request('/admin/users'),
  adminListTrucks: () => request('/admin/trucks'),
  adminListBookings: () => request('/admin/bookings'),
  adminListPayments: (params = {}) => request(`/admin/payments${queryString(params)}`),
  adminExportPayments: (params = {}) =>
    downloadFile(
      `/admin/payments/export${queryString(params)}`,
      `itruck-payment-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`
    ),
  adminPaymentSummary: () => request('/admin/payments/summary'),
  adminProviderOperations: () => request('/payments/provider-operations'),
  adminReleaseBookingPayment: (bookingId) =>
    request(`/payments/bookings/${encodeURIComponent(bookingId)}/release`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  adminRefundPayment: (transactionId, payload = {}) =>
    request(`/payments/transactions/${encodeURIComponent(transactionId)}/refund`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  adminRecheckPayment: (transactionId) =>
    request(`/payments/transactions/${encodeURIComponent(transactionId)}/recheck`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  adminExecutePayout: (transactionId) =>
    request(`/payments/withdrawals/${encodeURIComponent(transactionId)}/execute`, {
      method: 'POST',
      body: JSON.stringify({})
    }),
  adminAuditLogs: () => request('/admin/audit-logs'),
  adminSecuritySessions: () => request('/admin/security/sessions'),
  adminRevokeSecuritySession: (sessionId) =>
    request(`/admin/security/sessions/${encodeURIComponent(sessionId)}/revoke`, { method: 'POST' }),
  adminCases: (params = {}) => request(`/admin/cases${queryString(params)}`),
  adminAssignCase: (id, payload) =>
    request(`/admin/cases/${encodeURIComponent(id)}/assign`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  adminUpdateCaseStatus: (id, payload) =>
    request(`/admin/cases/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  adminAddCaseComment: (id, payload) =>
    request(`/admin/cases/${encodeURIComponent(id)}/comments`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  adminResolveCase: (id, payload) =>
    request(`/admin/cases/${encodeURIComponent(id)}/resolve`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  adminReopenCase: (id, payload = {}) =>
    request(`/admin/cases/${encodeURIComponent(id)}/reopen`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  adminNotificationDeliveries: (status = '') =>
    request(`/admin/notification-deliveries${status ? `?status=${encodeURIComponent(status)}` : ''}`),
  adminRetryNotificationDelivery: (id) =>
    request(`/admin/notification-deliveries/${encodeURIComponent(id)}/retry`, { method: 'POST' }),
  adminDeleteUser: (userId, payload) =>
    request(`/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      body: JSON.stringify(payload)
    }),
  adminVerifyUser: (userId, isVerified) =>
    request(`/admin/users/${encodeURIComponent(userId)}/verification`, {
      method: 'PATCH',
      body: JSON.stringify({ isVerified })
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
  adminReviewBookingDocument: (bookingId, documentType, payload) =>
    request(`/admin/bookings/${encodeURIComponent(bookingId)}/documents/${encodeURIComponent(documentType)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  adminNotify: (payload) => request('/admin/notify', { method: 'POST', body: JSON.stringify(payload) }),
  acceptBookingBid: (bookingId, bidId) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/bids/${encodeURIComponent(bidId)}/accept`, {
      method: 'PATCH'
    }),
  counterBookingBid: (bookingId, bidId, payload) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/bids/${encodeURIComponent(bidId)}/counter`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  respondBookingCounter: (bookingId, bidId, payload) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/bids/${encodeURIComponent(bidId)}/respond-counter`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  rejectBookingBid: (bookingId, bidId, payload) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/bids/${encodeURIComponent(bidId)}/reject`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  withdrawBookingBid: (bookingId, bidId, payload = {}) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/bids/${encodeURIComponent(bidId)}/withdraw`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    }),
  acknowledgeBookingBid: (bookingId, bidId) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/bids/${encodeURIComponent(bidId)}/acknowledge`, {
      method: 'PATCH'
    }),
  bookingMatches: (bookingId, limit = 10) =>
    request(`/marketplace/matches/${encodeURIComponent(bookingId)}?limit=${encodeURIComponent(limit)}`),
  autoAssignBooking: (bookingId) =>
    request(`/marketplace/auto-assign/${encodeURIComponent(bookingId)}`, { method: 'POST' }),
  bookingDispatch: (bookingId) => request(`/marketplace/dispatch/${encodeURIComponent(bookingId)}`),
  listDrivers: () => request('/drivers'),
  inviteDriver: (payload) => request('/drivers/invitations', { method: 'POST', body: JSON.stringify(payload) }),
  revokeDriverInvitation: (invitationId) =>
    request(`/drivers/invitations/${encodeURIComponent(invitationId)}`, { method: 'DELETE' }),
  driverInvitation: (token) => request(`/drivers/invitations/${encodeURIComponent(token)}`),
  acceptDriverInvitation: (token, payload) =>
    request(`/drivers/invitations/${encodeURIComponent(token)}/accept`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  assignDriverTruck: (driverId, truckId) =>
    request(`/drivers/${encodeURIComponent(driverId)}/truck`, {
      method: 'PATCH',
      body: JSON.stringify({ truckId })
    }),
  unassignDriverTruck: (driverId, reason = '') =>
    request(`/drivers/${encodeURIComponent(driverId)}/truck`, {
      method: 'DELETE',
      body: JSON.stringify({ reason })
    }),
  assignBookingDriver: (bookingId, driverId) =>
    request(`/drivers/bookings/${encodeURIComponent(bookingId)}/driver`, {
      method: 'PATCH',
      body: JSON.stringify({ driverId })
    }),
  submitBookingBid: (bookingId, payload) =>
    request(`/bookings/${encodeURIComponent(bookingId)}/bids`, { method: 'POST', body: JSON.stringify(payload) }),
  reportIssue: (payload) => request('/cases', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) =>
    request('/auth/login', { method: 'POST', body: JSON.stringify({ ...payload, deviceId: getDeviceId() }) }),
  requestPasswordReset: (payload) =>
    request('/auth/forgot-password', { method: 'POST', body: JSON.stringify(payload) }),
  resetPassword: (payload) =>
    request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  logout: () => request('/auth/logout', { method: 'POST' }).finally(clearSession),
  listSessions: () => request('/auth/sessions'),
  revokeSession: (id) => request(`/auth/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  revokeOtherSessions: () => request('/auth/sessions', { method: 'DELETE' }),
  register: (role, payload) =>
    request(`/auth/register/${role}`, { method: 'POST', body: JSON.stringify({ ...payload, deviceId: getDeviceId() }) })
};

export function setSession(data) {
  if (data?.user) localStorage.setItem('itruck_user', JSON.stringify(data.user));
}

export function clearSession() {
  localStorage.removeItem('itruck_user');
}

export function currentUser() {
  try {
    return JSON.parse(localStorage.getItem('itruck_user') || '{}');
  } catch (_err) {
    clearSession();
    return {};
  }
}
