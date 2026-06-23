import { AlertTriangle } from 'lucide-react';
import { navigate } from '../utils/helpers.js';

export default function DocumentExpiryBanner({ user }) {
  const docs = user?.documents || [];
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
  const expiring = docs.filter((doc) => {
    if (doc.status === 'expired') return true;
    if (doc.expiresAt) {
      return new Date(doc.expiresAt).getTime() - Date.now() < THIRTY_DAYS;
    }
    return false;
  });

  if (!expiring.length) return null;

  return (
    <div className="expiry-banner">
      <div className="expiry-banner-head">
        <AlertTriangle size={18} />
        <strong>
          {expiring.length} document{expiring.length === 1 ? '' : 's'} expiring or expired
        </strong>
      </div>
      <div className="expiry-items">
        {expiring.map((doc) => (
          <span key={doc.type} className="expiry-chip">
            <AlertTriangle size={10} />
            {doc.type.replace(/-/g, ' ')} {doc.status === 'expired' ? '(expired)' : '(expiring soon)'}
          </span>
        ))}
      </div>
      <button
        className="ghost"
        type="button"
        style={{ justifySelf: 'start', minHeight: 34, padding: '0 12px', fontSize: 13 }}
        onClick={() => navigate('/app/onboarding')}
      >
        Renew documents →
      </button>
    </div>
  );
}
