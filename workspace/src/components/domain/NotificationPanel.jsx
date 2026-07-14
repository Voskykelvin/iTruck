import { X, Bell, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useNotifications, useMarkAllNotificationsRead } from '../../queries/notifications';
import { normalizeNotificationRecord } from '../../utils/helpers';
import EmptyState from '../ui/EmptyState';
import Skeleton from '../ui/Skeleton';

export default function NotificationPanel({ isOpen, onClose }) {
  const navigate = useNavigate();
  const { data: rawNotifications = [], isLoading } = useNotifications();
  const markAllRead = useMarkAllNotificationsRead();

  const notifications = rawNotifications.map(normalizeNotificationRecord);
  const unreadCount = notifications.filter((n) => !n.read).length;

  if (!isOpen) return null;

  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ justifyContent: 'flex-end', padding: 0 }}
    >
      <div
        className="glass-panel animate-slide-in-right"
        style={{
          width: '100%',
          maxWidth: 400,
          height: '100%',
          borderRadius: 0,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--surface)'
        }}
      >
        <div className="row-between" style={{ padding: 'var(--space-5)', borderBottom: '1px solid var(--border)' }}>
          <div className="row">
            <h2 style={{ fontSize: 'var(--text-lg)', margin: 0 }}>Notifications</h2>
            {unreadCount > 0 && <div className="badge badge-warning">{unreadCount} new</div>}
          </div>
          <button onClick={onClose} className="btn btn-ghost" style={{ padding: 4, height: 'auto' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-3)' }}>
          {isLoading ? (
            <div className="stack">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} style={{ height: 80 }} />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <EmptyState icon={Bell} title="All caught up" description="You have no new notifications." />
          ) : (
            <div className="stack-sm">
              {notifications.map((note) => (
                <div
                  key={note.id}
                  onClick={() => {
                    if (note.link) {
                      navigate(note.link);
                      onClose();
                    }
                  }}
                  style={{
                    padding: 'var(--space-3)',
                    background: note.read ? 'transparent' : 'var(--brand-soft)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: note.link ? 'pointer' : 'default',
                    border: '1px solid',
                    borderColor: note.read ? 'transparent' : 'var(--brand-border)',
                    transition: 'background var(--duration-fast)'
                  }}
                  onMouseEnter={(e) => {
                    if (note.link) e.currentTarget.style.background = 'var(--surface-2)';
                  }}
                  onMouseLeave={(e) => {
                    if (note.link) e.currentTarget.style.background = note.read ? 'transparent' : 'var(--brand-soft)';
                  }}
                >
                  <div className="row-between" style={{ alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 'var(--text-sm)' }}>{note.title}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                      {new Date(note.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <div
                    style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}
                  >
                    {note.message}
                  </div>
                  {note.link && (
                    <div
                      className="row text-brand"
                      style={{ fontSize: '10px', marginTop: 'var(--space-2)', fontWeight: 600 }}
                    >
                      VIEW DETAILS <ExternalLink size={10} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {unreadCount > 0 && (
          <div style={{ padding: 'var(--space-4)', borderTop: '1px solid var(--border)' }}>
            <button
              className="btn btn-secondary"
              style={{ width: '100%' }}
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
            >
              Mark all as read
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
