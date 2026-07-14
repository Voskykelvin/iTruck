import { useEffect, useState } from 'react';
import { Menu, Bell, Search, Moon, Sun } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import NotificationPanel from '../domain/NotificationPanel';
import SearchPalette from '../domain/SearchPalette';
import { useSessionBootstrap } from '../../queries/session';
import { roleForUser } from '../../utils/roles';
import BrandHomeLink from '../ui/BrandHomeLink';
import NetworkStatus from '../ui/NetworkStatus';

export default function TopBar({ onToggleSidebar }) {
  const { data: user } = useSessionBootstrap();
  const role = roleForUser(user);
  const navigate = useNavigate();
  const [theme, setTheme] = useState(document.documentElement.getAttribute('data-theme') || 'light');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('itruck_theme', newTheme);
  };

  useEffect(() => {
    const saved = localStorage.getItem('itruck_theme');
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    }

    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <>
      <header className="topbar-wrapper">
        <div className="row">
          <button
            onClick={onToggleSidebar}
            className="btn btn-ghost"
            style={{ padding: '0 var(--space-2)' }}
            aria-label="Toggle menu"
          >
            <Menu size={20} />
          </button>

          <BrandHomeLink compact className="topbar-mobile-brand" />

          {/* Command Palette Trigger */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="row topbar-search"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              color: 'var(--text-muted)',
              fontSize: 'var(--text-sm)',
              width: '240px',
              cursor: 'text'
            }}
          >
            <Search size={14} />
            <span style={{ flex: 1, textAlign: 'left' }}>Search bookings...</span>
            <div className="badge badge-default" style={{ fontSize: '10px' }}>
              ⌘K
            </div>
          </button>
        </div>

        <div className="row topbar-actions">
          <NetworkStatus className="topbar-network-status" />

          <button
            onClick={toggleTheme}
            className="btn btn-ghost"
            style={{ padding: '0 var(--space-2)', borderRadius: 'var(--radius-full)' }}
            aria-label="Toggle dark mode"
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setIsNotifOpen(!isNotifOpen)}
              className="btn btn-ghost"
              style={{ padding: '0 var(--space-2)', borderRadius: 'var(--radius-full)' }}
              aria-label="Notifications"
            >
              <Bell size={18} />
              <span
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 8,
                  height: 8,
                  background: 'var(--danger)',
                  borderRadius: '50%',
                  border: '2px solid var(--surface-glass)'
                }}
              />
            </button>

            <NotificationPanel isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} />
          </div>

          <div className="divider topbar-divider" style={{ width: 1, height: 24, margin: '0 var(--space-2)' }} />

          {role !== 'driver' && (
            <button
              onClick={() => navigate(role === 'owner' ? '/app/bids' : '/app/book')}
              className="btn btn-primary btn-sm topbar-primary-action"
            >
              {role === 'owner' ? 'Find Work' : 'New Booking'}
            </button>
          )}
        </div>
      </header>

      <SearchPalette isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </>
  );
}
