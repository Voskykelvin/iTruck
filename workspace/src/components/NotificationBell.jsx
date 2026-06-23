import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';

export default function NotificationBell({ notifications, onMarkAllRead, onNavigate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function relativeTime(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
  }

  return (
    <div className="notif-bell-wrap" ref={ref}>
      <button className="notif-bell-btn" type="button" onClick={() => setOpen((o) => !o)} aria-label="Notifications">
        <Bell size={18} />
        {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
      </button>
      {open && (
        <div className="notif-dropdown">
          <div className="notif-header">
            <strong>Notifications</strong>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  onMarkAllRead();
                  setOpen(false);
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="notif-list">
            {notifications.length === 0 ? (
              <div className="notif-empty">No notifications yet</div>
            ) : (
              notifications.slice(0, 10).map((n) => (
                <button
                  key={n.id}
                  className={`notif-item ${n.read ? '' : 'unread'}`}
                  type="button"
                  onClick={() => {
                    if (n.link) onNavigate(n.link);
                    setOpen(false);
                  }}
                >
                  <span className={`notif-dot ${n.read ? 'read' : ''}`} />
                  <span>
                    <span className="notif-item-title">{n.title}</span>
                    <span className="notif-item-time">{relativeTime(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
