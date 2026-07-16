import { NavLink } from 'react-router-dom';
import { useSessionBootstrap } from '../../queries/session';
import { roleForUser } from '../../utils/roles';
import BrandHomeLink from '../ui/BrandHomeLink';
import {
  LayoutDashboard,
  Truck,
  PackageSearch,
  FileText,
  Wallet,
  MessageSquare,
  Briefcase,
  Users,
  FileCheck,
  ShieldCheck,
  UserRound,
  Search,
  Map,
  X
} from 'lucide-react';

const icons = {
  LayoutDashboard,
  Truck,
  PackageSearch,
  FileText,
  Wallet,
  MessageSquare,
  Briefcase,
  Users,
  FileCheck,
  ShieldCheck,
  UserRound,
  Search,
  Map
};

export default function Sidebar({ isOpen, onClose }) {
  const { data: user } = useSessionBootstrap();
  const role = roleForUser(user);

  // Minimal static nav mapping until we fully rebuild navForUser logic
  const navItems =
    role === 'owner'
      ? [
          { label: 'Fleet Overview', path: '/app/owner', icon: 'LayoutDashboard' },
          { label: 'Verification', path: '/app/onboarding', icon: 'ShieldCheck' },
          { label: 'Vehicles', path: '/app/vehicles', icon: 'Truck' },
          { label: 'Load Board', path: '/app/bids', icon: 'Search' },
          { label: 'Jobs', path: '/app/shipments', icon: 'Map' }
        ]
      : role === 'admin'
        ? [{ label: 'Operations', path: '/app/admin', icon: 'LayoutDashboard' }]
        : role === 'driver'
          ? [{ label: 'My Jobs', path: '/app/shipments', icon: 'Map' }]
          : [
              { label: 'Dashboard', path: '/app/shipper', icon: 'LayoutDashboard' },
              { label: 'Book Truck', path: '/app/book', icon: 'Truck' },
              { label: 'My Shipments', path: '/app/shipments', icon: 'Briefcase' }
            ];

  const sharedItems = [
    { label: 'Documents', path: '/app/documents', icon: 'FileText' },
    ...(role === 'driver' ? [] : [{ label: 'Payments', path: '/app/payments', icon: 'Wallet' }]),
    { label: 'Messages', path: '/app/messages', icon: 'MessageSquare' }
  ];

  if (!isOpen) return null;

  return (
    <aside className="sidebar-wrapper" id="app-sidebar" aria-label="Workspace navigation">
      <div className="sidebar-header">
        <BrandHomeLink compact />
        <button
          className="btn btn-ghost sidebar-close"
          type="button"
          onClick={onClose}
          aria-label="Close navigation menu"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="sidebar-nav">
        <div className="eyebrow" style={{ padding: 'var(--space-2) var(--space-3)' }}>
          Menu
        </div>

        {navItems.map((item) => {
          const Icon = icons[item.icon];
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `row ${isActive ? 'active' : ''}`}
              style={({ isActive }) => ({
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-sm)',
                color: isActive ? 'var(--brand)' : 'var(--text-secondary)',
                background: isActive ? 'var(--brand-soft)' : 'transparent',
                fontWeight: isActive ? 600 : 500
              })}
              onClick={onClose}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}

        <div className="eyebrow" style={{ padding: 'var(--space-4) var(--space-3) var(--space-2)' }}>
          Shared
        </div>

        {sharedItems.map((item) => {
          const Icon = icons[item.icon];
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `row ${isActive ? 'active' : ''}`}
              style={({ isActive }) => ({
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-sm)',
                color: isActive ? 'var(--brand)' : 'var(--text-secondary)',
                background: isActive ? 'var(--brand-soft)' : 'transparent',
                fontWeight: isActive ? 600 : 500
              })}
              onClick={onClose}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <NavLink
          to="/app/profile"
          className="row"
          style={{
            padding: 'var(--space-3)',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface)',
            border: '1px solid var(--border)'
          }}
          onClick={onClose}
        >
          <div className="avatar avatar-sm">{user?.firstName?.[0] || 'U'}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="truncate" style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--ink)' }}>
              {user?.firstName ? `${user.firstName} ${user.lastName}` : 'User'}
            </div>
            <div className="truncate" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
              {role === 'owner' ? 'Fleet Owner' : role === 'admin' ? 'Admin' : 'Shipper'}
            </div>
          </div>
        </NavLink>
      </div>
    </aside>
  );
}
