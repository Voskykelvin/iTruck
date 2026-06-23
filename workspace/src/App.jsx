import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Search, Navigation, BarChart3, Plus, Menu } from 'lucide-react';
import io from 'socket.io-client';

import { api, clearSession, currentUser } from './api.js';
import { demoFleet, demoShipments } from './data.js';

// Components
import ServiceWorkerUpdateToast from './components/ServiceWorkerUpdateToast.jsx';
import DarkModeToggle from './components/DarkModeToggle.jsx';
import NotificationBell from './components/NotificationBell.jsx';
import OnboardingBanner from './components/OnboardingBanner.jsx';
import DocumentExpiryBanner from './components/DocumentExpiryBanner.jsx';
import ProfileCompletenessScore from './components/ProfileCompletenessScore.jsx';

// Modals
import GlobalSearch from './components/modals/GlobalSearch.jsx';

// Pages
import LegalPage from './components/LegalPage.jsx';
import ShipperPage from './pages/ShipperPage.jsx';
import BookingPage from './pages/BookingPage.jsx';
import MarketplacePage from './pages/MarketplacePage.jsx';
import TrackingPage from './pages/TrackingPage.jsx';
import OwnerPage from './pages/OwnerPage.jsx';
import OnboardingPage from './pages/OnboardingPage.jsx';
import BidsPage from './pages/BidsPage.jsx';
import DocumentsPage from './pages/DocumentsPage.jsx';
import PaymentsPage from './pages/PaymentsPage.jsx';
import MessagesPage from './pages/MessagesPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import ProfilePage from './pages/ProfilePage.jsx';

// Helpers
import {
  routeFromLocation,
  roleForUser,
  navForUser,
  normalizeNotificationRecord,
  normalizeBookingShipment,
  normalizeTruck,
  notificationId,
  titleFromSlug,
  statusLabel,
  bookingRef,
  bookingRoute,
  navigate,
  pageTitle
} from './utils/helpers.js';

import { dashboardPathForRole, roleName, routeAllowedForUser } from './utils/roles.js';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const workspaceFleet = DEMO_MODE ? demoFleet : [];
const workspaceShipments = DEMO_MODE ? demoShipments : [];

