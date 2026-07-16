import { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import MobileNav from './MobileNav';

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(() => !window.matchMedia('(max-width: 768px)').matches);
  const isMobile = () => window.matchMedia('(max-width: 768px)').matches;
  const closeMobileSidebar = () => {
    if (isMobile()) setSidebarOpen(false);
  };

  useEffect(() => {
    if (!sidebarOpen || !isMobile()) return undefined;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setSidebarOpen(false);
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [sidebarOpen]);

  return (
    <div className="app-root">
      {/* Desktop Sidebar */}
      {sidebarOpen && (
        <button
          className="sidebar-backdrop"
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar isOpen={sidebarOpen} onClose={closeMobileSidebar} />

      {/* Main Content Area */}
      <main className="main-wrapper">
        <TopBar isSidebarOpen={sidebarOpen} onToggleSidebar={() => setSidebarOpen((open) => !open)} />

        <div className="page-container">
          <Outlet />
        </div>
      </main>

      {/* Mobile Navigation */}
      <MobileNav />
    </div>
  );
}
