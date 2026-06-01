import { useCallback, useEffect, useState } from 'react';
import { Monitor, MonitorSmartphone, RefreshCw, Smartphone, Tablet, X } from 'lucide-react';
import { api } from '../api.js';

const deviceIcons = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
  unknown: MonitorSmartphone
};

function relativeTime(value) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'recently';
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

export default function SessionsManager({ notify }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.listSessions();
      setSessions(data.sessions || []);
    } catch (err) {
      notify?.(err.message || 'Unable to load sessions');
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  async function revokeSession(id) {
    setBusy(id);
    try {
      await api.revokeSession(id);
      setSessions((current) => current.filter((session) => session.id !== id));
      notify?.('Session signed out');
    } catch (err) {
      notify?.(err.message || 'Unable to revoke session');
    } finally {
      setBusy('');
    }
  }

  async function revokeOthers() {
    setBusy('all');
    try {
      await api.revokeOtherSessions();
      setSessions((current) => current.filter((session) => session.isCurrent));
      notify?.('Other sessions signed out');
    } catch (err) {
      notify?.(err.message || 'Unable to revoke sessions');
    } finally {
      setBusy('');
    }
  }

  if (loading) {
    return (
      <div className="session-empty">
        <RefreshCw size={18} />
        <span>Loading sessions...</span>
      </div>
    );
  }

  const hasOtherSessions = sessions.some((session) => !session.isCurrent);

  return (
    <div className="sessions-manager">
      {hasOtherSessions ? (
        <button className="text-button danger" type="button" disabled={busy === 'all'} onClick={revokeOthers}>
          Sign out others
        </button>
      ) : null}

      <div className="sessions-list">
        {sessions.length ? (
          sessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              busy={busy === session.id}
              onRevoke={() => revokeSession(session.id)}
            />
          ))
        ) : (
          <div className="session-empty">
            <MonitorSmartphone size={18} />
            <span>No active sessions found.</span>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionRow({ session, busy, onRevoke }) {
  const Icon = deviceIcons[session.deviceType] || deviceIcons.unknown;

  return (
    <article className={`session-row ${session.isCurrent ? 'current' : ''}`}>
      <Icon size={20} />
      <div>
        <strong>{session.deviceName || 'Unknown device'}</strong>
        <span>
          {session.ipAddress ? `${session.ipAddress} - ` : ''}
          Active {relativeTime(session.lastUsedAt)}
        </span>
      </div>
      {session.isCurrent ? (
        <span className="badge success">This device</span>
      ) : (
        <button
          className="ghost icon-button"
          type="button"
          disabled={busy}
          onClick={onRevoke}
          aria-label="Sign out session"
        >
          <X size={16} />
        </button>
      )}
    </article>
  );
}
