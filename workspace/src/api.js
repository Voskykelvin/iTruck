const API_BASE = import.meta.env.VITE_API_BASE || '/api';

function token() {
  return localStorage.getItem('itruck_token') || '';
}

async function request(path, options = {}) {
  const isForm = options.body instanceof FormData;
  const headers = isForm
    ? { ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...(options.headers || {}) }
    : {
        'Content-Type': 'application/json',
        ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
        ...(options.headers || {})
      };

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch (err) {
    throw new Error('Unable to reach iTruck API');
  }

  const type = response.headers.get('content-type') || '';
  const data = type.includes('application/json') ? await response.json().catch(() => ({})) : await response.text();
  if (!response.ok) throw new Error(data.message || data || 'Request failed');
  return data;
}

export const api = {
  request,
  health: () => request('/health'),
  estimate: payload => request('/marketplace/estimate', { method: 'POST', body: JSON.stringify(payload) }),
  listTrucks: () => request('/trucks'),
  fleetTrucks: () => request('/trucks/fleet'),
  listBookings: () => request('/bookings'),
  listOpenBookings: () => request('/bookings/open'),
  createBooking: payload => request('/bookings', { method: 'POST', body: JSON.stringify(payload) }),
  createTruck: payload => request('/trucks', { method: 'POST', body: JSON.stringify(payload) }),
  rateTruck: (id, payload) => request(`/trucks/${encodeURIComponent(id)}/ratings`, { method: 'POST', body: JSON.stringify(payload) }),
  wallet: () => request('/payments/wallet'),
  withdraw: payload => request('/payments/withdraw', { method: 'POST', body: JSON.stringify(payload) }),
  workflow: query => request(`/workflow${query || ''}`),
  listMessages: bookingId => request(`/workflow/messages?booking=${encodeURIComponent(bookingId)}`),
  sendMessage: payload => request('/workflow/messages', { method: 'POST', body: JSON.stringify(payload) }),
  adminStats: () => request('/admin/stats'),
  submitBid: payload => request('/workflow/bids', { method: 'POST', body: JSON.stringify(payload) }),
  reportIssue: payload => request('/workflow/reports', { method: 'POST', body: JSON.stringify(payload) }),
  login: payload => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  register: (role, payload) => request(`/auth/register/${role}`, { method: 'POST', body: JSON.stringify(payload) })
};

export function setSession(data) {
  if (data?.token) localStorage.setItem('itruck_token', data.token);
  if (data?.user) localStorage.setItem('itruck_user', JSON.stringify(data.user));
}

export function clearSession() {
  localStorage.removeItem('itruck_token');
  localStorage.removeItem('itruck_user');
}

export function currentUser() {
  return JSON.parse(localStorage.getItem('itruck_user') || '{}');
}