function AppShell() {
  const [route, setRoute] = useState(routeFromLocation());
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [user, setUser] = useState(currentUser());
  const activeRole = roleForUser(user);
  const signedIn = Boolean(user?.email);
  const visibleNavItems = useMemo(() => (signedIn ? navForUser(user) : []), [signedIn, user]);
  const toastTimeoutRef = useRef(null);
  const socketRef = useRef(null);

  // Dark mode
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem('itruck_dark');
    if (stored !== null) return stored === '1';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : '');
    localStorage.setItem('itruck_dark', dark ? '1' : '0');
  }, [dark]);

  // Notifications
  const [notifications, setNotifications] = useState(() => {
    const seed = [
      {
        id: 'n1',
        title: 'New carrier bid on ITK-001',
        read: false,
        createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
        link: '/app/bids'
      },
      {
        id: 'n2',
        title: 'Document "Insurance" approved',
        read: false,
        createdAt: new Date(Date.now() - 30 * 60000).toISOString(),
        link: '/app/documents'
      },
      {
        id: 'n3',
        title: 'Shipment ITK-002 picked up',
        read: true,
        createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
        link: '/app/tracking'
      }
    ];
    return DEMO_MODE ? seed : [];
  });

  const addNotification = useCallback((record) => {
    const note = normalizeNotificationRecord({ ...record, read: record?.read ?? false });
    setNotifications((current) => {
      if (current.some((item) => item.id === note.id)) {
        return current.map((item) => (item.id === note.id ? { ...item, ...note } : item));
      }
      return [note, ...current].slice(0, 30);
    });
  }, []);

  const loadNotifications = useCallback(async () => {
    if (!signedIn) {
      setNotifications([]);
      return;
    }

    try {
      const data = await api.listNotifications({ limit: 30 });
      if (Array.isArray(data.notifications)) {
        setNotifications(data.notifications.map(normalizeNotificationRecord));
      }
    } catch (_err) {
      // Socket events and visible toasts still cover live updates if the index is unavailable.
    }
  }, [signedIn]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  function markAllRead() {
    setNotifications((ns) => ns.map((n) => ({ ...n, read: true })));
    api.markAllNotificationsRead().catch(() => {});
  }

  // Global search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchShipments, setSearchShipments] = useState(workspaceShipments);
  const [searchTrucks, setSearchTrucks] = useState(workspaceFleet);

  useEffect(() => {
    api
      .listBookings()
      .then((d) => Array.isArray(d.bookings) && setSearchShipments(d.bookings.map(normalizeBookingShipment)))
      .catch(() => {});
    api
      .listTrucks()
      .then((d) => Array.isArray(d.trucks) && setSearchTrucks(d.trucks.map(normalizeTruck)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!signedIn) return undefined;

    const socket = io(window.location.origin, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });
    socketRef.current = socket;

    const addDocumentNotification = (payload = {}) =>
      !payload.silent &&
      addNotification({
        id: payload.id || notificationId('document'),
        type: 'document.updated',
        title: payload.title || `${titleFromSlug(payload.documentType)} ${statusLabel(payload.status || 'updated')}`,
        message: payload.message || 'Document review status changed.',
        link: payload.link || '/app/documents',
        createdAt: payload.createdAt
      });

    socket.on('notification:new', addNotification);
    socket.on('document:updated', addDocumentNotification);
    socket.on('document-updated', addDocumentNotification);
    socket.on(
      'profile:verified',
      (payload = {}) =>
        !payload.silent &&
        addNotification({
          id: notificationId('profile'),
          type: 'profile.verified',
          title: payload.title || (payload.isVerified ? 'Profile verified' : 'Profile held for review'),
          message: payload.message || 'Your profile review status changed.',
          link: '/app/profile'
        })
    );
    socket.on(
      'truck:verified',
      (payload = {}) =>
        !payload.silent &&
        addNotification({
          id: notificationId('truck'),
          type: 'truck.verified',
          title: payload.title || (payload.isVerified ? 'Vehicle verified' : 'Vehicle held for review'),
          message: payload.message || payload.plateNumber || 'Vehicle review status changed.',
          link: '/app/vehicles'
        })
    );
    socket.on(
      'bid-created',
      (booking = {}) =>
        !booking.silent &&
        addNotification({
          id: notificationId('bid'),
          type: 'bid.created',
          title: `New carrier bid on ${bookingRef(booking)}`,
          message: bookingRoute(booking),
          link: '/app/bids'
        })
    );
    socket.on(
      'bid-accepted',
      (booking = {}) =>
        !booking.silent &&
        addNotification({
          id: notificationId('bid'),
          type: 'bid.accepted',
          title: `Bid accepted on ${bookingRef(booking)}`,
          message: bookingRoute(booking),
          link: '/app/bids'
        })
    );
    socket.on(
      'status-update',
      (booking = {}) =>
        !booking.silent &&
        addNotification({
          id: notificationId('status'),
          type: 'shipment.status',
          title: `${bookingRef(booking)} ${statusLabel(booking.status || 'updated')}`,
          message: bookingRoute(booking),
          link: '/app/tracking'
        })
    );
    socket.on(
      'delivery-confirmed',
      (booking = {}) =>
        !booking.silent &&
        addNotification({
          id: notificationId('delivery'),
          type: 'shipment.delivered',
          title: `${bookingRef(booking)} delivered`,
          message: bookingRoute(booking),
          link: '/app/tracking'
        })
    );

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [addNotification, signedIn]);

  useEffect(() => {
    if (!signedIn || !socketRef.current) return;
    searchShipments
      .map((shipment) => shipment.bookingId || shipment.id)
      .filter(Boolean)
      .forEach((bookingId) => socketRef.current?.emit('join-booking', bookingId));
  }, [searchShipments, signedIn]);

  // Cmd+K listener
  useEffect(() => {
    function handler(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen((o) => !o);
      }
      if (e.key === 'Escape') setSearchOpen(false);
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const syncRoute = () => setRoute(routeFromLocation());
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, []);

  const notify = useCallback((message) => {
    setToast(message);
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => setToast(''), 2800);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch (_) {
      clearSession();
    }
    setUser({});
    navigate('/app/profile');
    notify('Signed out');
  }, [notify]);

  useEffect(() => {
    const publicRoute = route.startsWith('/app/privacy') || route.startsWith('/app/terms');
    if (!signedIn && !route.startsWith('/app/profile') && !publicRoute) {
      navigate('/app/profile');
      return;
    }

    if (!routeAllowedForUser(route, user)) {
      const destination = dashboardPathForRole(activeRole);
      notify(`${pageTitle(route)} is not part of ${roleName(activeRole)} mode`);
      navigate(destination);
    }
  }, [activeRole, notify, route, signedIn, user]);

  useEffect(
    () => () => {
      if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    },
    []
  );

  const page = useMemo(() => {
    const props = { notify, route, user, setUser };
    if (route.startsWith('/app/privacy')) return <LegalPage type="privacy" />;
    if (route.startsWith('/app/terms')) return <LegalPage type="terms" />;
    if (!routeAllowedForUser(route, user)) {
      if (activeRole === 'admin') return <AdminPage {...props} />;
      if (activeRole === 'owner') return <OwnerPage {...props} />;
      return <ShipperPage {...props} />;
    }
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
    if (activeRole === 'owner') return <OwnerPage {...props} />;
    if (activeRole === 'driver') return <TrackingPage {...props} />;
    return <ShipperPage {...props} />;
  }, [activeRole, notify, route, signOut, user]);

  const primaryAction =
    activeRole === 'owner'
      ? { label: 'Find Work', path: '/app/bids', icon: Search }
      : activeRole === 'driver'
        ? { label: 'Assigned Jobs', path: '/app/tracking', icon: Navigation }
        : activeRole === 'admin'
          ? { label: 'Admin Queue', path: '/app/admin', icon: BarChart3 }
          : { label: 'New Load', path: '/app/book', icon: Plus };
  const PrimaryActionIcon = primaryAction.icon;

  return (
    <div className={`app-shell ${signedIn ? '' : 'signed-out'}`}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      {signedIn ? (
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
      ) : null}

      <main className="app-main" id="main-content" tabIndex="-1">
        <header className={`app-topbar ${signedIn ? '' : 'guest-topbar'}`}>
          {signedIn ? (
            <button className="icon-button" type="button" onClick={() => setMenuOpen(true)} aria-label="Open menu">
              <Menu size={20} />
            </button>
          ) : (
            <a className="brand guest-brand" href="/">
              <span>iT</span> iTruck
            </a>
          )}
          <div className={signedIn ? '' : 'guest-topbar-copy'}>
            <p className="eyebrow">{signedIn ? 'Operational Workspace' : 'Secure Access'}</p>
            <h1>{signedIn ? pageTitle(route) : 'iTruck Workspace'}</h1>
          </div>
          <div className="topbar-actions topbar-icon-group">
            <button className="ghost icon-label" type="button" onClick={() => setSearchOpen(true)} title="Search (⌘K)">
              <Search size={18} />
              <span>Search</span>
            </button>
            <DarkModeToggle dark={dark} onToggle={() => setDark((d) => !d)} />
            <NotificationBell notifications={notifications} onMarkAllRead={markAllRead} onNavigate={navigate} />
            <button className="primary icon-label" type="button" onClick={() => navigate(primaryAction.path)}>
              <PrimaryActionIcon size={18} />
              <span>{primaryAction.label}</span>
            </button>
          </div>
        </header>

        {/* Onboarding banner */}
        {user?.email && !['admin', 'driver'].includes(activeRole) && (
          <OnboardingBanner
            user={user}
            role={activeRole}
            fleet={searchTrucks.filter((t) => t.verified)}
            shipments={searchShipments}
          />
        )}

        {/* Document expiry banner for owners */}
        {user?.email && activeRole === 'owner' && <DocumentExpiryBanner user={user} />}

        {/* Profile completeness score on profile page */}
        {route.startsWith('/app/profile') && user?.email && <ProfileCompletenessScore user={user} role={activeRole} />}

        {page}
        <footer className="app-legal-footer">
          <button type="button" onClick={() => navigate('/app/privacy')}>
            Privacy
          </button>
          <button type="button" onClick={() => navigate('/app/terms')}>
            Terms
          </button>
          <span>© 2026 iTruck Africa</span>
        </footer>
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

      {searchOpen && (
        <GlobalSearch
          shipments={searchShipments}
          trucks={searchTrucks}
          onClose={() => setSearchOpen(false)}
          onNavigate={navigate}
        />
      )}

      {toast ? (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      ) : null}
      <ServiceWorkerUpdateToast />
    </div>
  );
}

export default AppShell;
