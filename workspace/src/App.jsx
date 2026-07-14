import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/layout/AppShell';

// Lazy loaded pages
const AuthPage = lazy(() => import('./pages/AuthPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const BookPage = lazy(() => import('./pages/BookPage'));
const MarketPage = lazy(() => import('./pages/MarketPage'));
const ShipmentsPage = lazy(() => import('./pages/ShipmentsPage'));
const ShipmentDetailPage = lazy(() => import('./pages/ShipmentDetailPage'));
const FleetPage = lazy(() => import('./pages/FleetPage'));
const WalletPage = lazy(() => import('./pages/WalletPage'));
const DocumentsPage = lazy(() => import('./pages/DocumentsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const MessagesPage = lazy(() => import('./pages/MessagesPage'));
const LegalPage = lazy(() => import('./pages/LegalPage'));

import { useSessionBootstrap } from './queries/session';
import { roleForUser, dashboardPathForRole } from './utils/roles';

// Placeholder Loading
const PageLoader = () => (
  <div className="overlay" style={{ position: 'absolute', background: 'var(--bg)' }}>
    <div
      className="animate-spin"
      style={{
        width: 40,
        height: 40,
        border: '3px solid var(--brand-soft)',
        borderTopColor: 'var(--brand)',
        borderRadius: '50%'
      }}
    />
  </div>
);

function ProtectedRoute({ children, allowedRoles }) {
  const { data: user, isLoading } = useSessionBootstrap();
  if (isLoading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;

  const role = roleForUser(user);
  if (allowedRoles && !allowedRoles.includes(role)) {
    return <Navigate to={dashboardPathForRole(role)} replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/register" element={<AuthPage />} />
          <Route path="/privacy" element={<LegalPage type="privacy" />} />
          <Route path="/terms" element={<LegalPage type="terms" />} />

          <Route path="/app" element={<AppShell />}>
            {/* Dashboard routes */}
            <Route index element={<Navigate to="/app/shipper" replace />} />
            <Route
              path="shipper"
              element={
                <ProtectedRoute allowedRoles={['client', 'admin']}>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="owner"
              element={
                <ProtectedRoute allowedRoles={['owner', 'admin']}>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="admin"
              element={
                <ProtectedRoute allowedRoles={['admin']}>
                  <AdminPage />
                </ProtectedRoute>
              }
            />

            {/* Core workflows */}
            <Route
              path="book"
              element={
                <ProtectedRoute allowedRoles={['client', 'admin']}>
                  <BookPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="marketplace"
              element={
                <ProtectedRoute allowedRoles={['owner', 'client', 'admin']}>
                  <MarketPage />
                </ProtectedRoute>
              }
            />

            {/* Entities */}
            <Route
              path="shipments"
              element={
                <ProtectedRoute allowedRoles={['client', 'owner', 'driver', 'admin']}>
                  <ShipmentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="shipments/:id"
              element={
                <ProtectedRoute allowedRoles={['client', 'owner', 'driver', 'admin']}>
                  <ShipmentDetailPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="bids"
              element={
                <ProtectedRoute allowedRoles={['owner', 'admin']}>
                  <MarketPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="vehicles"
              element={
                <ProtectedRoute allowedRoles={['owner', 'admin']}>
                  <FleetPage />
                </ProtectedRoute>
              }
            />

            {/* Shared */}
            <Route
              path="documents"
              element={
                <ProtectedRoute allowedRoles={['client', 'owner', 'driver', 'admin']}>
                  <DocumentsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="payments"
              element={
                <ProtectedRoute allowedRoles={['client', 'owner', 'admin']}>
                  <WalletPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="messages"
              element={
                <ProtectedRoute allowedRoles={['client', 'owner', 'driver', 'admin']}>
                  <MessagesPage />
                </ProtectedRoute>
              }
            />

            {/* Settings */}
            <Route
              path="profile"
              element={
                <ProtectedRoute allowedRoles={['client', 'owner', 'driver', 'admin']}>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="onboarding"
              element={
                <ProtectedRoute allowedRoles={['client', 'owner', 'driver', 'admin']}>
                  <OnboardingPage />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/app" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
