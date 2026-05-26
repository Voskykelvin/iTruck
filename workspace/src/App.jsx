import { useEffect, useMemo, useState } from 'react';
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
  Wallet,
  X
} from 'lucide-react';
import { api, clearSession, currentUser, setSession } from './api.js';
import { demoDocuments, demoFleet, demoLoads, demoShipments } from './data.js';

const navItems = [
  { path: '/app/shipper', label: 'Shipper', icon: LayoutDashboard },
  { path: '/app/book', label: 'Book', icon: Plus },
  { path: '/app/marketplace', label: 'Marketplace', icon: Search },
  { path: '/app/tracking', label: 'Tracking', icon: Map },
  { path: '/app/owner', label: 'Owner', icon: Truck },
  { path: '/app/admin', label: 'Admin', icon: BarChart3 },
  { path: '/app/profile', label: 'Profile', icon: UserRound }
];

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const workspaceFleet = DEMO_MODE ? demoFleet : [];
const workspaceShipments = DEMO_MODE ? demoShipments : [];
const workspaceLoads = DEMO_MODE ? demoLoads : [];

const vehicleTypes = ['Matatu', 'Pickup', 'Lorry', 'Large Truck', 'Trailer', 'Bus', 'Specialised'];
const defaultBooking = {
  pickup: 'Nairobi',
  destination: 'Kampala',
  distance: 640,
  border: 'Cross-border',
  pickupWindow: 'Morning pickup',
  vehicleType: 'Lorry',
  cargo: 'Retail stock',
  weight: '8 tonnes',
  requirements: 'Standard',
  cargoValue: 8200,
  receiverName: 'Amina Warehouse',
  receiverPhone: '+256700000000',
  communicationPreference: 'WhatsApp + SMS updates',
  paymentMethod: 'M-Pesa',
  optionalServices: ['customsBroker']
};

function routeFromLocation() {
  const path = window.location.pathname;
  if (path === '/app' || path === '/app/') return '/app/shipper';
  return path;
}

function navigate(path) {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
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

function normalizeTruck(truck) {
  const price = truck.price || (truck.pricePerKm ? `$${Number(truck.pricePerKm).toFixed(2)}/km` : 'Quote');
  const routes = truck.routes || [];
  const verified = truck.verified ?? truck.isVerified ?? false;
  return {
    id: truck._id || truck.id || truck.plate || truck.plateNumber,
    type: truck.type || 'Lorry',
    name: truck.name || [truck.make, truck.model].filter(Boolean).join(' ') || 'Listed truck',
    plate: truck.plate || truck.plateNumber || 'ITK-DEMO',
    owner: truck.ownerName || truck.owner || 'Verified carrier',
    company: truck.company || 'Carrier partner',
    price,
    pricePerKm: Number(truck.pricePerKm || String(price).replace(/[^0-9.]/g, '')) || 0,
    capacity: truck.capacity || (truck.capacityTonnes ? `${truck.capacityTonnes} tonnes` : 'Capacity on request'),
    rating: Number(truck.rating || 4.5),
    trips: Number(truck.trips || truck.totalTrips || 40),
    routeFit: Number(truck.routeFit || Math.min(98, 64 + (verified ? 16 : 0) + Math.min(12, routes.length * 4))),
    availability: truck.availability || (truck.isAvailable === false ? 'Offline' : 'Available now'),
    documentStatus: truck.documentStatus || (verified ? 'Docs verified' : 'Docs pending'),
    responseTime: truck.responseTime || (verified ? '< 20 min' : 'Manual review'),
    routes,
    features: truck.features || [],
    verified
  };
}

function bookingRef(booking) {
  return booking._id || booking.id || booking.bookingId || 'ITK-PENDING';
}

function bookingRoute(booking) {
  return booking.route || [booking.pickup, booking.destination].filter(Boolean).join(' to ') || 'Route pending';
}

function statusLabel(status = 'pending') {
  return status
    .replaceAll('_', ' ')
    .replace(/\b\w/g, letter => letter.toUpperCase());
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
    route: bookingRoute(booking),
    origin: booking.pickup || 'Pickup pending',
    destination: booking.destination || 'Destination pending',
    cargo: booking.cargo || 'Cargo pending',
    vehicle: booking.vehicleType || booking.truck?.type || 'Vehicle pending',
    plate: booking.truck?.plateNumber || booking.plate || 'Unassigned',
    driver: booking.owner ? `${booking.owner.firstName || ''} ${booking.owner.lastName || ''}`.trim() : 'Carrier pending',
    status: statusLabel(booking.status),
    rawStatus: booking.status || 'pending',
    progress,
    eta: booking.eta || (booking.status === 'delivered' ? 'POD ready' : 'Awaiting update'),
    position: latest.city || (latest.lat && latest.lng ? `${latest.lat}, ${latest.lng}` : 'Awaiting GPS update'),
    speed: latest.speed ? `${latest.speed} km/h` : 'Speed pending',
    payment: booking.paymentMethod || 'Payment pending',
    documents: booking.estimate?.requiredDocuments || demoDocuments.slice(0, 3)
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
    quoteProtection: 'Estimate includes visible platform, insurance, escrow, and selected service fees before carrier bids.'
  };
}

