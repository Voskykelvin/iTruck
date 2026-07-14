import { NavLink } from 'react-router-dom';
import { useSessionBootstrap } from '../../queries/session';
import { roleForUser } from '../../utils/roles';
import { LayoutDashboard, Truck, PackageSearch, Briefcase, FileCheck } from 'lucide-react';

export default function MobileNav() {
  const { data: user } = useSessionBootstrap();
  const role = roleForUser(user);

  const items =
    role === 'owner'
      ? [
          { label: 'Home', path: '/app/owner', icon: LayoutDashboard },
          { label: 'Fleet', path: '/app/vehicles', icon: Truck },
          { label: 'Market', path: '/app/marketplace', icon: PackageSearch },
          { label: 'Bids', path: '/app/bids', icon: FileCheck }
        ]
      : role === 'admin'
        ? [
            { label: 'Home', path: '/app/admin', icon: LayoutDashboard },
            { label: 'Bookings', path: '/app/shipments', icon: Briefcase },
            { label: 'Market', path: '/app/marketplace', icon: PackageSearch }
          ]
        : [
            { label: 'Home', path: '/app/shipper', icon: LayoutDashboard },
            { label: 'Book', path: '/app/book', icon: Truck },
            { label: 'Shipments', path: '/app/shipments', icon: Briefcase }
          ];

  return (
    <nav
      style={{
        display:
          'none' /* Hidden on desktop, toggled via media query in layouts.css if we wanted, but we'll inline a class or style block */
      }}
      className="mobile-nav"
    >
      <style>{`
        .mobile-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          height: var(--mobile-nav-height);
          background: var(--surface-glass);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-top: 1px solid var(--border);
          display: none;
          z-index: var(--z-sticky);
          padding-bottom: env(safe-area-inset-bottom);
        }
        @media (max-width: 768px) {
          .mobile-nav { display: flex; }
        }
        .mobile-nav-item {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          color: var(--text-muted);
          font-size: 10px;
          font-weight: 600;
          position: relative;
        }
        .mobile-nav-item.active {
          color: var(--brand);
        }
        .mobile-nav-item.active::after {
          content: '';
          position: absolute;
          top: 0;
          width: 32px;
          height: 3px;
          background: var(--brand);
          border-radius: 0 0 3px 3px;
        }
      `}</style>

      {items.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => `mobile-nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={20} style={{ marginBottom: 2 }} />
            <span>{item.label}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
