window.iTruckRoute = {
  staticToApp(href = '') {
    if (location.protocol === 'file:' || !href || href.startsWith('#') || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('tel:')) {
      return href;
    }

    const [rawPath, query = ''] = href.split('?');
    const file = rawPath.split('/').pop();
    const routes = {
      'dashboard-client.html': '/app/shipper',
      'dashboard-owner.html': '/app/owner',
      'book-truck.html': '/app/book',
      'tracking.html': '/app/tracking',
      'driver-contact.html': '/app/tracking',
      'listings.html': '/app/marketplace',
      'truck-profile.html': '/app/marketplace',
      'profile.html': '/app/profile'
    };

    const target = routes[file];
    return target ? `${target}${query ? `?${query}` : ''}` : href;
  },

  go(href) {
    location.href = this.staticToApp(href);
  },

  rewriteLinks(root = document) {
    if (location.protocol === 'file:') return;
    root.querySelectorAll('a[href]').forEach(link => {
      const next = this.staticToApp(link.getAttribute('href'));
      if (next !== link.getAttribute('href')) link.setAttribute('href', next);
    });
  }
};

function bindWorkspaceRoutes() {
  window.iTruckRoute.rewriteLinks();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindWorkspaceRoutes);
else bindWorkspaceRoutes();

class ITruckAPI {
  constructor() {
    this.base = localStorage.getItem('itruck_api_base') || (location.protocol === 'file:' ? 'http://localhost:5000/api' : '/api');
    this.token = localStorage.getItem('itruck_token') || '';
  }

  headers(extra = {}) {
    return {
      'Content-Type': 'application/json',
      ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      ...extra
    };
  }

  async request(path, options = {}) {
    const isFormData = options.body instanceof FormData;
    const headers = isFormData
      ? { ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...(options.headers || {}) }
      : this.headers(options.headers || {});

    let res;
    try {
      res = await fetch(`${this.base}${path}`, { ...options, headers });
    } catch (err) {
      throw new Error('Unable to reach iTruck API. Check that the backend is running.');
    }

    const type = res.headers.get('content-type') || '';
    const data = type.includes('application/json') ? await res.json().catch(() => ({})) : await res.text();
    if (!res.ok) throw new Error(data.message || data || 'Request failed');
    return data;
  }

  setToken(token) {
    this.token = token;
    localStorage.setItem('itruck_token', token);
  }

  clear() {
    this.token = '';
    localStorage.removeItem('itruck_token');
    localStorage.removeItem('itruck_user');
  }

  register(role, data) {
    return this.request(`/auth/register/${role}`, { method: 'POST', body: JSON.stringify(data) });
  }

  login(data) {
    return this.request('/auth/login', { method: 'POST', body: JSON.stringify(data) });
  }

  me() {
    return this.request('/auth/me');
  }

  health() {
    return this.request('/health');
  }

  listTrucks(query = '') {
    return this.request(`/trucks${query}`);
  }

  fleetTrucks() {
    return this.request('/trucks/fleet');
  }

  createTruck(data) {
    return this.request('/trucks', { method: 'POST', body: JSON.stringify(data) });
  }

  createBooking(data) {
    return this.request('/bookings', { method: 'POST', body: JSON.stringify(data) });
  }

  listBookings() {
    return this.request('/bookings');
  }

  submitBookingBid(id, data) {
    return this.request(`/bookings/${id}/bids`, { method: 'POST', body: JSON.stringify(data) });
  }

  updateBookingStatus(id, data) {
    return this.request(`/bookings/${id}/status`, { method: 'PATCH', body: JSON.stringify(data) });
  }

  adminStats() {
    return this.request('/admin/stats');
  }

  marketEstimate(data) {
    return this.request('/marketplace/estimate', { method: 'POST', body: JSON.stringify(data) });
  }

  marketTrust() {
    return this.request('/marketplace/trust');
  }

  marketLocalization() {
    return this.request('/marketplace/localization');
  }

  createRequest(data) {
    return this.request('/workflow/requests', { method: 'POST', body: JSON.stringify(data) });
  }

  submitBid(data) {
    return this.request('/workflow/bids', { method: 'POST', body: JSON.stringify(data) });
  }

  saveMessage(data) {
    return this.request('/workflow/messages', { method: 'POST', body: JSON.stringify(data) });
  }

  reportIssue(data) {
    return this.request('/workflow/reports', { method: 'POST', body: JSON.stringify(data) });
  }

  async downloadDocument(type, bookingId) {
    let res;
    try {
      res = await fetch(`${this.base}/documents/${type}/${bookingId}`, {
        headers: this.token ? { Authorization: `Bearer ${this.token}` } : {}
      });
    } catch (err) {
      throw new Error('Document download failed');
    }

    if (!res.ok) throw new Error('Document download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return true;
  }
}

window.API = new ITruckAPI();

(function initTheme() {
  const root = document.documentElement;
  const stored = localStorage.getItem('itruck_theme');
  const initial = stored || 'light';

  function apply(theme) {
    root.dataset.theme = theme;
    localStorage.setItem('itruck_theme', theme);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', theme === 'light' ? '#F8FAFC' : '#0A0F1E');
    document.querySelectorAll('[data-theme-choice]').forEach(btn => {
      const active = btn.dataset.themeChoice === theme;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function bindControls() {
    document.querySelectorAll('[data-theme-choice]').forEach(btn => {
      btn.addEventListener('click', () => apply(btn.dataset.themeChoice));
    });
    apply(root.dataset.theme || initial);
  }

  window.iTruckTheme = { apply, current: () => root.dataset.theme || initial };
  apply(initial);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bindControls);
  else bindControls();
})();
