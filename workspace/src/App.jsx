import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Navigation,
  BarChart3,
  Plus,
  Menu,
  LayoutDashboard,
  Map,
  FileText,
  Wallet,
  MessageSquare,
  UserRound,
  ShieldCheck,
  Truck
} from 'lucide-react';
import io from 'socket.io-client';
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom';
import { QueryClientProvider, useQueryClient } from '@tanstack/react-query';

import { api, clearSession, setSession } from './api.js';
import { demoFleet, demoShipments } from './data.js';

// Components
import ServiceWorkerUpdateToast from './components/ServiceWorkerUpdateToast.jsx';
import DarkModeToggle from './components/DarkModeToggle.jsx';
import NotificationBell from './components/NotificationBell.jsx';
import OnboardingBanner from './components/OnboardingBanner.jsx';
import DocumentExpiryBanner from './components/DocumentExpiryBanner.jsx';
import ProfileCompletenessScore from './components/ProfileCompletenessScore.jsx';
import AppErrorBoundary from './components/AppErrorBoundary.jsx';
import AsyncState from './components/AsyncState.jsx';

// Modals
import GlobalSearch from './components/modals/GlobalSearch.jsx';

// Pages
const LegalPage = lazy(() => import('./components/LegalPage.jsx'));
const ShipperPage = lazy(() => import('./pages/ShipperPage.jsx'));
const BookingPage = lazy(() => import('./pages/BookingPage.jsx'));
const MarketplacePage = lazy(() => import('./pages/MarketplacePage.jsx'));
const TrackingPage = lazy(() => import('./pages/TrackingPage.jsx'));
const OwnerPage = lazy(() => import('./pages/OwnerPage.jsx'));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage.jsx'));
const BidsPage = lazy(() => import('./pages/BidsPage.jsx'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage.jsx'));
const PaymentsPage = lazy(() => import('./pages/PaymentsPage.jsx'));
const MessagesPage = lazy(() => import('./pages/MessagesPage.jsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'));
const ProfilePage = lazy(() => import('./pages/ProfilePage.jsx'));

// Helpers
import {
  roleForUser,
  navForUser,
  normalizeBookingShipment,
  normalizeTruck,
  notificationId,
  titleFromSlug,
  statusLabel,
  bookingRef,
  bookingRoute,
  navigate,
  registerNavigator,
  pageTitle
} from './utils/helpers.js';

import { dashboardPathForRole, roleName, routeAllowedForUser } from './utils/roles.js';
import { createAppQueryClient } from './queryClient.js';
import { useMarkAllNotificationsRead, useNotificationCache, useNotifications } from './queries/notifications.js';
import { sessionQueryKeys, useSessionBootstrap } from './queries/session.js';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
const workspaceFleet = DEMO_MODE ? demoFleet : [];
const workspaceShipments = DEMO_MODE ? demoShipments : [];
const navigationIcons = {
  BarChart3,
  FileText,
  LayoutDashboard,
  Map,
  MessageSquare,
  Plus,
  Search,
  ShieldCheck,
  Truck,
  UserRound,
  Wallet
};

export function AppShell() {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const queryClient = useQueryClient();
  const route = `${location.pathname}${location.search}`;
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [user, setUser] = useState({});
  const sessionQuery = useSessionBootstrap();
  const activeRole = roleForUser(user);
  const signedIn = Boolean(user?.email);
  const visibleNavItems = useMemo(() => (signedIn ? navForUser(user) : []), [signedIn, user]);
  const toastTimeoutRef = useRef(null);
  const socketRef = useRef(null);
  const publicRoute = route.startsWith('/app/privacy') || route.startsWith('/app/terms');
  const sessionIsGuest = sessionQuery.isError && sessionQuery.error?.status === 401;
  const sessionReady = signedIn || sessionIsGuest || (sessionQuery.isSuccess && !sessionQuery.data);

  useEffect(() => {
    if (sessionQuery.data) {
      setSession({ user: sessionQuery.data });
      setUser(sessionQuery.data);
      return;
    }
    if (sessionIsGuest) {
      clearSession();
      setUser({});
    }
  }, [sessionIsGuest, sessionQuery.data]);

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
  const notificationsQuery = useNotifications(user, { enabled: signedIn });
  const notifications = notificationsQuery.data || [];
  const addNotification = useNotificationCache(user);
  const markAllNotificationsRead = useMarkAllNotificationsRead(user);

  // Global search
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchShipments, setSearchShipments] = useState(workspaceShipments);
  const [searchTrucks, setSearchTrucks] = useState(workspaceFleet);

  useEffect(() => {
    if (!signedIn) {
      setSearchShipments(workspaceShipments);
      setSearchTrucks(workspaceFleet);
      return;
    }
    api
      .listBookings()
      .then((d) => Array.isArray(d.bookings) && setSearchShipments(d.bookings.map(normalizeBookingShipment)))
      .catch(() => {});
    api
      .listTrucks()
      .then((d) => Array.isArray(d.trucks) && setSearchTrucks(d.trucks.map(normalizeTruck)))
      .catch(() => {});
  }, [signedIn]);

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

  useEffect(() => registerNavigator(routerNavigate), [routerNavigate]);

  const notify = useCallback((message) => {
    setToast(message);
    if (toastTimeoutRef.current) window.clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = window.setTimeout(() => setToast(''), 2800);
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await markAllNotificationsRead.mutateAsync();
      return true;
    } catch (err) {
      notify(err.message || 'Notifications could not be marked as read');
      return false;
    }
  }, [markAllNotificationsRead, notify]);

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch (_) {
      clearSession();
    }
    queryClient.setQueryData(sessionQueryKeys.current(), null);
    setUser({});
    navigate('/app/profile');
    notify('Signed out');
  }, [notify, queryClient]);

  useEffect(() => {
    if (!sessionReady) return;
    if (!signedIn && !route.startsWith('/app/profile') && !publicRoute) {
      navigate('/app/profile');
      return;
    }

    if (!routeAllowedForUser(route, user)) {
      const destination = dashboardPathForRole(activeRole);
      notify(`${pageTitle(route)} is not part of ${roleName(activeRole)} mode`);
      navigate(destination);
    }
  }, [activeRole, notify, publicRoute, route, sessionReady, signedIn, user]);

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
  const sessionContent =
    !publicRoute && !signedIn && sessionQuery.isPending ? (
      <AsyncState title="Restoring your secure session..." detail="Confirming your account with iTruck." />
    ) : !publicRoute && !signedIn && sessionQuery.isError && !sessionIsGuest ? (
      <AsyncState
        title="Your session could not be verified"
        detail={sessionQuery.error?.message}
        onRetry={() => sessionQuery.refetch()}
      />
    ) : (
      page
    );

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
              const Icon = navigationIcons[item.icon] || Navigation;
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
            {signedIn ? (
              <>
                <NotificationBell
                  notifications={notifications}
                  loading={notificationsQuery.isPending}
                  error={notificationsQuery.error}
                  markingRead={markAllNotificationsRead.isPending}
                  onRetry={() => notificationsQuery.refetch()}
                  onMarkAllRead={markAllRead}
                  onNavigate={navigate}
                />
                <button className="primary icon-label" type="button" onClick={() => navigate(primaryAction.path)}>
                  <PrimaryActionIcon size={18} />
                  <span>{primaryAction.label}</span>
                </button>
              </>
            ) : null}
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

        <AppErrorBoundary resetKey={route}>
          <Suspense
            fallback={
              <section className="page-loading" role="status" aria-live="polite">
                Loading workspace…
              </section>
            }
          >
            {sessionContent}
          </Suspense>
        </AppErrorBoundary>
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
          const Icon = navigationIcons[item.icon] || Navigation;
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

export default function App() {
  const [queryClient] = useState(createAppQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppShell />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
