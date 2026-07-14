import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Package } from 'lucide-react';
import { useBookings } from '../../queries/commercial';

export default function SearchPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { data: shipments = [] } = useBookings({ enabled: isOpen });

  useEffect(() => {
    if (!isOpen) return undefined;
    inputRef.current?.focus();
    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const results =
    query.length > 1
      ? shipments
          .filter(
            (s) =>
              String(s.id).toLowerCase().includes(query.toLowerCase()) ||
              String(s.route).toLowerCase().includes(query.toLowerCase()) ||
              String(s.cargo).toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, 5)
      : [];

  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ alignItems: 'flex-start', paddingTop: '10vh' }}
    >
      <div
        className="modal-content animate-slide-up"
        style={{
          maxWidth: 600,
          overflow: 'hidden',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        <div className="row" style={{ padding: 'var(--space-4)', borderBottom: '1px solid var(--border)' }}>
          <Search size={20} color="var(--text-muted)" />
          <input
            ref={inputRef}
            className="input-field"
            style={{
              border: 'none',
              background: 'transparent',
              boxShadow: 'none',
              height: 'auto',
              padding: 0,
              fontSize: 'var(--text-lg)'
            }}
            placeholder="Search shipments, routes, or cargo..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="badge badge-default" style={{ fontSize: '10px' }}>
            ESC to close
          </div>
        </div>

        {query.length > 1 && (
          <div style={{ padding: 'var(--space-2)' }}>
            {results.length > 0 ? (
              <div className="stack-sm">
                <div className="eyebrow" style={{ padding: 'var(--space-2) var(--space-4)' }}>
                  Shipments
                </div>
                {results.map((shipment) => (
                  <button
                    key={shipment.id}
                    className="row-between"
                    style={{
                      width: '100%',
                      padding: 'var(--space-3) var(--space-4)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'transparent',
                      textAlign: 'left',
                      border: 'none',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => {
                      navigate(`/app/shipments/${shipment.id}`);
                      onClose();
                    }}
                  >
                    <div className="row">
                      <div
                        className="avatar avatar-sm"
                        style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
                      >
                        <Package size={14} />
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{shipment.id}</div>
                        <div className="text-muted" style={{ fontSize: 'var(--text-sm)' }}>
                          {shipment.route}
                        </div>
                      </div>
                    </div>
                    <div className="badge badge-default">{shipment.status}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
                No results found for &ldquo;{query}&rdquo;
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
