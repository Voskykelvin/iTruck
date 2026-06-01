import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BarChart3,
  Bell,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  FileText,
  Filter,
  Gauge,
  LayoutDashboard,
  LogOut,
  Map,
  Menu,
  MessageSquare,
  PackageCheck,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Truck,
  UserRound,
  Wallet
} from 'lucide-react';
import { api, clearSession, currentUser, setSession } from './api.js';
import ServiceWorkerUpdateToast from './components/ServiceWorkerUpdateToast.jsx';
import SessionsManager from './components/SessionsManager.jsx';
import { demoDocuments, demoFleet, demoLoads, demoShipments } from './data.js';

const roleNavigation = {
  client: [
    { path: '/app/shipper', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/app/book', label: 'Book', icon: Plus },
    { path: '/app/bids', label: 'Bids', icon: BarChart3 },
    { path: '/app/marketplace', label: 'Trucks', icon: Search },
    { path: '/app/tracking', label: 'Orders', icon: Map },
    { path: '/app/documents', label: 'Documents', icon: FileText },
    { path: '/app/payments', label: 'Payments', icon: Wallet },
    { path: '/app/messages', label: 'Messages', icon: MessageSquare },
    { path: '/app/profile', label: 'Settings', icon: UserRound }
  ],
  owner: [
    { path: '/app/owner', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/app/onboarding', label: 'Verification', icon: ShieldCheck },
    { path: '/app/vehicles', label: 'Vehicles', icon: Truck },
    { path: '/app/bids', label: 'Find Work', icon: Search },
    { path: '/app/tracking', label: 'Jobs', icon: Map },
    { path: '/app/documents', label: 'Documents', icon: FileText },
    { path: '/app/payments', label: 'Payments', icon: Wallet },
    { path: '/app/messages', label: 'Messages', icon: MessageSquare },
    { path: '/app/profile', label: 'Settings', icon: UserRound }
  ],
  admin: [
    { path: '/app/admin', label: 'Admin', icon: BarChart3 },
    { path: '/app/shipper', label: 'Shipper', icon: LayoutDashboard },
    { path: '/app/owner', label: 'Owner', icon: Truck },
    { path: '/app/bids', label: 'Bids', icon: Search },
    { path: '/app/documents', label: 'Documents', icon: FileText },
    { path: '/app/payments', label: 'Payments', icon: Wallet },
    { path: '/app/messages', label: 'Messages', icon: MessageSquare },
    { path: '/app/profile', label: 'Settings', icon: UserRound }
  ]
};

const commonRoutes = [
  '/app/profile',
  '/app/onboarding',
  '/app/documents',
  '/app/payments',
  '/app/messages',
  '/app/tracking'
];
const roleRoutes = {
  client: ['/app/shipper', '/app/book', '/app/marketplace', '/app/bids', ...commonRoutes],
  owner: ['/app/owner', '/app/vehicles', '/app/bids', ...commonRoutes],
  admin: [
    '/app/admin',
    '/app/shipper',
    '/app/book',
    '/app/marketplace',
    '/app/owner',
    '/app/vehicles',
    '/app/bids',
    ...commonRoutes
  ]
};

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const workspaceFleet = DEMO_MODE ? demoFleet : [];
const workspaceShipments = DEMO_MODE ? demoShipments : [];
const workspaceLoads = DEMO_MODE ? demoLoads : [];

const vehicleTypes = ['Matatu', 'Pickup', 'Lorry', 'Large Truck', 'Trailer', 'Bus', 'Specialised'];
const ownerProfileDocuments = ['Owner KYC', 'Driver ID', 'Business registration', 'Insurance'];
const shipperProfileDocuments = ['Shipper KYC', 'Business registration', 'Tax certificate'];
const ownerVehicleDocuments = ['Vehicle photos', 'Insurance', 'Vehicle logbook', 'Road license', 'Inspection report'];
const documentStages = {
  owner: [
    'Submit owner identity and business documents',
    'Register each vehicle with plate, capacity, routes, and photos',
    'Upload insurance, logbook, road license, and inspection proof',
    'Admin approves the profile before bidding on work'
  ],
  client: [
    'Submit shipper identity and business documents',
    'Create shipment request and confirm required route documents',
    'Upload cargo photos and receiver proof during the shipment',
    'Admin keeps verification, disputes, and payment release auditable'
  ]
};
const defaultBooking = {
  pickup: '',
  destination: '',
  distance: '',
  border: 'Domestic',
  pickupWindow: 'Flexible pickup window',
  vehicleType: 'Lorry',
  cargo: '',
  weight: '',
  requirements: 'Standard',
  cargoValue: '',
  receiverName: '',
  receiverPhone: '',
  communicationPreference: 'WhatsApp + SMS updates',
  paymentMethod: 'Wallet',
  optionalServices: []
};

const documentActions = [
  { label: 'Waybill', type: 'waybill', mode: 'download' },
  { label: 'Cargo photos', type: 'cargo-photos', mode: 'upload' },
  { label: 'Receiver confirmation', type: 'receiver-confirmation', mode: 'download' },
  { label: 'Commercial invoice', type: 'invoice', mode: 'download' },
  { label: 'Packing list', type: 'packing-list', mode: 'download' },
  { label: 'Customs declaration', type: 'customs', mode: 'download' }
];

function documentActionFor(label) {
  const normalized = String(label || '').toLowerCase();
  return (
    documentActions.find((item) => item.label.toLowerCase() === normalized) || {
      label,
      type: normalized.replaceAll(' ', '-'),
      mode: 'download'
    }
  );
}

function routeFromLocation() {
  const path = window.location.pathname;
  if (path === '/app' || path === '/app/') return '/app/shipper';
  return `${path}${window.location.search}`;
}

function pathOnly(route) {
  return route.split('?')[0];
}

function roleForUser(user) {
  return user?.role === 'owner' || user?.role === 'admin' ? user.role : 'client';
}

function dashboardPathForRole(role) {
  if (role === 'owner') return '/app/owner';
  if (role === 'admin') return '/app/admin';
  return '/app/shipper';
}

function navForUser(user) {
  return roleNavigation[roleForUser(user)] || roleNavigation.client;
}

function routeAllowedForUser(route, user) {
  const role = roleForUser(user);
  const path = pathOnly(route);
  if (path === '/app' || path === '/app/') return true;
  return (roleRoutes[role] || roleRoutes.client).some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
}

function roleName(role) {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  return 'Shipper';
}

function navigate(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

async function copyToClipboard(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

function activateOnEnter(event, action) {
  if (!['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  action();
}

function money(value, currency = 'USD') {
  return `${currency} ${Number(value || 0).toLocaleString()}`;
}

function saveLocal(type, data) {
  const key = `itruck_${type}`;
  const list = JSON.parse(localStorage.getItem(key) || '[]');
  list.unshift({ id: `${type}-${Date.now()}`, ...data, createdAt: new Date().toISOString(), mode: 'local' });
  localStorage.setItem(key, JSON.stringify(list));
}

function slugDocumentType(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function chatKey(shipmentId) {
  return `itruck_chat_${shipmentId || 'draft'}`;
}

function formatMessageTime(value = new Date().toISOString()) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function defaultChatMessages(shipment) {
  return [
    {
      id: `${shipment.id}-driver-start`,
      author: 'driver',
      name: shipment.driver || 'Driver',
      text: `Loading confirmed for ${shipment.route}. I will share checkpoint updates here.`,
      createdAt: new Date(Date.now() - 1000 * 60 * 55).toISOString()
    },
    {
      id: `${shipment.id}-ops-check`,
      author: 'ops',
      name: 'iTruck Ops',
      text: 'Waybill, cargo photos, and route status are attached to this shipment thread.',
      createdAt: new Date(Date.now() - 1000 * 60 * 38).toISOString()
    }
  ];
}

function readLocalChat(shipment) {
  const saved = JSON.parse(localStorage.getItem(chatKey(shipment.id)) || '[]');
  return saved.length ? saved : defaultChatMessages(shipment);
}

function persistLocalChat(shipmentId, messages) {
  localStorage.setItem(chatKey(shipmentId), JSON.stringify(messages.slice(-80)));
}

function normalizeWorkflowMessage(item, currentUserId) {
  const payload = item.payload || {};
  const user = item.user || {};
  const authorId = String(user._id || payload.user || payload.senderId || '');
  const mine = authorId && currentUserId && authorId === String(currentUserId);

  return {
    id: item._id || item.id || `message-${Date.now()}`,
    author: mine || payload.sender === 'me' ? 'me' : 'driver',
    name: mine ? 'You' : [user.firstName, user.lastName].filter(Boolean).join(' ') || payload.senderName || 'Driver',
    text: payload.text || payload.message || '',
    createdAt: item.createdAt || payload.createdAt || new Date().toISOString()
  };
}

function normalizeTruck(truck) {
  const price = truck.price || (truck.pricePerKm ? `$${Number(truck.pricePerKm).toFixed(2)}/km` : 'Quote');
  const routes = truck.routes || [];
  const photos = truck.photos || (truck.photo ? [truck.photo] : []);
  const verified = truck.verified ?? truck.isVerified ?? false;
  const ratingCount = Number(truck.ratingCount || 0);
  return {
    id: truck._id || truck.id || truck.plate || truck.plateNumber,
    type: truck.type || 'Lorry',
    name: truck.name || [truck.make, truck.model].filter(Boolean).join(' ') || 'Listed truck',
    plate: truck.plate || truck.plateNumber || 'Plate pending',
    owner: truck.ownerName || truck.owner || 'Verified carrier',
    company: truck.company || 'Carrier partner',
    price,
    pricePerKm: Number(truck.pricePerKm || String(price).replace(/[^0-9.]/g, '')) || 0,
    capacity: truck.capacity || (truck.capacityTonnes ? `${truck.capacityTonnes} tonnes` : 'Capacity on request'),
    rating: Number(truck.ratingAverage || truck.rating || 0),
    ratingCount,
    trips: Number(truck.completedTrips || truck.trips || truck.totalTrips || 0),
    photos,
    photo: photos[0] || '',
    routeFit: Number(truck.routeFit || Math.min(98, 64 + (verified ? 16 : 0) + Math.min(12, routes.length * 4))),
    availability: truck.availability || (truck.isAvailable === false ? 'Offline' : 'Available now'),
    documentStatus: truck.documentStatus || (verified ? 'Docs verified' : 'Docs pending'),
    responseTime: truck.responseTime || (verified ? '< 20 min' : 'Manual review'),
    routes,
    features: truck.features || [],
    verified
  };
}

function ratingSummary(entity) {
  const count = Number(entity?.ratingCount || 0);
  const rating = Number(entity?.rating || entity?.ratingAverage || 0);
  return count
    ? `${rating.toFixed(1)} from ${count} completed job${count === 1 ? '' : 's'}`
    : 'New after first delivery';
}

function normalizeBid(bid = {}) {
  const owner = bid.owner && typeof bid.owner === 'object' ? bid.owner : {};
  const truck = bid.truck && typeof bid.truck === 'object' ? bid.truck : {};
  const ownerName =
    [owner.firstName, owner.lastName].filter(Boolean).join(' ') ||
    owner.company ||
    bid.ownerName ||
    bid.carrier ||
    'Carrier';
  const id = bid._id || bid.id || bid.bidId || owner._id || bid.owner || truck._id || bid.truck;

  return {
    id: id || `${bid.amount || 'bid'}-${bid.createdAt || Date.now()}`,
    ownerName,
    truckName: truck.name || [truck.make, truck.model].filter(Boolean).join(' ') || bid.truckName || 'Truck pending',
    amount: Number(bid.amount || bid.price || 0),
    message: bid.message || 'Carrier has not added a note yet.',
    status: bid.status || 'pending',
    createdAt: bid.createdAt
  };
}

function bookingRef(booking) {
  return booking._id || booking.id || booking.bookingId || 'ITK-PENDING';
}

function bookingRoute(booking) {
  return booking.route || [booking.pickup, booking.destination].filter(Boolean).join(' to ') || 'Route pending';
}

function statusLabel(status = 'pending') {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function progressForStatus(status = 'pending') {
  if (status === 'delivered') return 100;
  if (status === 'in_transit') return 64;
  if (status === 'confirmed') return 38;
  if (status === 'bidding') return 18;
  return 8;
}

function normalizeBookingShipment(booking) {
  const tracking = booking.tracking || [];
  const latest = tracking[tracking.length - 1] || {};
  const progress = Number(booking.progress || progressForStatus(booking.status));

  return {
    id: bookingRef(booking),
    bookingId: booking._id || booking.id || booking.bookingId,
    truckId: booking.truck?._id || booking.truckId || booking.truck,
    route: bookingRoute(booking),
    origin: booking.pickup || 'Pickup pending',
    destination: booking.destination || 'Destination pending',
    cargo: booking.cargo || 'Cargo pending',
    vehicle: booking.vehicleType || booking.truck?.type || 'Vehicle pending',
    plate: booking.truck?.plateNumber || booking.plate || 'Unassigned',
    driver: booking.owner
      ? `${booking.owner.firstName || ''} ${booking.owner.lastName || ''}`.trim()
      : 'Carrier pending',
    status: statusLabel(booking.status),
    rawStatus: booking.status || 'pending',
    progress,
    eta: booking.eta || (booking.status === 'delivered' ? 'POD ready' : 'Awaiting update'),
    position: latest.city || (latest.lat && latest.lng ? `${latest.lat}, ${latest.lng}` : 'Awaiting GPS update'),
    speed: latest.speed ? `${latest.speed} km/h` : 'Speed pending',
    payment: booking.paymentMethod || 'Payment pending',
    paymentStatus: booking.paymentStatus || 'unpaid',
    documents: booking.estimate?.requiredDocuments || demoDocuments.slice(0, 3),
    bids: Array.isArray(booking.bids) ? booking.bids.map(normalizeBid) : []
  };
}

function normalizeOpenLoad(booking) {
  const estimate = booking.estimate || {};
  const amount = Number(booking.budget || estimate.total || 0);
  return {
    id: bookingRef(booking),
    cargo: booking.cargo || 'Cargo pending',
    route: bookingRoute(booking),
    price: amount,
    distance: booking.distance ? `${Number(booking.distance).toLocaleString()} km` : 'Distance pending',
    window: booking.pickupWindow || 'Pickup window pending',
    fit: `${booking.routeFit || 82}% fit`,
    risk: estimate.routeRisk || 'Medium'
  };
}

function fallbackEstimate(payload) {
  const distance = Number(payload.distance || 420);
  const basePrice = Math.round(distance * 1.8);
  const crossBorderFee = payload.border === 'Cross-border' ? Math.round(basePrice * 0.12) : 0;
  const insurance = Math.max(25, Math.round(basePrice * 0.035));
  const escrowFee = Math.round(basePrice * 0.025);
  const lineItems = [
    { key: 'basePrice', label: `${payload.vehicleType} lane estimate`, amount: basePrice },
    ...(crossBorderFee ? [{ key: 'crossBorderFee', label: 'Cross-border handling', amount: crossBorderFee }] : []),
    { key: 'insurance', label: 'Standard cargo protection', amount: insurance },
    { key: 'escrowFee', label: 'Escrow and payment handling', amount: escrowFee }
  ];

  return {
    currency: 'USD',
    lineItems,
    total: lineItems.reduce((sum, item) => sum + item.amount, 0),
    routeRisk: payload.border === 'Cross-border' ? 'medium' : 'low',
    recommendedMode: distance > 900 || payload.border === 'Cross-border' ? 'open-bids' : 'instant-match',
    confidence: 'medium',
    requiredDocuments: payload.border === 'Cross-border' ? demoDocuments : demoDocuments.slice(0, 3),
    quoteProtection:
      'Estimate includes visible platform, insurance, escrow, and selected service fees before carrier bids.'
  };
}

function App() {
  const [route, setRoute] = useState(routeFromLocation());
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [user, setUser] = useState(currentUser());
  const activeRole = roleForUser(user);
  const visibleNavItems = useMemo(() => navForUser(user), [user]);

  useEffect(() => {
    const syncRoute = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  const notify = useCallback((message) => {
    setToast(message);
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setToast(''), 2800);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch (_err) {
      clearSession();
    }
    setUser({});
    notify('Signed out');
  }, [notify]);

  const checkAlerts = useCallback(async () => {
    try {
      const data = await api.notificationCount();
      const count = Number(data.count || 0);
      notify(count ? `${count} unread alert${count === 1 ? '' : 's'}` : 'No unread alerts');
    } catch (err) {
      notify(err.message || 'Sign in to view alerts');
    }
  }, [notify]);

  useEffect(() => {
    if (!routeAllowedForUser(route, user)) {
      const destination = dashboardPathForRole(activeRole);
      notify(`${pageTitle(route)} is not part of ${roleName(activeRole)} mode`);
      navigate(destination);
    }
  }, [activeRole, notify, route, user]);

  const page = useMemo(() => {
    const props = { notify, route, user, setUser };
    if (route.startsWith('/app/onboarding')) return <OnboardingPage {...props} />;
    if (route.startsWith('/app/bids')) return <BidsPage {...props} />;
    if (route.startsWith('/app/documents')) return <DocumentsPage {...props} />;
    if (route.startsWith('/app/payments')) return <PaymentsPage {...props} />;
    if (route.startsWith('/app/messages')) return <MessagesPage {...props} />;
    if (route.startsWith('/app/book')) return <BookingPage {...props} />;
    if (route.startsWith('/app/marketplace')) return <MarketplacePage {...props} />;
    if (route.startsWith('/app/tracking')) return <TrackingPage {...props} />;
    if (route.startsWith('/app/owner') || route.startsWith('/app/vehicles')) return <OwnerPage {...props} />;
    if (route.startsWith('/app/admin')) return <AdminPage {...props} />;
    if (route.startsWith('/app/profile')) return <ProfilePage {...props} signOut={signOut} />;
    return activeRole === 'owner' ? <OwnerPage {...props} /> : <ShipperPage {...props} />;
  }, [activeRole, notify, route, signOut, user]);

  const primaryAction =
    activeRole === 'owner'
      ? { label: 'Find Work', path: '/app/bids', icon: Search }
      : activeRole === 'admin'
        ? { label: 'Admin Queue', path: '/app/admin', icon: BarChart3 }
        : { label: 'New Load', path: '/app/book', icon: Plus };
  const PrimaryActionIcon = primaryAction.icon;

  return (
    <div className="app-shell">
      <aside className={`app-sidebar ${menuOpen ? 'open' : ''}`}>
        <a className="brand" href="/">
          <span>iT</span> iTruck
        </a>
        <nav>
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const active = route.startsWith(item.path);
            return (
              <button
                key={item.path}
                className={active ? 'active' : ''}
                type="button"
                onClick={() => {
                  navigate(item.path);
                  setMenuOpen(false);
                }}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="app-main">
        <header className="app-topbar">
          <button className="icon-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <Menu size={20} />
          </button>
          <div>
            <p className="eyebrow">Operational Workspace</p>
            <h1>{pageTitle(route)}</h1>
          </div>
          <div className="topbar-actions">
            <button className="ghost icon-label" type="button" onClick={checkAlerts}>
              <Bell size={18} />
              <span>Alerts</span>
            </button>
            <button className="primary icon-label" type="button" onClick={() => navigate(primaryAction.path)}>
              <PrimaryActionIcon size={18} />
              <span>{primaryAction.label}</span>
            </button>
          </div>
        </header>

        {page}
      </main>

      <nav className="mobile-bottom-nav" aria-label="Primary mobile navigation">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const active = route.startsWith(item.path);
          return (
            <button
              key={item.path}
              className={active ? 'active' : ''}
              type="button"
              onClick={() => {
                navigate(item.path);
                setMenuOpen(false);
              }}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <button
        className={`menu-scrim ${menuOpen ? 'show' : ''}`}
        type="button"
        aria-label="Close menu"
        onClick={() => setMenuOpen(false)}
      />
      {toast ? <div className="toast">{toast}</div> : null}
      <ServiceWorkerUpdateToast />
    </div>
  );
}

function pageTitle(route) {
  if (route.includes('/onboarding')) return 'Verification';
  if (route.includes('/bids')) return 'Bids & Work';
  if (route.includes('/documents')) return 'Documents';
  if (route.includes('/payments')) return 'Payments';
  if (route.includes('/messages')) return 'Messages';
  if (route.includes('/book')) return 'Book a Truck';
  if (route.includes('/marketplace')) return 'Truck Marketplace';
  if (route.includes('/tracking')) return 'Live Tracking';
  if (route.includes('/owner') || route.includes('/vehicles')) return 'Fleet Owner';
  if (route.includes('/admin')) return 'Operations Admin';
  if (route.includes('/profile')) return 'Account & Verification';
  return 'Shipper Dashboard';
}

function MetricCard({ icon: Icon, label, value, detail }) {
  return (
    <article className="metric-card">
      <Icon size={20} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function StatusBadge({ children, tone = 'default' }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function ShipperPage({ notify, user }) {
  const [shipments, setShipments] = useState(workspaceShipments);
  const [walletBalance, setWalletBalance] = useState(0);
  const [bidReview, setBidReview] = useState(null);
  const [documentReview, setDocumentReview] = useState(null);
  const [busyAction, setBusyAction] = useState('');
  const cargoInputRef = useRef(null);
  const cargoUploadRef = useRef(null);

  useEffect(() => {
    api
      .listBookings()
      .then((data) => {
        if (Array.isArray(data.bookings)) setShipments(data.bookings.map(normalizeBookingShipment));
      })
      .catch(() => setShipments(workspaceShipments));

    api
      .wallet()
      .then((data) => Number.isFinite(Number(data.balance)) && setWalletBalance(Number(data.balance)))
      .catch(() => {});
  }, []);

  const activeCount = shipments.filter((item) => !['delivered', 'cancelled'].includes(item.rawStatus)).length;
  const inTransitCount = shipments.filter((item) => item.rawStatus === 'in_transit').length;
  const openRequests = shipments.filter((item) => ['pending', 'bidding'].includes(item.rawStatus));

  function shipmentWithBooking(preferred) {
    return preferred?.bookingId ? preferred : shipments.find((item) => item.bookingId) || null;
  }

  async function openBidReview(item) {
    const target = item || openRequests[0] || shipments.find((shipment) => shipment.rawStatus === 'bidding');

    if (!target?.bookingId) {
      setBidReview({
        id: 'No synced request',
        route: 'Create or sync a booking before comparing carrier bids.',
        bids: []
      });
      notify('No synced booking is ready for bid review');
      return;
    }

    setBusyAction('bid-review');
    try {
      const data = await api.getBooking(target.bookingId);
      const review = normalizeBookingShipment(data.booking || target);
      setBidReview(review);
      notify(`Loaded ${review.bids.length} carrier bid${review.bids.length === 1 ? '' : 's'}`);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusyAction('');
    }
  }

  async function awardBid(bid) {
    if (!bidReview?.bookingId || !bid?.id) return;

    setBusyAction(`award-${bid.id}`);
    try {
      const data = await api.acceptBookingBid(bidReview.bookingId, bid.id);
      const updated = normalizeBookingShipment(data.booking || {});
      setBidReview(updated);
      setShipments((current) => current.map((item) => (item.bookingId === updated.bookingId ? updated : item)));
      notify(`Awarded ${bid.ownerName}`);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusyAction('');
    }
  }

  function openDocumentWorkbench(focusLabel = 'Waybill', preferred) {
    const target = shipmentWithBooking(preferred);
    if (!target) {
      navigate('/app/tracking');
      notify('Open a synced booking before managing documents');
      return;
    }

    setDocumentReview({
      target,
      focusLabel,
      status: `${focusLabel} controls are ready for ${target.id}`
    });
  }

  async function downloadShipmentDocument(definition, preferred, nextFocus = definition.label) {
    const target = shipmentWithBooking(preferred);
    if (!target) {
      navigate('/app/tracking');
      notify('Open a synced booking before generating shipment documents');
      return;
    }

    setBusyAction(`document-${definition.type}`);
    try {
      await api.downloadDocument(definition.type, target.bookingId);
      setDocumentReview({
        target,
        focusLabel: nextFocus,
        status: `${definition.label} downloaded for ${target.id}`
      });
      notify(`${definition.label} downloaded for ${target.id}`);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusyAction('');
    }
  }

  async function openWaybillAndPhotos() {
    const target = shipmentWithBooking(shipments[0]);
    if (!target) {
      navigate('/app/tracking');
      notify('Open tracking after a synced booking to review documents');
      return;
    }

    openDocumentWorkbench('Cargo photos', target);
    await downloadShipmentDocument(documentActions[0], target, 'Cargo photos');
  }

  function handleShipmentDocument(definition, preferred) {
    const target = shipmentWithBooking(preferred || documentReview?.target);
    if (!target) {
      navigate('/app/tracking');
      notify('Open a synced booking before managing documents');
      return;
    }

    if (definition.mode === 'upload') {
      cargoUploadRef.current = { target, definition };
      setDocumentReview({
        target,
        focusLabel: definition.label,
        status: `Choose cargo photos to upload for ${target.id}`
      });
      cargoInputRef.current?.click();
      return;
    }

    downloadShipmentDocument(definition, target);
  }

  async function uploadShipmentCargoPhotos(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    const target = cargoUploadRef.current?.target || shipmentWithBooking(documentReview?.target);
    if (!target) return;

    setBusyAction('document-cargo-photos');
    try {
      const data = await api.uploadCargo(files);
      saveLocal('cargo_uploads', {
        bookingId: target.bookingId,
        shipmentId: target.id,
        files: files.map((file) => file.name),
        urls: data.urls || []
      });
      setDocumentReview({
        target,
        focusLabel: 'Cargo photos',
        status: `${files.length} cargo photo${files.length === 1 ? '' : 's'} uploaded for ${target.id}`
      });
      notify('Cargo photos uploaded');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusyAction('');
    }
  }

  const bidQueueTarget = openRequests[0] || shipments.find((shipment) => shipment.rawStatus === 'bidding');
  const actionQueue = [
    {
      label: bidQueueTarget ? `Compare bids - ${bidQueueTarget.route}` : 'Compare carrier bids',
      run: () => openBidReview(bidQueueTarget)
    },
    {
      label: 'Confirm waybill and cargo photos',
      run: openWaybillAndPhotos
    },
    {
      label: 'Release payment after POD',
      run: () => {
        const delivered = shipments.find((item) => item.rawStatus === 'delivered');
        if (user?.role === 'admin' && delivered?.bookingId) {
          api
            .releasePayment(delivered.bookingId)
            .then(() => notify(`Payment released for ${delivered.id}`))
            .catch((err) => notify(err.message));
          return;
        }
        navigate('/app/admin');
        notify('Payment release requires admin approval');
      }
    }
  ];
  const readinessDocs = documentActions;

  return (
    <div className="page-grid">
      <input
        ref={cargoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        multiple
        onChange={uploadShipmentCargoPhotos}
        style={{ display: 'none' }}
      />
      <section className="intro-band">
        <div>
          <p className="eyebrow">Client Workspace</p>
          <h2>Shipments that need your attention.</h2>
          <p>
            Compare bids, review documents, release payments, and keep active routes visible without jumping across
            separate tools.
          </p>
          <div className="button-row">
            <button className="primary icon-label" type="button" onClick={() => navigate('/app/book')}>
              <Plus size={18} />
              <span>New Booking</span>
            </button>
            <button className="secondary icon-label" type="button" onClick={() => navigate('/app/tracking')}>
              <Map size={18} />
              <span>Track Cargo</span>
            </button>
          </div>
        </div>
        <div className="command-summary">
          <StatusBadge tone="success">{activeCount} active</StatusBadge>
          <strong>{shipments[0] ? `Next update: ${shipments[0].eta}` : 'No live shipment updates yet'}</strong>
          <span>
            {shipments[0] ? `${shipments[0].route} - ${shipments[0].id}` : 'Create a booking to start tracking'}
          </span>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard icon={PackageCheck} label="Total Shipments" value={shipments.length} detail="Booking records" />
        <MetricCard icon={Truck} label="In Transit" value={inTransitCount} detail="Live shipment status" />
        <MetricCard
          icon={AlertTriangle}
          label="Awaiting Action"
          value={openRequests.length}
          detail="Bids, docs, payment"
        />
        <MetricCard icon={Wallet} label="Wallet" value={money(walletBalance)} detail="Escrow and payment balance" />
      </section>

      <section className="workspace-layout">
        <div className="stack">
          <Panel
            title="Shipment Command"
            eyebrow="Live Work"
            action="View map"
            onAction={() => navigate('/app/tracking')}
          >
            <div className="shipment-stack">
              {shipments.length ? (
                shipments.map((item) => (
                  <article
                    className="shipment-row"
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/app/tracking?shipment=${item.id}`)}
                    onKeyDown={(event) => activateOnEnter(event, () => navigate(`/app/tracking?shipment=${item.id}`))}
                  >
                    <div>
                      <StatusBadge
                        tone={
                          item.status === 'Delivered' ? 'success' : item.status === 'Bids open' ? 'warn' : 'default'
                        }
                      >
                        {item.status}
                      </StatusBadge>
                      <h3>{item.id}</h3>
                      <p>{item.route}</p>
                      <small>
                        {item.cargo} - {item.eta}
                      </small>
                    </div>
                    <div className="progress-block">
                      <strong>{item.progress}%</strong>
                      <div className="progress">
                        <span style={{ width: `${item.progress}%` }} />
                      </div>
                      <button
                        className="ghost"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/app/tracking?shipment=${item.id}`);
                        }}
                      >
                        Open
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <EmptyState title="No live shipments yet" detail="Create a booking to populate this dashboard." />
              )}
            </div>
          </Panel>

          <Panel title="Open Requests" eyebrow="Quotes" action="Create request" onAction={() => navigate('/app/book')}>
            <div className="cards-grid">
              {openRequests.length ? (
                openRequests.map((item) => (
                  <article className="quote-card" key={item.id}>
                    <StatusBadge>{item.status}</StatusBadge>
                    <h3>{item.route}</h3>
                    <p>{item.vehicle}</p>
                    <strong>{item.payment}</strong>
                    <button className="secondary" type="button" onClick={() => openBidReview(item)}>
                      Review Bids
                    </button>
                  </article>
                ))
              ) : (
                <EmptyState
                  title="No open quote requests"
                  detail="New booking requests will appear here after shippers create them."
                />
              )}
            </div>
          </Panel>

          {bidReview ? (
            <Panel title="Bid Review" eyebrow="Carrier Awards" action="Close" onAction={() => setBidReview(null)}>
              <div className="facts-grid">
                <span>Request</span>
                <strong>{bidReview.id}</strong>
                <span>Route</span>
                <strong>{bidReview.route}</strong>
                <span>Status</span>
                <strong>{bidReview.status || 'Reviewing'}</strong>
              </div>
              <div className="cards-grid">
                {busyAction === 'bid-review' ? (
                  <EmptyState title="Loading carrier bids" detail="Reading the live booking record from the API." />
                ) : bidReview.bids?.length ? (
                  bidReview.bids.map((bid) => (
                    <article className="quote-card" key={bid.id}>
                      <StatusBadge tone={bid.status === 'accepted' ? 'success' : 'default'}>
                        {statusLabel(bid.status)}
                      </StatusBadge>
                      <h3>{bid.ownerName}</h3>
                      <p>{bid.truckName}</p>
                      <strong>{money(bid.amount)}</strong>
                      <small>{bid.message}</small>
                      <button
                        className="primary"
                        type="button"
                        disabled={busyAction === `award-${bid.id}` || bid.status === 'accepted'}
                        onClick={() => awardBid(bid)}
                      >
                        {bid.status === 'accepted' ? 'Awarded' : 'Award Bid'}
                      </button>
                    </article>
                  ))
                ) : (
                  <EmptyState
                    title="No carrier bids yet"
                    detail="Submitted owner bids will appear here with award controls."
                  />
                )}
              </div>
              <div className="button-row">
                <button className="secondary" type="button" onClick={() => navigate('/app/marketplace')}>
                  Open Marketplace
                </button>
                <button className="ghost" type="button" onClick={() => openBidReview(bidReview)}>
                  Refresh Bids
                </button>
              </div>
            </Panel>
          ) : null}
        </div>

        <aside className="side-stack">
          <Panel title="Action Queue" eyebrow="Today">
            <div className="action-list">
              {actionQueue.map((item) => (
                <button
                  className="action-item"
                  type="button"
                  key={item.label}
                  disabled={Boolean(busyAction)}
                  onClick={item.run}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Documents" eyebrow="Readiness">
            <div className="doc-list">
              {readinessDocs.map((definition) => (
                <button
                  type="button"
                  key={definition.label}
                  disabled={busyAction === `document-${definition.type}`}
                  onClick={() => handleShipmentDocument(definition)}
                >
                  {busyAction === `document-${definition.type}` ? 'Working...' : definition.label}
                </button>
              ))}
            </div>
          </Panel>
          {documentReview ? (
            <Panel
              title="Document Workbench"
              eyebrow={documentReview.target?.id || 'Shipment Docs'}
              action="Close"
              onAction={() => setDocumentReview(null)}
            >
              <div className="verification-card">
                <FileText size={28} />
                <strong>{documentReview.focusLabel}</strong>
                <span>{documentReview.status}</span>
              </div>
              <div className="doc-list compact">
                {documentActions.map((definition) => (
                  <button
                    type="button"
                    key={definition.label}
                    disabled={Boolean(busyAction)}
                    onClick={() => handleShipmentDocument(definition, documentReview.target)}
                  >
                    {definition.label}
                  </button>
                ))}
              </div>
            </Panel>
          ) : null}
        </aside>
      </section>
    </div>
  );
}

function BookingPage({ notify }) {
  const [form, setForm] = useState(defaultBooking);
  const [estimate, setEstimate] = useState(null);
  const [saving, setSaving] = useState(false);
  const [ack, setAck] = useState(false);
  const [quoteDocument, setQuoteDocument] = useState(null);
  const [quoteDocBusy, setQuoteDocBusy] = useState('');
  const quoteUploadInputRef = useRef(null);
  const pendingQuoteUploadRef = useRef(null);
  const quoteDocuments = useMemo(
    () => [...new Set([...(estimate?.requiredDocuments || []), ...demoDocuments])],
    [estimate]
  );

  useEffect(() => {
    let active = true;
    const payload = { ...form, crossBorder: form.border === 'Cross-border' };
    api
      .estimate(payload)
      .then((data) => active && setEstimate(data))
      .catch(() => active && setEstimate(fallbackEstimate(payload)));
    return () => {
      active = false;
    };
  }, [form]);

  function update(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleService(service) {
    setForm((current) => {
      const set = new Set(current.optionalServices || []);
      set.has(service) ? set.delete(service) : set.add(service);
      return { ...current, optionalServices: [...set] };
    });
  }

  function bookingDraftPayload() {
    return {
      ...form,
      estimate,
      route: [form.pickup, form.destination].filter(Boolean).join(' to ')
    };
  }

  async function openQuoteDocument(label) {
    const definition = documentActionFor(label);
    setQuoteDocument({
      label: definition.label,
      status:
        definition.mode === 'upload'
          ? 'Choose files to attach to this booking draft.'
          : 'Generating a booking draft document.'
    });

    if (definition.mode === 'upload') {
      pendingQuoteUploadRef.current = definition;
      quoteUploadInputRef.current?.click();
      return;
    }

    setQuoteDocBusy(definition.type);
    try {
      await api.downloadDraftDocument(definition.type, bookingDraftPayload());
      setQuoteDocument({
        label: definition.label,
        status: `${definition.label} draft downloaded from the live document service.`
      });
      notify(`${definition.label} draft downloaded`);
    } catch (err) {
      notify(err.message);
    } finally {
      setQuoteDocBusy('');
    }
  }

  async function uploadQuoteDocumentFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    const definition = pendingQuoteUploadRef.current || documentActions[1];
    setQuoteDocBusy(definition.type);
    try {
      const data = await api.uploadCargo(files);
      saveLocal('quote_documents', {
        document: definition.label,
        files: files.map((file) => file.name),
        urls: data.urls || [],
        route: [form.pickup, form.destination].filter(Boolean).join(' to ')
      });
      setQuoteDocument({
        label: definition.label,
        status: `${files.length} file${files.length === 1 ? '' : 's'} uploaded and attached to this booking draft.`
      });
      notify(`${definition.label} uploaded`);
    } catch (err) {
      notify(err.message);
    } finally {
      setQuoteDocBusy('');
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!ack) {
      notify('Review and acknowledge quote details first');
      return;
    }

    const payload = { ...form, estimate, quoteAcknowledged: true };
    setSaving(true);
    try {
      await api.createBooking(payload);
      notify('Booking request created');
      navigate('/app/shipper');
    } catch (_err) {
      saveLocal('bookings', payload);
      notify('Sign in to save this booking to your account');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="booking-grid" onSubmit={submit}>
      <input
        ref={quoteUploadInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        multiple
        onChange={uploadQuoteDocumentFiles}
        style={{ display: 'none' }}
      />
      <section className="form-sections">
        <Panel title="Route" eyebrow="Step 1">
          <div className="form-grid">
            <Input label="Pickup" value={form.pickup} onChange={(value) => update('pickup', value)} />
            <Input label="Destination" value={form.destination} onChange={(value) => update('destination', value)} />
            <Input
              label="Distance km"
              type="number"
              value={form.distance}
              onChange={(value) => update('distance', Number(value))}
            />
            <Select
              label="Border"
              value={form.border}
              onChange={(value) => update('border', value)}
              options={['Domestic', 'Cross-border']}
            />
            <Select
              label="Pickup window"
              value={form.pickupWindow}
              onChange={(value) => update('pickupWindow', value)}
              options={[
                'Flexible pickup window',
                'Morning pickup',
                'Afternoon pickup',
                'Evening pickup',
                'Appointment required'
              ]}
            />
          </div>
        </Panel>

        <Panel title="Vehicle & Cargo" eyebrow="Step 2">
          <div className="vehicle-picks">
            {vehicleTypes.map((type) => (
              <button
                className={form.vehicleType === type ? 'active' : ''}
                type="button"
                key={type}
                onClick={() => update('vehicleType', type)}
              >
                {type}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <TextArea label="Cargo" value={form.cargo} onChange={(value) => update('cargo', value)} />
            <Input label="Weight" value={form.weight} onChange={(value) => update('weight', value)} />
            <Select
              label="Handling"
              value={form.requirements}
              onChange={(value) => update('requirements', value)}
              options={['Standard', 'Refrigerated', 'Crane', 'Hazardous']}
            />
            <Input
              label="Cargo value USD"
              type="number"
              value={form.cargoValue}
              onChange={(value) => update('cargoValue', Number(value))}
            />
          </div>
          <div className="service-grid">
            {[
              ['loadingCrew', 'Loading crew'],
              ['customsBroker', 'Customs broker'],
              ['temperatureControl', 'Temperature control'],
              ['highValueCover', 'High-value cover'],
              ['returnLoadFlexible', 'Flexible return load']
            ].map(([key, label]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={(form.optionalServices || []).includes(key)}
                  onChange={() => toggleService(key)}
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </Panel>

        <Panel title="Receiver & Payment" eyebrow="Step 3">
          <div className="form-grid">
            <Input
              label="Receiver name"
              value={form.receiverName}
              onChange={(value) => update('receiverName', value)}
            />
            <Input
              label="Receiver phone"
              value={form.receiverPhone}
              onChange={(value) => update('receiverPhone', value)}
            />
            <Select
              label="Updates"
              value={form.communicationPreference}
              onChange={(value) => update('communicationPreference', value)}
              options={['WhatsApp + SMS updates', 'SMS only', 'Email updates', 'Phone calls for exceptions only']}
            />
            <Select
              label="Payment"
              value={form.paymentMethod}
              onChange={(value) => update('paymentMethod', value)}
              options={['Wallet', 'M-Pesa', 'MTN MoMo', 'Airtel Money', 'Card escrow', 'Cash on delivery']}
            />
          </div>
        </Panel>
      </section>

      <aside className="quote-panel">
        <Panel title="Quote Review" eyebrow="Live Estimate">
          <div className="estimate-total">
            <span>{estimate?.confidence || 'medium'} confidence</span>
            <strong>{money(estimate?.total, estimate?.currency)}</strong>
            <small>
              {estimate?.recommendedMode?.replace('-', ' ') || 'instant match'} - {estimate?.routeRisk || 'low'} risk
            </small>
          </div>
          <div className="line-items">
            {(estimate?.lineItems || []).map((item) => (
              <div key={item.key}>
                <span>{item.label}</span>
                <strong>{money(item.amount, estimate.currency)}</strong>
              </div>
            ))}
          </div>
          <div className="doc-list compact">
            {quoteDocuments.map((item) => {
              const definition = documentActionFor(item);
              return (
                <button
                  type="button"
                  key={item}
                  disabled={quoteDocBusy === definition.type}
                  onClick={() => openQuoteDocument(item)}
                >
                  {quoteDocBusy === definition.type ? 'Working...' : item}
                </button>
              );
            })}
          </div>
          {quoteDocument ? (
            <div className="verification-card">
              <FileText size={28} />
              <strong>{quoteDocument.label}</strong>
              <span>{quoteDocument.status}</span>
            </div>
          ) : null}
          <label className="ack-row">
            <input type="checkbox" checked={ack} onChange={(event) => setAck(event.target.checked)} />
            <span>I reviewed fees, optional services, and required documents.</span>
          </label>
          <button className="primary full icon-label" type="submit" disabled={saving}>
            <Send size={18} />
            <span>{saving ? 'Submitting...' : 'Confirm Booking'}</span>
          </button>
        </Panel>
      </aside>
    </form>
  );
}

function MarketplacePage({ route }) {
  const [trucks, setTrucks] = useState(workspaceFleet);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [verified, setVerified] = useState(false);
  const [sort, setSort] = useState('best');

  useEffect(() => {
    api
      .listTrucks()
      .then((data) => {
        if (Array.isArray(data.trucks) && data.trucks.length) setTrucks(data.trucks.map(normalizeTruck));
      })
      .catch(() => setTrucks(workspaceFleet));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return trucks
      .filter((truck) => {
        const haystack = [
          truck.name,
          truck.type,
          truck.owner,
          truck.company,
          truck.plate,
          truck.price,
          ...(truck.routes || []),
          ...(truck.features || [])
        ]
          .join(' ')
          .toLowerCase();
        return (!type || truck.type === type) && (!verified || truck.verified) && haystack.includes(q);
      })
      .sort((a, b) => {
        if (sort === 'price') return (a.pricePerKm || 999) - (b.pricePerKm || 999);
        if (sort === 'rating') return b.ratingCount - a.ratingCount || b.rating - a.rating;
        if (sort === 'trips') return b.trips - a.trips;
        return b.routeFit - a.routeFit;
      });
  }, [trucks, search, type, verified, sort]);

  const selectedTruckKey = useMemo(() => new URLSearchParams(route.split('?')[1] || '').get('truck'), [route]);
  const selectedBookingKey = useMemo(() => new URLSearchParams(route.split('?')[1] || '').get('booking'), [route]);
  const selectedTruck = useMemo(() => {
    if (!selectedTruckKey) return null;
    return trucks
      .map(normalizeTruck)
      .find((truck) => [truck.id, truck.plate].some((value) => String(value) === selectedTruckKey));
  }, [selectedTruckKey, trucks]);

  return (
    <section className="market-layout">
      <aside className="filter-panel">
        <div className="filter-heading">
          <Filter size={18} />
          <strong>Refine fleet</strong>
        </div>
        <label className="search-field">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search route, owner, plate"
          />
        </label>
        <Select
          label="Vehicle type"
          value={type}
          onChange={setType}
          options={['', ...vehicleTypes]}
          emptyLabel="All vehicles"
        />
        <Select label="Sort" value={sort} onChange={setSort} options={['best', 'price', 'rating', 'trips']} />
        <label className="toggle-row">
          <input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} />
          <span />
          <strong>Verified only</strong>
        </label>
      </aside>

      <div className="stack">
        {selectedBookingKey ? (
          <section className="truck-profile-panel">
            <div>
              <StatusBadge tone="warn">Bid Review</StatusBadge>
              <h2>Carrier options for {selectedBookingKey}</h2>
              <p>Compare verified trucks, rates, route fit, and response time before requesting a carrier.</p>
            </div>
            <div className="button-row">
              <button className="primary" type="button" onClick={() => navigate('/app/book')}>
                Create Follow-up Request
              </button>
              <button className="ghost" type="button" onClick={() => navigate('/app/shipper')}>
                Back to Shipments
              </button>
            </div>
          </section>
        ) : null}
        {selectedTruck ? (
          <section className="truck-profile-panel">
            <div>
              <StatusBadge tone={selectedTruck.verified ? 'success' : 'warn'}>
                {selectedTruck.verified ? 'Verified' : 'Pending'}
              </StatusBadge>
              <h2>{selectedTruck.name}</h2>
              <p>
                {selectedTruck.type} by {selectedTruck.owner}
              </p>
            </div>
            <div className="facts-grid">
              <span>Plate</span>
              <strong>{selectedTruck.plate}</strong>
              <span>Capacity</span>
              <strong>{selectedTruck.capacity}</strong>
              <span>Rate</span>
              <strong>{selectedTruck.price}</strong>
              <span>Rating</span>
              <strong>{ratingSummary(selectedTruck)}</strong>
            </div>
            <div className="vehicle-photo-strip">
              {selectedTruck.photos.length ? (
                selectedTruck.photos
                  .slice(0, 3)
                  .map((photo) => <img src={photo} alt={`${selectedTruck.name} vehicle`} key={photo} loading="lazy" />)
              ) : (
                <span>Vehicle photos will appear after the owner uploads them.</span>
              )}
            </div>
            <div className="button-row">
              <button
                className="primary"
                type="button"
                onClick={() => navigate(`/app/book?truck=${encodeURIComponent(selectedTruck.plate)}`)}
              >
                Request Truck
              </button>
              <button className="ghost" type="button" onClick={() => navigate('/app/marketplace')}>
                Close
              </button>
            </div>
          </section>
        ) : null}
        <div className="result-bar">
          <strong>{filtered.length} trucks found</strong>
          <button className="ghost icon-label" type="button" onClick={() => navigate('/app/book')}>
            <Plus size={18} />
            <span>Create Request</span>
          </button>
        </div>
        <div className="cards-grid truck-grid">
          {filtered.map((truck) => (
            <article className="truck-card" key={truck.id}>
              <div className={`truck-media ${truck.photo ? '' : 'is-empty'}`}>
                {truck.photo ? (
                  <img
                    src={truck.photo}
                    alt={`${truck.name} ${truck.plate}`}
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                      event.currentTarget.parentElement.classList.add('is-empty');
                    }}
                  />
                ) : null}
                <div className="truck-media-fallback">
                  <Truck size={28} />
                  <span>{truck.type}</span>
                </div>
              </div>
              <div className="truck-head">
                <StatusBadge tone={truck.verified ? 'success' : 'warn'}>
                  {truck.verified ? 'Verified' : 'Pending'}
                </StatusBadge>
                <strong>{truck.routeFit}% fit</strong>
              </div>
              <h3>{truck.name}</h3>
              <p>
                {truck.type} by {truck.owner}
              </p>
              <small>
                {truck.plate} - {truck.capacity}
              </small>
              <div className="decision-grid">
                <span>
                  Rate<strong>{truck.price}</strong>
                </span>
                <span>
                  Rating
                  <strong>{ratingSummary(truck)}</strong>
                </span>
                <span>
                  Status<strong>{truck.availability}</strong>
                </span>
              </div>
              <div className="chips">
                {truck.routes.slice(0, 2).map((route) => (
                  <span key={route}>{route}</span>
                ))}
              </div>
              <div className="trust-line">
                <span>{truck.documentStatus}</span>
                <span>{truck.responseTime}</span>
              </div>
              <div className="button-row">
                <button
                  className="primary"
                  type="button"
                  onClick={() => navigate(`/app/marketplace?truck=${encodeURIComponent(truck.id || truck.plate)}`)}
                >
                  View Profile
                </button>
                <button className="ghost" type="button" onClick={() => navigate(`/app/book?truck=${truck.plate}`)}>
                  Request
                </button>
              </div>
            </article>
          ))}
          {!filtered.length ? (
            <EmptyState
              title="No trucks found"
              detail="Live marketplace data will appear here after carriers are added and verified."
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}

function TrackingPage({ notify, route, user }) {
  const activeRole = roleForUser(user);
  const [selected, setSelected] = useState(0);
  const [shipments, setShipments] = useState(workspaceShipments);
  const [messages, setMessages] = useState([]);
  const [draftMessage, setDraftMessage] = useState('');
  const [ratingBusy, setRatingBusy] = useState(false);
  const chatInputRef = useRef(null);

  const trackingParams = useMemo(() => new URLSearchParams(route.split('?')[1] || ''), [route]);
  const routeShipment = trackingParams.get('shipment');
  const contactMode = trackingParams.get('contact');

  useEffect(() => {
    api
      .listBookings()
      .then((data) => {
        if (Array.isArray(data.bookings)) setShipments(data.bookings.map(normalizeBookingShipment));
      })
      .catch(() => setShipments(workspaceShipments));
  }, []);

  const shipment = shipments[selected] || shipments[0];
  const shipmentMessageKey = shipment?.bookingId || shipment?.id || '';

  useEffect(() => {
    if (!routeShipment || !shipments.length) return;
    const index = shipments.findIndex((item) =>
      [item.id, item.bookingId].some((value) => String(value) === routeShipment)
    );
    if (index >= 0 && index !== selected) setSelected(index);
  }, [routeShipment, selected, shipments]);

  useEffect(() => {
    if (!shipment) return;

    let active = true;
    setMessages(readLocalChat(shipment));

    api
      .listMessages(shipmentMessageKey)
      .then((data) => {
        if (!active) return;
        const items = Array.isArray(data.items) ? data.items : [];
        if (items.length) {
          const normalized = items.map((item) => normalizeWorkflowMessage(item, user?._id));
          setMessages(normalized);
          persistLocalChat(shipment.id, normalized);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [shipmentMessageKey, shipment, user?._id]);

  useEffect(() => {
    if (contactMode === 'driver') chatInputRef.current?.focus();
  }, [contactMode, shipmentMessageKey]);

  async function sendChatMessage(event) {
    event.preventDefault();
    if (!shipment || !draftMessage.trim()) return;

    const text = draftMessage.trim();
    const nextMessage = {
      id: `local-message-${Date.now()}`,
      author: 'me',
      name: 'You',
      text,
      createdAt: new Date().toISOString()
    };

    const nextMessages = [...messages, nextMessage];
    setMessages(nextMessages);
    persistLocalChat(shipment.id, nextMessages);
    setDraftMessage('');

    try {
      await api.sendMessage({
        booking: shipment.bookingId,
        bookingId: shipment.bookingId,
        shipmentId: shipment.id,
        route: shipment.route,
        text,
        sender: 'me',
        status: 'sent'
      });
    } catch (_err) {
      saveLocal('messages', { shipmentId: shipment.id, route: shipment.route, text, status: 'local' });
    }
  }

  async function confirmDelivery() {
    if (!shipment?.bookingId) {
      notify('Delivery confirmation needs a synced booking');
      return;
    }

    try {
      const data = await api.confirmDelivery(shipment.bookingId);
      const updated = normalizeBookingShipment(data.booking || {});
      setShipments((current) => current.map((item) => (item.bookingId === shipment.bookingId ? updated : item)));
      notify('Delivery confirmed');
    } catch (err) {
      notify(err.message);
    }
  }

  async function reportIssue() {
    if (!shipment) return;

    try {
      await api.reportIssue({
        booking: shipment.bookingId,
        bookingId: shipment.bookingId,
        shipmentId: shipment.id,
        message: `Issue reported for ${shipment.route}`,
        severity: 'normal',
        status: 'submitted'
      });
      notify('Issue report sent to operations');
    } catch (err) {
      saveLocal('issue_reports', {
        bookingId: shipment.bookingId,
        shipmentId: shipment.id,
        route: shipment.route,
        status: 'local'
      });
      notify(err.message || 'Issue report queued for operations');
    }
  }

  async function submitShipmentRating(score) {
    if (!shipment?.bookingId) {
      notify('Ratings require a synced booking');
      return;
    }

    if (shipment.rawStatus !== 'delivered') {
      notify('Ratings open after delivery is confirmed');
      return;
    }

    const target = activeRole === 'owner' ? 'client' : 'owner';
    setRatingBusy(true);
    try {
      await api.rateBooking(shipment.bookingId, {
        score,
        target,
        comment: target === 'client' ? 'Rated shipper after delivery' : 'Rated carrier after delivery'
      });
      notify(target === 'client' ? 'Shipper rating recorded' : 'Carrier rating recorded');
    } catch (err) {
      notify(err.message);
    } finally {
      setRatingBusy(false);
    }
  }

  async function shareTrackingLink() {
    const url = `${window.location.origin}/app/tracking?shipment=${encodeURIComponent(shipment.id)}`;
    try {
      await copyToClipboard(url);
      notify('Tracking link copied');
    } catch (_err) {
      notify('Unable to copy tracking link');
    }
  }

  if (!shipment) {
    return (
      <Panel title="Live Tracking" eyebrow="Shipments">
        <EmptyState
          title="No active live shipments"
          detail="Tracking opens after a booking is confirmed and a vehicle starts sending route updates."
        />
      </Panel>
    );
  }

  const mapUrl = `https://www.google.com/maps?output=embed&saddr=${encodeURIComponent(shipment.origin)}&daddr=${encodeURIComponent(shipment.destination)}&dirflg=d`;
  const ratingTitle = activeRole === 'owner' ? 'Rate Shipper' : 'Rate Carrier';

  return (
    <section className="tracking-layout">
      <Panel title="Active Routes" eyebrow="Shipments">
        <div className="tracking-list">
          {shipments.map((item, index) => (
            <button
              className={index === selected ? 'active' : ''}
              type="button"
              key={item.id}
              onClick={() => setSelected(index)}
            >
              <strong>{item.id}</strong>
              <span>{item.route}</span>
              <small>
                {item.progress}% - {item.position}
              </small>
            </button>
          ))}
        </div>
      </Panel>

      <section className="map-panel">
        <div className="map-toolbar">
          <div>
            <StatusBadge tone="success">{shipment.status}</StatusBadge>
            <strong>{shipment.route}</strong>
          </div>
          <button className="ghost icon-label" type="button" onClick={shareTrackingLink}>
            <MessageSquare size={18} />
            <span>Share</span>
          </button>
        </div>
        <iframe title="Shipment route" src={mapUrl} loading="lazy" />
        <div className="map-status">
          <span>Current position</span>
          <strong>{shipment.position}</strong>
          <small>
            {shipment.speed} - ETA {shipment.eta}
          </small>
        </div>
      </section>

      <aside className="tracking-side">
        <Panel title="Shipment Detail" eyebrow="Control">
          <div className="facts-grid">
            <span>Driver</span>
            <strong>{shipment.driver}</strong>
            <span>Cargo</span>
            <strong>{shipment.cargo}</strong>
            <span>Vehicle</span>
            <strong>
              {shipment.vehicle} - {shipment.plate}
            </strong>
            <span>Payment</span>
            <strong>{shipment.payment}</strong>
          </div>
          <div className="progress">
            <span style={{ width: `${shipment.progress}%` }} />
          </div>
          <div className="doc-list compact">
            {shipment.documents.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <div className="stack-actions">
            <button className="primary" type="button" onClick={confirmDelivery}>
              Confirm Delivery
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => navigate(`/app/tracking?shipment=${encodeURIComponent(shipment.id)}&contact=driver`)}
            >
              Contact Driver
            </button>
            <button className="ghost" type="button" onClick={reportIssue}>
              Report Issue
            </button>
          </div>
          <div className="rating-panel">
            <strong>{ratingTitle}</strong>
            <span>
              {shipment.rawStatus === 'delivered'
                ? 'Ratings are recorded against this completed booking.'
                : 'Ratings unlock after delivery is confirmed.'}
            </span>
            <div className="rating-strip" aria-label={ratingTitle}>
              {[1, 2, 3, 4, 5].map((score) => (
                <button
                  type="button"
                  key={score}
                  disabled={ratingBusy || shipment.rawStatus !== 'delivered'}
                  onClick={() => submitShipmentRating(score)}
                  aria-label={`${ratingTitle} ${score} out of 5`}
                >
                  {score}
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Driver Chat" eyebrow="In-house Text">
          <div className="chat-thread">
            {messages.map((message) => (
              <div className={`chat-message ${message.author === 'me' ? 'me' : 'them'}`} key={message.id}>
                <p>{message.text}</p>
                <small>
                  {message.name} - {formatMessageTime(message.createdAt)}
                </small>
              </div>
            ))}
          </div>
          <form className="chat-compose" onSubmit={sendChatMessage}>
            <input
              ref={chatInputRef}
              value={draftMessage}
              onChange={(event) => setDraftMessage(event.target.value)}
              placeholder="Type a message..."
            />
            <button className="primary" type="submit" aria-label="Send message">
              <Send size={18} />
            </button>
          </form>
        </Panel>
      </aside>
    </section>
  );
}

function OwnerPage({ notify }) {
  const [fleet, setFleet] = useState(workspaceFleet.slice(0, 3));
  const [loads, setLoads] = useState(workspaceLoads);
  const [ownerBookings, setOwnerBookings] = useState([]);
  const [draftPlate, setDraftPlate] = useState('');
  const [walletBalance, setWalletBalance] = useState(3180);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawDraft, setWithdrawDraft] = useState({
    amount: 250,
    method: 'mpesa',
    destination: '+254700000000',
    accountName: ''
  });

  useEffect(() => {
    api
      .fleetTrucks()
      .then((data) => {
        if (Array.isArray(data.trucks)) setFleet(data.trucks.map(normalizeTruck));
      })
      .catch(() => setFleet(workspaceFleet.slice(0, 3)));

    api
      .listOpenBookings()
      .then((data) => {
        if (Array.isArray(data.bookings)) setLoads(data.bookings.map(normalizeOpenLoad));
      })
      .catch(() => setLoads(workspaceLoads));

    api
      .listBookings()
      .then((data) => {
        if (Array.isArray(data.bookings)) setOwnerBookings(data.bookings.map(normalizeBookingShipment));
      })
      .catch(() => {});

    api
      .wallet()
      .then((data) => {
        if (Number.isFinite(Number(data.balance))) setWalletBalance(Number(data.balance));
      })
      .catch(() => {});
  }, []);

  async function addTruck() {
    if (!draftPlate.trim()) {
      notify('Enter a plate number before adding a vehicle');
      return;
    }
    const payload = {
      plateNumber: draftPlate,
      type: 'Lorry',
      make: 'Owner',
      model: 'Listed vehicle',
      routes: ['Route pending'],
      isVerified: false
    };

    try {
      const data = await api.createTruck(payload);
      setFleet((current) => [normalizeTruck(data.truck || payload), ...current]);
      notify('Vehicle sent to admin review');
    } catch (_err) {
      const truck = normalizeTruck({ ...payload, id: draftPlate, plate: draftPlate });
      setFleet((current) => [truck, ...current]);
      saveLocal('vehicles', truck);
      notify('Sign in to save this vehicle to your fleet');
    } finally {
      setDraftPlate('');
    }
  }

  async function placeBid(load) {
    if (!load?.id) {
      notify('Bid needs a synced booking');
      return;
    }

    const payload = {
      bookingId: load.id,
      route: load.route,
      cargo: load.cargo,
      amount: load.price || 0,
      message: 'Available for pickup. Documents ready.',
      status: 'submitted'
    };

    try {
      await api.submitBookingBid(load.id, { amount: payload.amount, message: payload.message });
      notify(`Bid saved for ${load.route}`);
    } catch (_err) {
      saveLocal('bids', payload);
      notify('Sign in to keep this bid in your account');
    }
  }

  function runOwnerQueue(label) {
    if (label.startsWith('Submit bid')) {
      if (loads[0]) placeBid(loads[0]);
      else notify('No available load is ready for bidding');
      return;
    }

    if (label.startsWith('Upload insurance')) {
      navigate('/app/profile?document=Insurance');
      notify('Insurance upload opened');
      return;
    }

    confirmPickupStarted();
  }

  function openTruckReadiness(truck) {
    navigate(`/app/profile?document=${encodeURIComponent('Vehicle logbook')}&vehicle=${encodeURIComponent(truck.id)}`);
    notify(`${truck.plate} readiness opened`);
  }

  async function confirmPickupStarted() {
    const target =
      ownerBookings.find((booking) => booking.rawStatus === 'confirmed') ||
      ownerBookings.find((booking) => booking.rawStatus === 'in_transit');

    if (!target?.bookingId) {
      navigate('/app/tracking');
      notify('No assigned confirmed pickup is ready to start');
      return;
    }

    if (target.rawStatus === 'in_transit') {
      navigate(`/app/tracking?shipment=${encodeURIComponent(target.id)}`);
      notify(`Pickup already active for ${target.id}`);
      return;
    }

    try {
      const data = await api.updateBookingStatus(target.bookingId, {
        status: 'in_transit',
        location: { lat: -1.2921, lng: 36.8219, speed: 0, heading: 0 }
      });
      const updated = normalizeBookingShipment(data.booking || {});
      setOwnerBookings((current) => current.map((item) => (item.bookingId === target.bookingId ? updated : item)));
      notify(`Pickup started for ${updated.id}`);
      navigate(`/app/tracking?shipment=${encodeURIComponent(updated.id)}`);
    } catch (err) {
      notify(err.message);
    }
  }

  function updateWithdraw(key, value) {
    setWithdrawDraft((current) => ({ ...current, [key]: value }));
  }

  async function requestWithdrawal(event) {
    event.preventDefault();
    const amount = Number(withdrawDraft.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      notify('Enter a withdrawal amount greater than zero');
      return;
    }

    if (!withdrawDraft.destination.trim()) {
      notify('Enter the payout phone or account');
      return;
    }

    setWithdrawBusy(true);
    const payload = {
      ...withdrawDraft,
      amount,
      description: `Owner withdrawal to ${withdrawDraft.method}`
    };

    try {
      await api.withdraw(payload);
      setWalletBalance((current) => Math.max(0, Number(current || 0) - amount));
      notify(`Withdrawal request queued to ${withdrawDraft.method.toUpperCase()}`);
    } catch (_err) {
      saveLocal('withdrawals', { ...payload, status: 'local-pending' });
      setWalletBalance((current) => Math.max(0, Number(current || 0) - amount));
      notify('Withdrawal request held until account sync completes');
    } finally {
      setWithdrawBusy(false);
    }
  }

  const activeJobs = ownerBookings.filter((booking) => ['confirmed', 'in_transit'].includes(booking.rawStatus)).length;
  const ratedFleet = fleet.filter((truck) => Number(truck.ratingCount || 0) > 0);
  const fleetRatingCount = ratedFleet.reduce((sum, truck) => sum + Number(truck.ratingCount || 0), 0);
  const fleetRatingAverage = fleetRatingCount
    ? ratedFleet.reduce((sum, truck) => sum + Number(truck.rating || 0) * Number(truck.ratingCount || 0), 0) /
      fleetRatingCount
    : 0;

  return (
    <div className="page-grid">
      <section className="metrics-grid">
        <MetricCard icon={Wallet} label="Wallet Balance" value={money(walletBalance)} detail="Available for payout" />
        <MetricCard icon={Truck} label="Active Jobs" value={activeJobs} detail="Confirmed or in transit" />
        <MetricCard icon={Gauge} label="Open Loads" value={loads.length} detail="Ready for owner bids" />
        <MetricCard
          icon={ShieldCheck}
          label="Rating"
          value={fleetRatingCount ? fleetRatingAverage.toFixed(1) : 'New'}
          detail={
            fleetRatingCount
              ? `${fleetRatingCount} delivered rating${fleetRatingCount === 1 ? '' : 's'}`
              : 'After completed jobs'
          }
        />
      </section>

      <section className="workspace-layout">
        <div className="stack">
          <Panel title="Job Board" eyebrow="Available Loads">
            <div className="shipment-stack">
              {loads.length ? (
                loads.map((load) => (
                  <article
                    className="load-row"
                    key={load.route}
                    role="button"
                    tabIndex={0}
                    onClick={() => placeBid(load)}
                    onKeyDown={(event) => activateOnEnter(event, () => placeBid(load))}
                  >
                    <div>
                      <StatusBadge tone={load.risk === 'High' ? 'warn' : 'success'}>{load.fit}</StatusBadge>
                      <h3>{load.cargo}</h3>
                      <p>{load.route}</p>
                      <small>
                        {load.distance} - {load.window}
                      </small>
                    </div>
                    <div>
                      <strong>${load.price.toLocaleString()}</strong>
                      <button
                        className="primary"
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          placeBid(load);
                        }}
                      >
                        Place Bid
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <EmptyState
                  title="No live loads yet"
                  detail="Verified shipper requests will appear here when the booking workflow is connected to owner matching."
                />
              )}
            </div>
          </Panel>

          <Panel title="Vehicle Readiness" eyebrow="Fleet">
            <div className="add-row">
              <input
                value={draftPlate}
                onChange={(event) => setDraftPlate(event.target.value)}
                placeholder="Plate number"
              />
              <button className="secondary icon-label" type="button" onClick={addTruck}>
                <Plus size={18} />
                <span>Add</span>
              </button>
            </div>
            <div className="shipment-stack">
              {fleet.map((truck) => (
                <article
                  className="shipment-row"
                  key={truck.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => openTruckReadiness(truck)}
                  onKeyDown={(event) => activateOnEnter(event, () => openTruckReadiness(truck))}
                >
                  <div>
                    <StatusBadge tone={truck.verified ? 'success' : 'warn'}>{truck.documentStatus}</StatusBadge>
                    <h3>{truck.plate}</h3>
                    <p>{truck.name}</p>
                    <small>
                      {truck.routes[0] || 'Route pending'} - {truck.availability}
                    </small>
                  </div>
                  <div className="progress-block">
                    <strong>{truck.routeFit}%</strong>
                    <div className="progress">
                      <span style={{ width: `${truck.routeFit}%` }} />
                    </div>
                    <button
                      className="ghost"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openTruckReadiness(truck);
                      }}
                    >
                      Manage
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </Panel>
        </div>

        <aside className="side-stack">
          <Panel title="Wallet Payout" eyebrow="Withdraw">
            <form className="payout-form" onSubmit={requestWithdrawal}>
              <div className="wallet-card compact">
                <span>Available balance</span>
                <strong>{money(walletBalance)}</strong>
                <small>Payouts are queued for finance approval.</small>
              </div>
              <Input
                label="Amount USD"
                type="number"
                value={withdrawDraft.amount}
                onChange={(value) => updateWithdraw('amount', Number(value))}
              />
              <Select
                label="Method"
                value={withdrawDraft.method}
                onChange={(value) => updateWithdraw('method', value)}
                options={['mpesa', 'mtn', 'bank', 'stripe']}
              />
              <Input
                label="Phone or account"
                value={withdrawDraft.destination}
                onChange={(value) => updateWithdraw('destination', value)}
              />
              <Input
                label="Account name"
                value={withdrawDraft.accountName}
                onChange={(value) => updateWithdraw('accountName', value)}
              />
              <button className="primary full icon-label" type="submit" disabled={withdrawBusy}>
                <Wallet size={18} />
                <span>{withdrawBusy ? 'Queuing...' : 'Withdraw Cash'}</span>
              </button>
            </form>
          </Panel>
          <Panel title="Owner Queue" eyebrow="Today">
            <div className="action-list">
              {[
                'Submit bid - Construction steel',
                'Upload insurance - Toyota Hilux',
                'Confirm pickup - Kampala depot'
              ].map((item) => (
                <button className="action-item" type="button" key={item} onClick={() => runOwnerQueue(item)}>
                  {item}
                </button>
              ))}
            </div>
          </Panel>
        </aside>
      </section>
    </div>
  );
}

function OnboardingPage({ notify, user, setUser }) {
  const role = roleForUser(user);
  const [uploading, setUploading] = useState('');
  const [fleet, setFleet] = useState([]);
  const [truckDraft, setTruckDraft] = useState({
    plateNumber: '',
    type: 'Lorry',
    capacityTonnes: 8,
    routes: 'Nairobi-Kampala',
    photos: []
  });
  const [vehiclePhotoName, setVehiclePhotoName] = useState('');
  const pendingDocRef = useRef('');
  const profileDocInputRef = useRef(null);
  const vehiclePhotoInputRef = useRef(null);

  useEffect(() => {
    if (role !== 'owner') return;
    api
      .fleetTrucks()
      .then((data) => Array.isArray(data.trucks) && setFleet(data.trucks.map(normalizeTruck)))
      .catch(() => setFleet(workspaceFleet.slice(0, 2)));
  }, [role]);

  const profileDocs = role === 'owner' ? ownerProfileDocuments : shipperProfileDocuments;

  function openProfileDoc(documentType) {
    pendingDocRef.current = slugDocumentType(documentType);
    profileDocInputRef.current?.click();
  }

  async function uploadProfileDoc(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !pendingDocRef.current) return;

    setUploading(pendingDocRef.current);
    try {
      const data = await api.uploadProfileDocument(pendingDocRef.current, file);
      if (data.user) {
        setSession({ user: data.user });
        setUser(data.user);
      }
      notify('Document sent to admin review');
    } catch (err) {
      notify(err.message);
    } finally {
      setUploading('');
    }
  }

  async function uploadVehiclePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploading('vehicle-photo');
    try {
      const data = await api.uploadCargo([file]);
      const url = data.urls?.[0];
      if (!url) throw new Error('Photo upload did not return a URL');
      setTruckDraft((current) => ({ ...current, photos: [...(current.photos || []), url] }));
      setVehiclePhotoName(file.name);
      notify('Vehicle photo attached to this enrollment');
    } catch (err) {
      notify(err.message);
    } finally {
      setUploading('');
    }
  }

  function updateTruckDraft(key, value) {
    setTruckDraft((current) => ({ ...current, [key]: value }));
  }

  async function submitTruck(event) {
    event.preventDefault();
    if (role !== 'owner') return;

    const payload = {
      ...truckDraft,
      capacityTonnes: Number(truckDraft.capacityTonnes || 0),
      routes: String(truckDraft.routes || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    };

    try {
      const data = await api.createTruck(payload);
      setFleet((current) => [normalizeTruck(data.truck || payload), ...current]);
      notify('Vehicle sent to admin review');
      setTruckDraft((current) => ({ ...current, plateNumber: '', photos: [] }));
      setVehiclePhotoName('');
    } catch (err) {
      notify(err.message);
    }
  }

  return (
    <section className="workspace-layout">
      <input
        ref={profileDocInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={uploadProfileDoc}
        style={{ display: 'none' }}
      />
      <input
        ref={vehiclePhotoInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={uploadVehiclePhoto}
        style={{ display: 'none' }}
      />
      <div className="stack">
        <section className="intro-band compact-intro">
          <div>
            <p className="eyebrow">{roleName(role)} Setup</p>
            <h2>{role === 'owner' ? 'Get approved to bid on work.' : 'Get approved to ship.'}</h2>
            <p>
              {role === 'owner'
                ? 'Owner documents and vehicles go to admin review before your fleet starts taking loads.'
                : 'Shipper documents go to admin review, then your bookings and carrier bids stay in one workspace.'}
            </p>
          </div>
          <div className="command-summary">
            <StatusBadge tone={user.isVerified ? 'success' : 'warn'}>
              {user.isVerified ? 'Verified' : 'Admin review'}
            </StatusBadge>
            <strong>{user.email || 'No active session'}</strong>
            <span>{role === 'owner' ? `${fleet.length} vehicle records` : 'Shipping profile'}</span>
          </div>
        </section>

        <Panel title="Documents for Admin Review" eyebrow="Verification">
          <div className="process-list">
            {(documentStages[role] || documentStages.client).map((item, index) => (
              <span key={item}>
                <strong>{index + 1}</strong>
                {item}
              </span>
            ))}
          </div>
          <div className="doc-list">
            {profileDocs.map((item) => {
              const slug = slugDocumentType(item);
              return (
                <button type="button" key={item} disabled={uploading === slug} onClick={() => openProfileDoc(item)}>
                  {uploading === slug ? 'Uploading...' : item}
                </button>
              );
            })}
          </div>
          <p className="muted-note">Approved documents unlock the correct workspace tools for this account role.</p>
        </Panel>

        {role === 'owner' ? (
          <Panel title="Vehicle Registration" eyebrow="Owner Review">
            <form className="modal-form" onSubmit={submitTruck}>
              <div className="form-grid">
                <Input
                  label="Plate number"
                  value={truckDraft.plateNumber}
                  onChange={(value) => updateTruckDraft('plateNumber', value)}
                />
                <Select
                  label="Vehicle type"
                  value={truckDraft.type}
                  onChange={(value) => updateTruckDraft('type', value)}
                  options={vehicleTypes}
                />
                <Input
                  label="Capacity tonnes"
                  type="number"
                  value={truckDraft.capacityTonnes}
                  onChange={(value) => updateTruckDraft('capacityTonnes', Number(value))}
                />
                <Input
                  label="Preferred routes"
                  value={truckDraft.routes}
                  onChange={(value) => updateTruckDraft('routes', value)}
                />
              </div>
              <div className="button-row">
                <button
                  className="secondary icon-label"
                  type="button"
                  disabled={uploading === 'vehicle-photo'}
                  onClick={() => vehiclePhotoInputRef.current?.click()}
                >
                  <FileText size={18} />
                  <span>{uploading === 'vehicle-photo' ? 'Uploading photo...' : 'Upload Vehicle Photo'}</span>
                </button>
                <span className="muted-note">
                  {vehiclePhotoName ||
                    `${truckDraft.photos.length} vehicle photo${truckDraft.photos.length === 1 ? '' : 's'} attached`}
                </span>
              </div>
              <button className="primary icon-label" type="submit">
                <Truck size={18} />
                <span>Send Vehicle for Review</span>
              </button>
            </form>
          </Panel>
        ) : (
          <Panel title="Shipping Workspace" eyebrow="Next Step">
            <div className="button-row">
              <button className="primary icon-label" type="button" onClick={() => navigate('/app/book')}>
                <Plus size={18} />
                <span>Book Shipment</span>
              </button>
              <button className="secondary icon-label" type="button" onClick={() => navigate('/app/bids')}>
                <BarChart3 size={18} />
                <span>Review Bids</span>
              </button>
            </div>
          </Panel>
        )}
      </div>

      <aside className="side-stack">
        <Panel title="Role Access" eyebrow="Workspace">
          <div className="doc-list compact">
            {(roleNavigation[role] || roleNavigation.client).map((item) => (
              <button type="button" key={item.path} onClick={() => navigate(item.path)}>
                {item.label}
              </button>
            ))}
          </div>
        </Panel>
        <Panel title={role === 'owner' ? 'Need To Ship?' : 'Own Trucks?'} eyebrow="Optional">
          <div className="verification-card">
            <UserRound size={28} />
            <strong>{role === 'owner' ? 'Create a shipper profile' : 'Create an owner profile'}</strong>
            <span>Keep each side separate so permissions, documents, and payments stay clean.</span>
          </div>
          <a className="secondary full icon-label" href="/#signup">
            <UserRound size={18} />
            <span>{role === 'owner' ? 'Start Shipping' : 'Register Fleet'}</span>
          </a>
        </Panel>
      </aside>
    </section>
  );
}

function BidsPage({ notify, user }) {
  const role = roleForUser(user);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    const loader = role === 'owner' ? api.listOpenBookings : api.listBookings;
    loader()
      .then((data) => {
        const bookings = Array.isArray(data.bookings) ? data.bookings : [];
        setItems(role === 'owner' ? bookings.map(normalizeOpenLoad) : bookings.map(normalizeBookingShipment));
      })
      .catch(() => setItems(role === 'owner' ? workspaceLoads : workspaceShipments));
  }, [role]);

  async function submitOwnerBid(load) {
    if (!load?.id) {
      notify('Bid needs a synced booking');
      return;
    }

    setBusy(load.id);
    try {
      await api.submitBookingBid(load.id, {
        amount: load.price || 1,
        message: 'Available for pickup. Documents ready.'
      });
      notify(`Bid submitted for ${load.route}`);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  async function acceptBid(booking, bid) {
    setBusy(`${booking.bookingId}-${bid.id}`);
    try {
      const data = await api.acceptBookingBid(booking.bookingId, bid.id);
      const updated = normalizeBookingShipment(data.booking || {});
      setItems((current) => current.map((item) => (item.bookingId === updated.bookingId ? updated : item)));
      notify(`Awarded ${bid.ownerName}`);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  if (role === 'owner') {
    return (
      <section className="workspace-layout">
        <div className="stack">
          <Panel title="Available Loads" eyebrow="Find Work">
            <div className="shipment-stack">
              {items.length ? (
                items.map((load) => (
                  <article className="load-row" key={load.id || load.route}>
                    <div>
                      <StatusBadge tone={load.risk === 'High' ? 'warn' : 'success'}>{load.fit}</StatusBadge>
                      <h3>{load.cargo}</h3>
                      <p>{load.route}</p>
                      <small>
                        {load.distance} - {load.window}
                      </small>
                    </div>
                    <div>
                      <strong>{money(load.price)}</strong>
                      <button
                        className="primary"
                        type="button"
                        disabled={busy === load.id}
                        onClick={() => submitOwnerBid(load)}
                      >
                        {busy === load.id ? 'Submitting...' : 'Place Bid'}
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <EmptyState title="No open loads" detail="New shipper requests will appear here after verification." />
              )}
            </div>
          </Panel>
        </div>
        <aside className="side-stack">
          <Panel title="Owner Rules" eyebrow="Bidding">
            <div className="doc-list compact">
              <span>Bid on open work</span>
              <span>Keep vehicle documents ready</span>
              <span>Start pickup after award</span>
            </div>
          </Panel>
        </aside>
      </section>
    );
  }

  return (
    <section className="workspace-layout">
      <div className="stack">
        <Panel title="Bids Received" eyebrow="Shipper Review">
          <div className="cards-grid">
            {items.length ? (
              items.map((booking) => (
                <article className="quote-card" key={booking.id}>
                  <StatusBadge tone={booking.bids?.length ? 'warn' : 'default'}>{booking.status}</StatusBadge>
                  <h3>{booking.route}</h3>
                  <p>{booking.cargo}</p>
                  <small>{booking.bids?.length || 0} carrier bids</small>
                  <div className="doc-list compact">
                    {(booking.bids || []).map((bid) => (
                      <button
                        type="button"
                        key={bid.id}
                        disabled={busy === `${booking.bookingId}-${bid.id}` || bid.status === 'accepted'}
                        onClick={() => acceptBid(booking, bid)}
                      >
                        {bid.status === 'accepted' ? 'Awarded' : `${bid.ownerName} - ${money(bid.amount)}`}
                      </button>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <EmptyState title="No bid records" detail="Create a shipment request to receive carrier bids." />
            )}
          </div>
        </Panel>
      </div>
      <aside className="side-stack">
        <Panel title="Next Step" eyebrow="Shipping">
          <button className="primary full icon-label" type="button" onClick={() => navigate('/app/book')}>
            <Plus size={18} />
            <span>Create Request</span>
          </button>
        </Panel>
      </aside>
    </section>
  );
}

function DocumentsPage({ notify, user }) {
  const role = roleForUser(user);
  const [shipments, setShipments] = useState([]);
  const [fleet, setFleet] = useState([]);
  const [busy, setBusy] = useState('');
  const pendingUploadRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    api
      .listBookings()
      .then((data) => Array.isArray(data.bookings) && setShipments(data.bookings.map(normalizeBookingShipment)))
      .catch(() => setShipments(workspaceShipments));

    if (role === 'owner') {
      api
        .fleetTrucks()
        .then((data) => Array.isArray(data.trucks) && setFleet(data.trucks.map(normalizeTruck)))
        .catch(() => setFleet(workspaceFleet.slice(0, 2)));
    }
  }, [role]);

  async function downloadDoc(definition, shipment) {
    if (!shipment?.bookingId) {
      notify('Document needs a synced booking');
      return;
    }

    setBusy(`${shipment.bookingId}-${definition.type}`);
    try {
      await api.downloadDocument(definition.type, shipment.bookingId);
      notify(`${definition.label} downloaded`);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  function openUpload(targetType, targetId, documentType) {
    pendingUploadRef.current = { targetType, targetId, documentType };
    fileInputRef.current?.click();
  }

  async function uploadDocument(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    const pending = pendingUploadRef.current;
    if (!file || !pending) return;

    setBusy(`${pending.targetId}-${pending.documentType}`);
    try {
      if (pending.targetType === 'truck') {
        if (pending.documentType === 'vehicle-photos') {
          const data = await api.uploadTruckPhoto(pending.targetId, file);
          if (data.truck) {
            const updated = normalizeTruck(data.truck);
            setFleet((current) => current.map((item) => (item.id === updated.id ? updated : item)));
          }
        } else {
          await api.uploadTruckDocument(pending.targetId, pending.documentType, file);
        }
      } else {
        const data = await api.uploadCargo([file]);
        saveLocal('shipment_documents', {
          targetId: pending.targetId,
          documentType: pending.documentType,
          url: data.urls?.[0]
        });
      }
      notify('Document sent to admin review');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="workspace-layout">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={uploadDocument}
        style={{ display: 'none' }}
      />
      <div className="stack">
        <Panel title={role === 'owner' ? 'Fleet Documents' : 'Shipment Documents'} eyebrow="Admin Review">
          <div className="cards-grid">
            {role === 'owner'
              ? fleet.map((truck) => (
                  <article className="quote-card" key={truck.id}>
                    <StatusBadge tone={truck.verified ? 'success' : 'warn'}>{truck.documentStatus}</StatusBadge>
                    <h3>{truck.plate}</h3>
                    <p>{truck.name}</p>
                    <div className="doc-list compact">
                      {ownerVehicleDocuments.map((item) => {
                        const slug = slugDocumentType(item);
                        return (
                          <button
                            type="button"
                            key={item}
                            disabled={busy === `${truck.id}-${slug}`}
                            onClick={() => openUpload('truck', truck.id, slug)}
                          >
                            {busy === `${truck.id}-${slug}` ? 'Uploading...' : item}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                ))
              : shipments.map((shipment) => (
                  <article className="quote-card" key={shipment.id}>
                    <StatusBadge>{shipment.status}</StatusBadge>
                    <h3>{shipment.id}</h3>
                    <p>{shipment.route}</p>
                    <div className="doc-list compact">
                      {documentActions.map((definition) => (
                        <button
                          type="button"
                          key={definition.label}
                          disabled={busy === `${shipment.bookingId}-${definition.type}`}
                          onClick={() =>
                            definition.mode === 'upload'
                              ? openUpload('shipment', shipment.id, definition.type)
                              : downloadDoc(definition, shipment)
                          }
                        >
                          {busy === `${shipment.bookingId}-${definition.type}` ? 'Working...' : definition.label}
                        </button>
                      ))}
                    </div>
                  </article>
                ))}
            {role === 'owner' && !fleet.length ? (
              <EmptyState
                title="No vehicles yet"
                detail="Register a vehicle first so admin can review its documents."
              />
            ) : null}
            {role !== 'owner' && !shipments.length ? (
              <EmptyState title="No shipment documents" detail="Create a booking to generate shipment paperwork." />
            ) : null}
          </div>
        </Panel>
      </div>
      <aside className="side-stack">
        <Panel title="Verification" eyebrow="Account">
          <p className="muted-note">Profile and vehicle documents land in the admin queue for approval.</p>
          <button className="secondary full icon-label" type="button" onClick={() => navigate('/app/onboarding')}>
            <ShieldCheck size={18} />
            <span>Open Verification</span>
          </button>
        </Panel>
      </aside>
    </section>
  );
}

function PaymentsPage({ notify, user }) {
  const role = roleForUser(user);
  const [walletBalance, setWalletBalance] = useState(0);
  const [shipments, setShipments] = useState([]);
  const [withdrawBusy, setWithdrawBusy] = useState(false);
  const [withdrawDraft, setWithdrawDraft] = useState({
    amount: 100,
    method: 'mpesa',
    destination: '+254700000000',
    accountName: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'iTruck User'
  });

  useEffect(() => {
    api
      .wallet()
      .then((data) => Number.isFinite(Number(data.balance)) && setWalletBalance(Number(data.balance)))
      .catch(() => {});
    api
      .listBookings()
      .then((data) => Array.isArray(data.bookings) && setShipments(data.bookings.map(normalizeBookingShipment)))
      .catch(() => setShipments(workspaceShipments));
  }, []);

  function updateWithdraw(key, value) {
    setWithdrawDraft((current) => ({ ...current, [key]: value }));
  }

  async function requestWithdrawal(event) {
    event.preventDefault();
    setWithdrawBusy(true);
    try {
      await api.withdraw({ ...withdrawDraft, amount: Number(withdrawDraft.amount) });
      setWalletBalance((current) => Math.max(0, current - Number(withdrawDraft.amount || 0)));
      notify('Withdrawal queued');
    } catch (err) {
      notify(err.message);
    } finally {
      setWithdrawBusy(false);
    }
  }

  return (
    <section className="workspace-layout">
      <div className="stack">
        <section className="metrics-grid">
          <MetricCard icon={Wallet} label="Wallet" value={money(walletBalance)} detail="Live payment balance" />
          <MetricCard icon={CreditCard} label="Role" value={roleName(role)} detail="Payment mode" />
          <MetricCard icon={PackageCheck} label="Shipments" value={shipments.length} detail="Billing records" />
          <MetricCard icon={FileText} label="Invoices" value={shipments.length} detail="Document service" />
        </section>
        <Panel title={role === 'owner' ? 'Withdraw Earnings' : 'Shipment Invoices'} eyebrow="Payments">
          {role === 'owner' ? (
            <form className="payout-form" onSubmit={requestWithdrawal}>
              <Input
                label="Amount USD"
                type="number"
                value={withdrawDraft.amount}
                onChange={(value) => updateWithdraw('amount', Number(value))}
              />
              <Select
                label="Method"
                value={withdrawDraft.method}
                onChange={(value) => updateWithdraw('method', value)}
                options={['mpesa', 'mtn', 'bank', 'stripe']}
              />
              <Input
                label="Phone or account"
                value={withdrawDraft.destination}
                onChange={(value) => updateWithdraw('destination', value)}
              />
              <button className="primary full" type="submit" disabled={withdrawBusy}>
                {withdrawBusy ? 'Queuing...' : 'Withdraw'}
              </button>
            </form>
          ) : (
            <div className="doc-list">
              {shipments.map((shipment) => (
                <button
                  type="button"
                  key={shipment.id}
                  onClick={() => {
                    if (!shipment.bookingId) {
                      notify('Invoice needs a synced booking');
                      return;
                    }
                    api.downloadDocument('invoice', shipment.bookingId).catch((err) => notify(err.message));
                  }}
                >
                  {shipment.id} invoice
                </button>
              ))}
              {!shipments.length ? <span>No invoices yet</span> : null}
            </div>
          )}
        </Panel>
      </div>
    </section>
  );
}

function MessagesPage({ notify, user }) {
  const [shipments, setShipments] = useState([]);
  const [selected, setSelected] = useState(0);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    api
      .listBookings()
      .then((data) => Array.isArray(data.bookings) && setShipments(data.bookings.map(normalizeBookingShipment)))
      .catch(() => setShipments(workspaceShipments));
  }, []);

  const shipment = shipments[selected] || shipments[0];
  const messageKey = shipment?.bookingId || shipment?.id || '';

  useEffect(() => {
    if (!shipment) return;
    setMessages(readLocalChat(shipment));
    api
      .listMessages(messageKey)
      .then((data) => {
        const items = Array.isArray(data.items) ? data.items : [];
        if (items.length) setMessages(items.map((item) => normalizeWorkflowMessage(item, user?._id)));
      })
      .catch(() => {});
  }, [messageKey, shipment, user?._id]);

  async function sendMessage(event) {
    event.preventDefault();
    if (!shipment || !draft.trim()) return;

    const text = draft.trim();
    setDraft('');
    const next = [
      ...messages,
      { id: `message-${Date.now()}`, author: 'me', name: 'You', text, createdAt: new Date().toISOString() }
    ];
    setMessages(next);
    persistLocalChat(shipment.id, next);

    try {
      await api.sendMessage({
        booking: shipment.bookingId,
        bookingId: shipment.bookingId,
        shipmentId: shipment.id,
        route: shipment.route,
        text,
        sender: 'me',
        status: 'sent'
      });
    } catch (err) {
      notify(err.message);
    }
  }

  return (
    <section className="tracking-layout">
      <Panel title="Threads" eyebrow="Shipments">
        <div className="tracking-list">
          {shipments.map((item, index) => (
            <button
              className={index === selected ? 'active' : ''}
              type="button"
              key={item.id}
              onClick={() => setSelected(index)}
            >
              <strong>{item.id}</strong>
              <span>{item.route}</span>
              <small>{item.status}</small>
            </button>
          ))}
          {!shipments.length ? (
            <EmptyState title="No messages" detail="Messages attach to synced shipment records." />
          ) : null}
        </div>
      </Panel>
      <Panel title={shipment?.route || 'Messages'} eyebrow="In-house Text">
        <div className="chat-thread">
          {messages.map((message) => (
            <div className={`chat-message ${message.author === 'me' ? 'me' : 'them'}`} key={message.id}>
              <p>{message.text}</p>
              <small>
                {message.name} - {formatMessageTime(message.createdAt)}
              </small>
            </div>
          ))}
        </div>
        <form className="chat-compose" onSubmit={sendMessage}>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type a message..." />
          <button className="primary" type="submit" aria-label="Send message">
            <Send size={18} />
          </button>
        </form>
      </Panel>
    </section>
  );
}

function AdminPage({ notify }) {
  const [stats, setStats] = useState(null);
  const [adminData, setAdminData] = useState({
    users: [],
    trucks: [],
    bookings: [],
    payments: [],
    logs: []
  });
  const [busyAction, setBusyAction] = useState('');

  const loadAdminData = useCallback(async () => {
    const [statsResult, usersResult, trucksResult, bookingsResult, paymentsResult, logsResult] =
      await Promise.allSettled([
        api.adminStats(),
        api.adminListUsers(),
        api.adminListTrucks(),
        api.adminListBookings(),
        api.adminListPayments(),
        api.adminAuditLogs()
      ]);

    if (statsResult.status === 'fulfilled') setStats(statsResult.value);
    else setStats(null);

    setAdminData({
      users: usersResult.status === 'fulfilled' ? usersResult.value.users || [] : [],
      trucks: trucksResult.status === 'fulfilled' ? trucksResult.value.trucks || [] : [],
      bookings: bookingsResult.status === 'fulfilled' ? bookingsResult.value.bookings || [] : [],
      payments: paymentsResult.status === 'fulfilled' ? paymentsResult.value.transactions || [] : [],
      logs: logsResult.status === 'fulfilled' ? logsResult.value.logs || [] : []
    });
  }, []);

  useEffect(() => {
    loadAdminData();
  }, [loadAdminData]);

  function recordId(record) {
    return record?._id || record?.id || record?.bookingId || '';
  }

  function personName(user) {
    return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.email || 'selected owner';
  }

  function needsDocumentReview(record) {
    return (record?.documents || []).some((doc) => ['pending', 'expired'].includes(doc.status));
  }

  const pendingOwners = adminData.users.filter(
    (user) => user.role === 'owner' && (!user.isVerified || needsDocumentReview(user))
  );
  const unverifiedTrucks = adminData.trucks.filter((truck) => truck.isVerified === false || needsDocumentReview(truck));
  const delayedBookings = adminData.bookings.filter((booking) => ['in_transit', 'disputed'].includes(booking.status));
  const releaseReadyBookings = adminData.bookings.filter(
    (booking) => booking.status === 'delivered' && booking.paymentStatus === 'escrowed'
  );
  const highValueBookings = adminData.bookings.filter(
    (booking) => Number(booking.cargoValue || booking.budget || booking.paymentAmount || 0) >= 5000
  );
  const duplicatePlates = adminData.trucks.length - new Set(adminData.trucks.map((truck) => truck.plateNumber)).size;

  const operationQueue = [
    {
      key: 'kyc',
      label: 'Verify owner KYC',
      detail: pendingOwners.length
        ? `${personName(pendingOwners[0])} needs KYC or document review`
        : 'No owner KYC reviews waiting',
      tone: pendingOwners.length ? 'success' : 'default'
    },
    {
      key: 'delay',
      label: 'Resolve route delay',
      detail: delayedBookings[0]
        ? `${bookingRef(delayedBookings[0])} needs route follow-up`
        : 'No delayed routes need review',
      tone: delayedBookings.length ? 'warn' : 'default'
    },
    {
      key: 'escrow',
      label: 'Release escrow',
      detail: releaseReadyBookings.length
        ? `${bookingRef(releaseReadyBookings[0])} is delivered and escrowed`
        : 'No delivered escrow booking is release-ready',
      tone: releaseReadyBookings.length ? 'success' : 'default'
    }
  ];

  async function runAdminOperation(key) {
    setBusyAction(key);
    try {
      if (key === 'kyc') {
        const owner = pendingOwners[0];
        if (!owner) {
          notify('No owner KYC reviews are waiting');
          return;
        }
        await api.adminReviewUserDocument(recordId(owner), 'kyc', {
          status: 'approved',
          notes: 'Reviewed from operations workspace'
        });
        notify(`Owner KYC review recorded for ${personName(owner)}`);
        await loadAdminData();
        return;
      }

      if (key === 'delay') {
        const booking = delayedBookings[0];
        await api.adminNotify({
          title: 'Route delay review',
          message: booking
            ? `${bookingRef(booking)} route delay queued for operator follow-up`
            : 'Route delay queue checked',
          priority: booking ? 'high' : 'normal'
        });
        notify(booking ? `Route delay follow-up queued for ${bookingRef(booking)}` : 'Route delay queue checked');
        await loadAdminData();
        return;
      }

      if (key === 'escrow') {
        const booking = releaseReadyBookings[0];
        if (!booking) {
          notify('No delivered escrow booking is ready for release');
          return;
        }
        await api.releasePayment(recordId(booking));
        notify(`Payment release submitted for ${bookingRef(booking)}`);
        await loadAdminData();
      }
    } catch (err) {
      notify(err.message || 'Admin action failed');
    } finally {
      setBusyAction('');
    }
  }

  async function runRiskControl(label) {
    setBusyAction(label);
    try {
      if (label === 'Duplicate listing checks') {
        await api.adminListTrucks();
        notify(`${duplicatePlates} possible duplicate plate listing${duplicatePlates === 1 ? '' : 's'} found`);
      } else if (label === 'Payment release approval') {
        await api.adminListPayments();
        notify(
          `${releaseReadyBookings.length} booking${releaseReadyBookings.length === 1 ? '' : 's'} ready for release review`
        );
      } else if (label === 'High-value cargo review') {
        await api.adminListBookings();
        notify(`${highValueBookings.length} high-value booking${highValueBookings.length === 1 ? '' : 's'} found`);
      } else {
        await api.adminListTrucks();
        notify(`${unverifiedTrucks.length} carrier document review${unverifiedTrucks.length === 1 ? '' : 's'} waiting`);
      }
    } catch (err) {
      notify(err.message || 'Risk control check failed');
    } finally {
      setBusyAction('');
    }
  }

  const riskControls = [
    'Duplicate listing checks',
    'Payment release approval',
    'High-value cargo review',
    'Carrier document expiry alerts'
  ];

  return (
    <div className="page-grid">
      <section className="metrics-grid">
        <MetricCard icon={ShieldCheck} label="Users" value={stats?.totalUsers ?? 0} detail="Registered accounts" />
        <MetricCard icon={Truck} label="Trucks" value={stats?.totalTrucks ?? 0} detail="Registered vehicles" />
        <MetricCard
          icon={CreditCard}
          label="Revenue"
          value={money(stats?.totalRevenue || 0)}
          detail="Completed transactions"
        />
        <MetricCard icon={FileText} label="Bookings" value={stats?.totalBookings ?? 0} detail="Shipment records" />
      </section>
      <section className="workspace-layout">
        <Panel title="Operations Queue" eyebrow="Admin">
          <div className="shipment-stack">
            {operationQueue.map((item) => (
              <article
                className="shipment-row"
                key={item.key}
                role="button"
                tabIndex={0}
                onClick={() => runAdminOperation(item.key)}
                onKeyDown={(event) => activateOnEnter(event, () => runAdminOperation(item.key))}
              >
                <div>
                  <StatusBadge tone={item.tone}>{item.label}</StatusBadge>
                  <h3>{item.label}</h3>
                  <p>{item.detail}</p>
                </div>
                <button
                  className="secondary"
                  type="button"
                  disabled={busyAction === item.key}
                  onClick={(event) => {
                    event.stopPropagation();
                    runAdminOperation(item.key);
                  }}
                >
                  {busyAction === item.key ? 'Working...' : 'Review'}
                </button>
              </article>
            ))}
          </div>
        </Panel>
        <Panel title="Risk Controls" eyebrow="Trust">
          <div className="doc-list">
            {riskControls.map((label) => (
              <button type="button" key={label} disabled={busyAction === label} onClick={() => runRiskControl(label)}>
                {busyAction === label ? 'Checking...' : label}
              </button>
            ))}
          </div>
        </Panel>
        <Panel title="Admin Activity" eyebrow="Audit">
          <div className="doc-list compact">
            <span>{adminData.logs.length} audit log entries loaded</span>
            <span>{adminData.payments.length} payment records loaded</span>
            <span>{unverifiedTrucks.length} truck reviews pending</span>
          </div>
        </Panel>
      </section>
    </div>
  );
}

function ProfilePage({ notify, route, user, setUser, signOut }) {
  const [email, setEmail] = useState(user.email || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState('');
  const [pendingDocument, setPendingDocument] = useState('');
  const pendingDocumentRef = useRef('');
  const documentInputRef = useRef(null);
  const verificationItems = ['Owner KYC', 'Driver ID', 'Vehicle logbook', 'Insurance', 'Route history'];

  const selectPendingDocument = useCallback((item) => {
    pendingDocumentRef.current = item;
    setPendingDocument(item);
  }, []);

  useEffect(() => {
    const requestedDocument = new URLSearchParams(route.split('?')[1] || '').get('document');
    if (!requestedDocument) return;

    if (!user.email) {
      notify('Sign in before uploading verification documents');
      return;
    }

    selectPendingDocument(requestedDocument);
    const timer = window.setTimeout(() => documentInputRef.current?.click(), 250);
    return () => window.clearTimeout(timer);
  }, [notify, route, selectPendingDocument, user.email]);

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api.login({ email, password });
      setSession(data);
      setUser(data.user);
      notify('Signed in');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openVerificationUpload(item) {
    if (!user.email) {
      notify('Sign in before uploading verification documents');
      return;
    }

    selectPendingDocument(item);
    documentInputRef.current?.click();
  }

  async function uploadVerificationDocument(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    const documentType = pendingDocumentRef.current || pendingDocument;
    if (!file || !documentType) return;

    setUploadingDocument(documentType);
    try {
      const data = await api.uploadProfileDocument(slugDocumentType(documentType), file);
      if (data.user) {
        setSession({ user: data.user });
        setUser(data.user);
      }
      notify(`${documentType} uploaded for review`);
    } catch (err) {
      notify(err.message);
    } finally {
      setUploadingDocument('');
    }
  }

  return (
    <section className="profile-layout">
      <Panel title="Session" eyebrow="Account">
        <form className="modal-form" onSubmit={login}>
          <Input label="Email" value={email} onChange={setEmail} />
          <Input label="Password" type="password" value={password} onChange={setPassword} />
          <div className="button-row">
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Signing in...' : 'Sign In'}
            </button>
            <button className="ghost icon-label" type="button" onClick={signOut}>
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          </div>
        </form>
      </Panel>
      <Panel title="Verification" eyebrow="Trust">
        <input
          ref={documentInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          onChange={uploadVerificationDocument}
          style={{ display: 'none' }}
        />
        <div className="verification-card">
          <CheckCircle2 size={28} />
          <strong>{user.email ? `${user.firstName || 'User'} ${user.lastName || ''}` : 'Sign in required'}</strong>
          <span>
            {user.role || 'No live session'} - {user.country || 'Local workspace'}
          </span>
        </div>
        <div className="doc-list compact">
          {verificationItems.map((item) => (
            <button
              type="button"
              key={item}
              disabled={Boolean(uploadingDocument)}
              onClick={() => openVerificationUpload(item)}
            >
              {uploadingDocument === item ? 'Uploading...' : item}
            </button>
          ))}
        </div>
      </Panel>
      {user.email ? (
        <Panel title="Active Sessions" eyebrow="Security">
          <SessionsManager notify={notify} />
        </Panel>
      ) : null}
    </section>
  );
}

function Panel({ title, eyebrow, action, onAction, children }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
        </div>
        {action ? (
          <button className="text-button" type="button" onClick={onAction}>
            {action}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ title, detail }) {
  return (
    <div className="empty-state">
      <ClipboardCheck size={24} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text' }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Select({ label, value, onChange, options, emptyLabel }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option || 'empty'} value={option}>
            {option || emptyLabel || 'All'}
          </option>
        ))}
      </select>
    </label>
  );
}

export default App;