function App() {
  const [route, setRoute] = useState(routeFromLocation());
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [user, setUser] = useState(currentUser());

  useEffect(() => {
    const syncRoute = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  function notify(message) {
    setToast(message);
    window.clearTimeout(notify.timer);
    notify.timer = window.setTimeout(() => setToast(''), 2800);
  }

  function signOut() {
    clearSession();
    setUser({});
    notify('Signed out');
  }

  const page = useMemo(() => {
    const props = { notify, user, setUser };
    if (route.startsWith('/app/book')) return <BookingPage {...props} />;
    if (route.startsWith('/app/marketplace')) return <MarketplacePage {...props} />;
    if (route.startsWith('/app/tracking')) return <TrackingPage {...props} />;
    if (route.startsWith('/app/owner')) return <OwnerPage {...props} />;
    if (route.startsWith('/app/admin')) return <AdminPage {...props} />;
    if (route.startsWith('/app/profile')) return <ProfilePage {...props} signOut={signOut} />;
    return <ShipperPage {...props} />;
  }, [route, user]);

  return (
    <div className="app-shell">
      <aside className={`app-sidebar ${menuOpen ? 'open' : ''}`}>
        <a className="brand" href="/">
          <span>iT</span> iTruck
        </a>
        <nav>
          {navItems.map(item => {
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
            <button className="ghost icon-label" type="button" onClick={() => notify('Notifications queue checked')}>
              <Bell size={18} />
              <span>Alerts</span>
            </button>
            <button className="primary icon-label" type="button" onClick={() => navigate('/app/book')}>
              <Plus size={18} />
              <span>New Load</span>
            </button>
          </div>
        </header>

        {page}
      </main>

      <button className={`menu-scrim ${menuOpen ? 'show' : ''}`} type="button" aria-label="Close menu" onClick={() => setMenuOpen(false)} />
      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
}

function pageTitle(route) {
  if (route.includes('/book')) return 'Book a Truck';
  if (route.includes('/marketplace')) return 'Truck Marketplace';
  if (route.includes('/tracking')) return 'Live Tracking';
  if (route.includes('/owner')) return 'Fleet Owner';
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

function ShipperPage() {
  const [shipments, setShipments] = useState(workspaceShipments);

  useEffect(() => {
    api.listBookings()
      .then(data => {
        if (Array.isArray(data.bookings)) setShipments(data.bookings.map(normalizeBookingShipment));
      })
      .catch(() => setShipments(workspaceShipments));
  }, []);

  const activeCount = shipments.filter(item => !['delivered', 'cancelled'].includes(item.rawStatus)).length;
  const inTransitCount = shipments.filter(item => item.rawStatus === 'in_transit').length;
  const openRequests = shipments.filter(item => ['pending', 'bidding'].includes(item.rawStatus));
  const actionQueue = [
    {
      label: 'Compare bids - Mombasa to Dar es Salaam',
      run: () => {
        saveLocal('action_reviews', { type: 'bid-review', route: 'Mombasa to Dar es Salaam' });
        notify('Bid comparison opened for Mombasa to Dar es Salaam');
      }
    },
    {
      label: 'Confirm waybill and cargo photos',
      run: () => {
        saveLocal('document_checks', { type: 'waybill-cargo-photos', status: 'confirmed' });
        notify('Waybill and cargo photo check recorded');
      }
    },
    {
      label: 'Release payment after POD',
      run: () => {
        saveLocal('payment_releases', { type: 'pod-release', status: 'queued' });
        notify('Payment release queued after proof of delivery');
      }
    }
  ];
  const readinessDocs = [
    ['Waybill ready', 'Waybill opened'],
    ['Insurance note shared', 'Insurance note opened'],
    ['Delivery proof pending', 'Delivery proof checklist opened']
  ];

  return (
    <div className="page-grid">
      <section className="intro-band">
        <div>
          <p className="eyebrow">Client Workspace</p>
          <h2>Shipments that need your attention.</h2>
          <p>Compare bids, review documents, release payments, and keep active routes visible without jumping across separate static pages.</p>
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
          <span>{shipments[0] ? `${shipments[0].route} - ${shipments[0].id}` : 'Create a booking to start tracking'}</span>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard icon={PackageCheck} label="Total Shipments" value={shipments.length} detail="MongoDB booking records" />
        <MetricCard icon={Truck} label="In Transit" value={inTransitCount} detail="Live shipment status" />
        <MetricCard icon={AlertTriangle} label="Awaiting Action" value={openRequests.length} detail="Bids, docs, payment" />
        <MetricCard icon={Wallet} label="Wallet" value="$4.2k" detail="Escrow held: $1,260" />
      </section>

      <section className="workspace-layout">
        <div className="stack">
          <Panel title="Shipment Command" eyebrow="Live Work" action="View map" onAction={() => navigate('/app/tracking')}>
            <div className="shipment-stack">
              {shipments.length ? shipments.map(item => (
                <article
                  className="shipment-row"
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/app/tracking?shipment=${item.id}`)}
                  onKeyDown={event => activateOnEnter(event, () => navigate(`/app/tracking?shipment=${item.id}`))}
                >
                  <div>
                    <StatusBadge tone={item.status === 'Delivered' ? 'success' : item.status === 'Bids open' ? 'warn' : 'default'}>{item.status}</StatusBadge>
                    <h3>{item.id}</h3>
                    <p>{item.route}</p>
                    <small>{item.cargo} - {item.eta}</small>
                  </div>
                  <div className="progress-block">
                    <strong>{item.progress}%</strong>
                    <div className="progress"><span style={{ width: `${item.progress}%` }} /></div>
                    <button
                      className="ghost"
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        navigate(`/app/tracking?shipment=${item.id}`);
                      }}
                    >
                      Open
                    </button>
                  </div>
                </article>
              )) : <EmptyState title="No live shipments yet" detail="Create a booking or connect MongoDB data to populate this dashboard." />}
            </div>
          </Panel>

          <Panel title="Open Requests" eyebrow="Quotes" action="Create request" onAction={() => navigate('/app/book')}>
            <div className="cards-grid">
              {openRequests.length ? openRequests.map(item => (
                <article className="quote-card" key={item.id}>
                  <StatusBadge>{item.status}</StatusBadge>
                  <h3>{item.route}</h3>
                  <p>{item.vehicle}</p>
                  <strong>{item.payment}</strong>
                  <button
                    className="secondary"
                    type="button"
                    onClick={() => {
                      saveLocal('action_reviews', { type: 'open-request-bids', bookingId: item.id, route: item.route });
                      notify(`Bid review opened for ${item.route}`);
                    }}
                  >
                    Review Bids
                  </button>
                </article>
              )) : <EmptyState title="No open quote requests" detail="New booking requests will appear here from MongoDB." />}
            </div>
          </Panel>
        </div>

        <aside className="side-stack">
          <Panel title="Action Queue" eyebrow="Today">
            <div className="action-list">
              {actionQueue.map(item => (
                <button className="action-item" type="button" key={item.label} onClick={item.run}>{item.label}</button>
              ))}
            </div>
          </Panel>
          <Panel title="Documents" eyebrow="Readiness">
            <div className="doc-list">
              {readinessDocs.map(([label, message]) => (
                <button type="button" key={label} onClick={() => notify(message)}>{label}</button>
              ))}
            </div>
          </Panel>
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

  useEffect(() => {
    let active = true;
    const payload = { ...form, crossBorder: form.border === 'Cross-border' };
    api.estimate(payload)
      .then(data => active && setEstimate(data))
      .catch(() => active && setEstimate(fallbackEstimate(payload)));
    return () => {
      active = false;
    };
  }, [form]);

  function update(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function toggleService(service) {
    setForm(current => {
      const set = new Set(current.optionalServices || []);
      set.has(service) ? set.delete(service) : set.add(service);
      return { ...current, optionalServices: [...set] };
    });
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
    } catch (err) {
      saveLocal('bookings', payload);
      notify('Booking saved locally until login/API sync is available');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="booking-grid" onSubmit={submit}>
      <section className="form-sections">
        <Panel title="Route" eyebrow="Step 1">
          <div className="form-grid">
            <Input label="Pickup" value={form.pickup} onChange={value => update('pickup', value)} />
            <Input label="Destination" value={form.destination} onChange={value => update('destination', value)} />
            <Input label="Distance km" type="number" value={form.distance} onChange={value => update('distance', Number(value))} />
            <Select label="Border" value={form.border} onChange={value => update('border', value)} options={['Domestic', 'Cross-border']} />
            <Select label="Pickup window" value={form.pickupWindow} onChange={value => update('pickupWindow', value)} options={['Flexible pickup window', 'Morning pickup', 'Afternoon pickup', 'Evening pickup', 'Appointment required']} />
          </div>
        </Panel>

        <Panel title="Vehicle & Cargo" eyebrow="Step 2">
          <div className="vehicle-picks">
            {vehicleTypes.map(type => (
              <button className={form.vehicleType === type ? 'active' : ''} type="button" key={type} onClick={() => update('vehicleType', type)}>
                {type}
              </button>
            ))}
          </div>
          <div className="form-grid">
            <TextArea label="Cargo" value={form.cargo} onChange={value => update('cargo', value)} />
            <Input label="Weight" value={form.weight} onChange={value => update('weight', value)} />
            <Select label="Handling" value={form.requirements} onChange={value => update('requirements', value)} options={['Standard', 'Refrigerated', 'Crane', 'Hazardous']} />
            <Input label="Cargo value USD" type="number" value={form.cargoValue} onChange={value => update('cargoValue', Number(value))} />
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
                <input type="checkbox" checked={(form.optionalServices || []).includes(key)} onChange={() => toggleService(key)} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </Panel>

        <Panel title="Receiver & Payment" eyebrow="Step 3">
          <div className="form-grid">
            <Input label="Receiver name" value={form.receiverName} onChange={value => update('receiverName', value)} />
            <Input label="Receiver phone" value={form.receiverPhone} onChange={value => update('receiverPhone', value)} />
            <Select label="Updates" value={form.communicationPreference} onChange={value => update('communicationPreference', value)} options={['WhatsApp + SMS updates', 'SMS only', 'Email updates', 'Phone calls for exceptions only']} />
            <Select label="Payment" value={form.paymentMethod} onChange={value => update('paymentMethod', value)} options={['Wallet', 'M-Pesa', 'MTN MoMo', 'Airtel Money', 'Card escrow', 'Cash on delivery']} />
          </div>
        </Panel>
      </section>

      <aside className="quote-panel">
        <Panel title="Quote Review" eyebrow="Live Estimate">
          <div className="estimate-total">
            <span>{estimate?.confidence || 'medium'} confidence</span>
            <strong>{money(estimate?.total, estimate?.currency)}</strong>
            <small>{estimate?.recommendedMode?.replace('-', ' ') || 'instant match'} - {estimate?.routeRisk || 'low'} risk</small>
          </div>
          <div className="line-items">
            {(estimate?.lineItems || []).map(item => (
              <div key={item.key}>
                <span>{item.label}</span>
                <strong>{money(item.amount, estimate.currency)}</strong>
              </div>
            ))}
          </div>
          <div className="doc-list compact">
            {(estimate?.requiredDocuments || demoDocuments.slice(0, 3)).map(item => <span key={item}>{item}</span>)}
          </div>
          <label className="ack-row">
            <input type="checkbox" checked={ack} onChange={event => setAck(event.target.checked)} />
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

function MarketplacePage({ notify }) {
  const [trucks, setTrucks] = useState(workspaceFleet);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [verified, setVerified] = useState(false);
  const [sort, setSort] = useState('best');

  useEffect(() => {
    api.listTrucks()
      .then(data => {
        if (Array.isArray(data.trucks) && data.trucks.length) setTrucks(data.trucks.map(normalizeTruck));
      })
      .catch(() => setTrucks(workspaceFleet));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return trucks
      .filter(truck => {
        const haystack = [truck.name, truck.type, truck.owner, truck.company, truck.plate, truck.price, ...(truck.routes || []), ...(truck.features || [])].join(' ').toLowerCase();
        return (!type || truck.type === type) && (!verified || truck.verified) && haystack.includes(q);
      })
      .sort((a, b) => {
        if (sort === 'price') return (a.pricePerKm || 999) - (b.pricePerKm || 999);
        if (sort === 'rating') return b.rating - a.rating;
        if (sort === 'trips') return b.trips - a.trips;
        return b.routeFit - a.routeFit;
      });
  }, [trucks, search, type, verified, sort]);

  return (
    <section className="market-layout">
      <aside className="filter-panel">
        <div className="filter-heading">
          <Filter size={18} />
          <strong>Refine fleet</strong>
        </div>
        <label className="search-field">
          <Search size={18} />
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search route, owner, plate" />
        </label>
        <Select label="Vehicle type" value={type} onChange={setType} options={['', ...vehicleTypes]} emptyLabel="All vehicles" />
        <Select label="Sort" value={sort} onChange={setSort} options={['best', 'price', 'rating', 'trips']} />
        <label className="toggle-row">
          <input type="checkbox" checked={verified} onChange={event => setVerified(event.target.checked)} />
          <span />
          <strong>Verified only</strong>
        </label>
      </aside>

      <div className="stack">
        <div className="result-bar">
          <strong>{filtered.length} trucks found</strong>
          <button className="ghost icon-label" type="button" onClick={() => navigate('/app/book')}>
            <Plus size={18} />
            <span>Create Request</span>
          </button>
        </div>
        <div className="cards-grid truck-grid">
          {filtered.map(truck => (
            <article className="truck-card" key={truck.id}>
              <div className="truck-head">
                <StatusBadge tone={truck.verified ? 'success' : 'warn'}>{truck.verified ? 'Verified' : 'Pending'}</StatusBadge>
                <strong>{truck.routeFit}% fit</strong>
              </div>
              <h3>{truck.name}</h3>
              <p>{truck.type} by {truck.owner}</p>
              <small>{truck.plate} - {truck.capacity}</small>
              <div className="decision-grid">
                <span>Rate<strong>{truck.price}</strong></span>
                <span>Rating<strong>{truck.rating.toFixed(1)} / {truck.trips}</strong></span>
                <span>Status<strong>{truck.availability}</strong></span>
              </div>
              <div className="chips">{truck.routes.slice(0, 2).map(route => <span key={route}>{route}</span>)}</div>
              <div className="trust-line">
                <span>{truck.documentStatus}</span>
                <span>{truck.responseTime}</span>
              </div>
              <div className="button-row">
                <button className="primary" type="button" onClick={() => notify(`${truck.name} profile opened`)}>
                  View Profile
                </button>
                <button className="ghost" type="button" onClick={() => navigate(`/app/book?truck=${truck.plate}`)}>
                  Request
                </button>
              </div>
            </article>
          ))}
          {!filtered.length ? <EmptyState title="No trucks found" detail="Live marketplace data will appear here after carriers are added and verified." /> : null}
        </div>
      </div>
    </section>
  );
}

function TrackingPage({ notify }) {
  const [selected, setSelected] = useState(0);
  const [shipments, setShipments] = useState(workspaceShipments);

  useEffect(() => {
    api.listBookings()
      .then(data => {
        if (Array.isArray(data.bookings)) setShipments(data.bookings.map(normalizeBookingShipment));
      })
      .catch(() => setShipments(workspaceShipments));
  }, []);

  const shipment = shipments[selected] || shipments[0];

  if (!shipment) {
    return (
      <Panel title="Live Tracking" eyebrow="Shipments">
        <EmptyState title="No active live shipments" detail="Tracking opens after a booking is confirmed and a vehicle starts sending route updates." />
      </Panel>
    );
  }

  const mapUrl = `https://www.google.com/maps?output=embed&saddr=${encodeURIComponent(shipment.origin)}&daddr=${encodeURIComponent(shipment.destination)}&dirflg=d`;

  return (
    <section className="tracking-layout">
      <Panel title="Active Routes" eyebrow="Shipments">
        <div className="tracking-list">
          {shipments.map((item, index) => (
            <button className={index === selected ? 'active' : ''} type="button" key={item.id} onClick={() => setSelected(index)}>
              <strong>{item.id}</strong>
              <span>{item.route}</span>
              <small>{item.progress}% - {item.position}</small>
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
          <button className="ghost icon-label" type="button" onClick={() => notify('Tracking link copied')}>
            <MessageSquare size={18} />
            <span>Share</span>
          </button>
        </div>
        <iframe title="Shipment route" src={mapUrl} loading="lazy" />
        <div className="map-status">
          <span>Current position</span>
          <strong>{shipment.position}</strong>
          <small>{shipment.speed} - ETA {shipment.eta}</small>
        </div>
      </section>

      <Panel title="Shipment Detail" eyebrow="Control">
        <div className="facts-grid">
          <span>Driver</span><strong>{shipment.driver}</strong>
          <span>Cargo</span><strong>{shipment.cargo}</strong>
          <span>Vehicle</span><strong>{shipment.vehicle} - {shipment.plate}</strong>
          <span>Payment</span><strong>{shipment.payment}</strong>
        </div>
        <div className="progress"><span style={{ width: `${shipment.progress}%` }} /></div>
        <div className="doc-list compact">
          {shipment.documents.map(item => <span key={item}>{item}</span>)}
        </div>
        <div className="stack-actions">
          <button className="primary" type="button" onClick={() => notify('Delivery confirmation recorded')}>Confirm Delivery</button>
          <button className="secondary" type="button" onClick={() => notify('Driver contact opened')}>Contact Driver</button>
          <button className="ghost" type="button" onClick={() => notify('Issue report sent to operations')}>Report Issue</button>
        </div>
      </Panel>
    </section>
  );
}

function OwnerPage({ notify }) {
  const [fleet, setFleet] = useState(workspaceFleet.slice(0, 3));
  const [loads, setLoads] = useState(workspaceLoads);
  const [draftPlate, setDraftPlate] = useState('');

  useEffect(() => {
    api.fleetTrucks()
      .then(data => {
        if (Array.isArray(data.trucks)) setFleet(data.trucks.map(normalizeTruck));
      })
      .catch(() => setFleet(workspaceFleet.slice(0, 3)));

    api.listOpenBookings()
      .then(data => {
        if (Array.isArray(data.bookings)) setLoads(data.bookings.map(normalizeOpenLoad));
      })
      .catch(() => setLoads(workspaceLoads));
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
      setFleet(current => [normalizeTruck(data.truck || payload), ...current]);
      notify('Vehicle saved to MongoDB');
    } catch (err) {
      const truck = normalizeTruck({ ...payload, id: draftPlate, plate: draftPlate });
      setFleet(current => [truck, ...current]);
      saveLocal('vehicles', truck);
      notify('Vehicle saved locally until API sync is available');
    } finally {
      setDraftPlate('');
    }
  }

  async function placeBid(load) {
    const payload = {
      bookingId: load.id,
      route: load.route,
      cargo: load.cargo,
      amount: load.price || 0,
      message: 'Available for pickup. Documents ready.',
      status: 'submitted'
    };

    try {
      await api.submitBid(payload);
      notify(`Bid saved for ${load.route}`);
    } catch (err) {
      saveLocal('bids', payload);
      notify('Bid saved locally until API sync is available');
    }
  }

  function runOwnerQueue(label) {
    if (label.startsWith('Submit bid')) {
      if (loads[0]) placeBid(loads[0]);
      else notify('No available load is ready for bidding');
      return;
    }

    if (label.startsWith('Upload insurance')) {
      saveLocal('insurance_tasks', { label, status: 'queued' });
      notify('Insurance upload task queued for Toyota Hilux');
      return;
    }

    saveLocal('pickup_updates', { label, status: 'confirmed' });
    notify('Pickup confirmation recorded for Kampala depot');
  }

  return (
    <div className="page-grid">
      <section className="metrics-grid">
        <MetricCard icon={Wallet} label="Monthly Earnings" value="$8.9k" detail="+18% vs last month" />
        <MetricCard icon={Truck} label="Active Jobs" value="7" detail="3 in transit" />
        <MetricCard icon={Gauge} label="Bid Win Rate" value="42%" detail="12 bids submitted" />
        <MetricCard icon={ShieldCheck} label="Rating" value="4.8" detail="146 completed trips" />
      </section>

      <section className="workspace-layout">
        <div className="stack">
          <Panel title="Job Board" eyebrow="Available Loads">
            <div className="shipment-stack">
              {loads.length ? loads.map(load => (
                <article
                  className="load-row"
                  key={load.route}
                  role="button"
                  tabIndex={0}
                  onClick={() => placeBid(load)}
                  onKeyDown={event => activateOnEnter(event, () => placeBid(load))}
                >
                  <div>
                    <StatusBadge tone={load.risk === 'High' ? 'warn' : 'success'}>{load.fit}</StatusBadge>
                    <h3>{load.cargo}</h3>
                    <p>{load.route}</p>
                    <small>{load.distance} - {load.window}</small>
                  </div>
                  <div>
                    <strong>${load.price.toLocaleString()}</strong>
                    <button
                      className="primary"
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        placeBid(load);
                      }}
                    >
                      Place Bid
                    </button>
                  </div>
                </article>
              )) : <EmptyState title="No live loads yet" detail="Verified shipper requests will appear here when the booking workflow is connected to owner matching." />}
            </div>
          </Panel>

          <Panel title="Vehicle Readiness" eyebrow="Fleet">
            <div className="add-row">
              <input value={draftPlate} onChange={event => setDraftPlate(event.target.value)} placeholder="Plate number" />
              <button className="secondary icon-label" type="button" onClick={addTruck}>
                <Plus size={18} />
                <span>Add</span>
              </button>
            </div>
            <div className="shipment-stack">
              {fleet.map(truck => (
                <article
                  className="shipment-row"
                  key={truck.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => notify(`${truck.plate} readiness opened`)}
                  onKeyDown={event => activateOnEnter(event, () => notify(`${truck.plate} readiness opened`))}
                >
                  <div>
                    <StatusBadge tone={truck.verified ? 'success' : 'warn'}>{truck.documentStatus}</StatusBadge>
                    <h3>{truck.plate}</h3>
                    <p>{truck.name}</p>
                    <small>{truck.routes[0] || 'Route pending'} - {truck.availability}</small>
                  </div>
                  <div className="progress-block">
                    <strong>{truck.routeFit}%</strong>
                    <div className="progress"><span style={{ width: `${truck.routeFit}%` }} /></div>
                    <button
                      className="ghost"
                      type="button"
                      onClick={event => {
                        event.stopPropagation();
                        notify(`${truck.plate} readiness opened`);
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
          <Panel title="Owner Queue" eyebrow="Today">
            <div className="action-list">
              {['Submit bid - Construction steel', 'Upload insurance - Toyota Hilux', 'Confirm pickup - Kampala depot'].map(item => (
                <button className="action-item" type="button" key={item} onClick={() => runOwnerQueue(item)}>{item}</button>
              ))}
            </div>
          </Panel>
        </aside>
      </section>
    </div>
  );
}

function AdminPage({ notify }) {
  const [stats, setStats] = useState(null);
  const riskControls = [
    ['Duplicate listing checks', 'Duplicate listing scan opened'],
    ['Payment release approval', 'Payment release approval queue opened'],
    ['High-value cargo review', 'High-value cargo review opened'],
    ['Carrier document expiry alerts', 'Carrier document expiry alerts opened']
  ];

  useEffect(() => {
    api.adminStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  return (
    <div className="page-grid">
      <section className="metrics-grid">
        <MetricCard icon={ShieldCheck} label="Users" value={stats?.totalUsers ?? 0} detail="MongoDB accounts" />
        <MetricCard icon={Truck} label="Trucks" value={stats?.totalTrucks ?? 0} detail="Registered vehicles" />
        <MetricCard icon={CreditCard} label="Revenue" value={money(stats?.totalRevenue || 0)} detail="Completed transactions" />
        <MetricCard icon={FileText} label="Bookings" value={stats?.totalBookings ?? 0} detail="Shipment records" />
      </section>
      <section className="workspace-layout">
        <Panel title="Operations Queue" eyebrow="Admin">
          <div className="shipment-stack">
            {[
              ['Verify owner KYC', 'Grace Wanjiku - logbook and insurance ready', 'success'],
              ['Resolve route delay', 'ITK-2044 border document check', 'warn'],
              ['Release escrow', 'ITK-2028 POD received', 'default']
            ].map(item => (
              <article
                className="shipment-row"
                key={item[0]}
                role="button"
                tabIndex={0}
                onClick={() => notify(`${item[0]} opened`)}
                onKeyDown={event => activateOnEnter(event, () => notify(`${item[0]} opened`))}
              >
                <div>
                  <StatusBadge tone={item[2]}>{item[0]}</StatusBadge>
                  <h3>{item[0]}</h3>
                  <p>{item[1]}</p>
                </div>
                <button
                  className="secondary"
                  type="button"
                  onClick={event => {
                    event.stopPropagation();
                    notify(`${item[0]} opened`);
                  }}
                >
                  Review
                </button>
              </article>
            ))}
          </div>
        </Panel>
        <Panel title="Risk Controls" eyebrow="Trust">
          <div className="doc-list">
            {riskControls.map(([label, message]) => (
              <button
                type="button"
                key={label}
                onClick={() => {
                  saveLocal('risk_controls', { control: label, openedAt: new Date().toISOString() });
                  notify(message);
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </Panel>
      </section>
    </div>
  );
}

function ProfilePage({ notify, user, setUser, signOut }) {
  const [email, setEmail] = useState(user.email || (DEMO_MODE ? 'admin@itruck.africa' : ''));
  const [password, setPassword] = useState(DEMO_MODE ? 'Admin2025!' : '');
  const [busy, setBusy] = useState(false);
  const verificationItems = ['Owner KYC', 'Driver ID', 'Vehicle logbook', 'Insurance', 'Route history'];

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

  return (
    <section className="profile-layout">
      <Panel title="Session" eyebrow="Account">
        <form className="modal-form" onSubmit={login}>
          <Input label="Email" value={email} onChange={setEmail} />
          <Input label="Password" type="password" value={password} onChange={setPassword} />
          <div className="button-row">
            <button className="primary" type="submit" disabled={busy}>{busy ? 'Signing in...' : 'Sign In'}</button>
            <button className="ghost icon-label" type="button" onClick={signOut}>
              <LogOut size={18} />
              <span>Sign Out</span>
            </button>
          </div>
        </form>
      </Panel>
      <Panel title="Verification" eyebrow="Trust">
        <div className="verification-card">
          <CheckCircle2 size={28} />
          <strong>{user.email ? `${user.firstName || 'User'} ${user.lastName || ''}` : 'Demo mode'}</strong>
          <span>{user.role || 'No live session'} - {user.country || 'Local workspace'}</span>
        </div>
        <div className="doc-list compact">
          {verificationItems.map(item => (
            <button
              type="button"
              key={item}
              onClick={() => {
                saveLocal('verification_reviews', { item, user: user.email || email, openedAt: new Date().toISOString() });
                notify(`${item} verification opened`);
              }}
            >
              {item}
            </button>
          ))}
        </div>
      </Panel>
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
        {action ? <button className="text-button" type="button" onClick={onAction}>{action}</button> : null}
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
      <input type={type} value={value ?? ''} onChange={event => onChange(event.target.value)} />
    </label>
  );
}

function TextArea({ label, value, onChange }) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea value={value ?? ''} onChange={event => onChange(event.target.value)} />
    </label>
  );
}

function Select({ label, value, onChange, options, emptyLabel }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={event => onChange(event.target.value)}>
        {options.map(option => (
          <option key={option || 'empty'} value={option}>{option || emptyLabel || 'All'}</option>
        ))}
      </select>
    </label>
  );
}

export default App;
