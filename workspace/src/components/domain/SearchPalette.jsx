import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Package, X, Truck, ArrowRight, MapPin, Sparkles } from 'lucide-react';
import { useBookings } from '../../queries/commercial';
import { useSessionBootstrap } from '../../queries/session';
import { roleForUser } from '../../utils/roles';

export default function SearchPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { data: user } = useSessionBootstrap();
  const role = roleForUser(user);
  const isOwner = role === 'owner';

  const { data: shipments = [] } = useBookings({ enabled: isOpen });

  useEffect(() => {
    if (!isOpen) return undefined;
    setQuery('');
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 50);

    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const quickCategories = isOwner
    ? ['In Transit', 'Pending Dispatch', 'Delivered', 'Medium Lorry', 'Semi-Trailer', 'Cross-border']
    : ['In Transit', 'Waiting for Dispatch', 'Delivered', 'Agricultural', 'Building Materials', 'Lorry'];

  const quickNavItems = isOwner
    ? [
        { label: 'Browse Load Board', path: '/app/bids', desc: 'Find open shipper requests' },
        { label: 'Manage Fleet Vehicles', path: '/app/vehicles', desc: 'Truck registry & capacity' },
        { label: 'My Bids & Active Trips', path: '/app/shipments', desc: 'Track your fleet jobs' },
        { label: 'Carrier Verification', path: '/app/onboarding', desc: 'Compliance & insurance' }
      ]
    : [
        { label: 'Book a Truck', path: '/app/book', desc: 'Create a new shipment request' },
        { label: 'My Shipments', path: '/app/shipments', desc: 'Track orders in transit' },
        { label: 'KYC & Verification', path: '/app/onboarding', desc: 'Shipper business documents' },
        { label: 'Freight Documents', path: '/app/documents', desc: 'Waybills, PODs & receipts' }
      ];

  const lowerQuery = query.toLowerCase().trim();

  const results =
    lowerQuery.length > 0
      ? shipments
          .filter((s) => {
            const idMatch = String(s.id || '')
              .toLowerCase()
              .includes(lowerQuery);
            const routeMatch = String(s.route || `${s.origin || ''} ${s.destination || ''}`)
              .toLowerCase()
              .includes(lowerQuery);
            const cargoMatch = String(s.cargo || '')
              .toLowerCase()
              .includes(lowerQuery);
            const vehicleMatch = String(s.vehicleType || s.vehicle || '')
              .toLowerCase()
              .includes(lowerQuery);
            const statusMatch = String(s.status || s.rawStatus || '')
              .toLowerCase()
              .includes(lowerQuery);
            return idMatch || routeMatch || cargoMatch || vehicleMatch || statusMatch;
          })
          .slice(0, 6)
      : [];

  const matchedNavItems =
    lowerQuery.length > 0
      ? quickNavItems.filter(
          (item) => item.label.toLowerCase().includes(lowerQuery) || item.desc.toLowerCase().includes(lowerQuery)
        )
      : [];

  return (
    <div
      className="search-palette-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Search bookings, routes, and cargo"
    >
      <div className="search-palette-modal">
        {/* Search Input Bar */}
        <div className="search-palette-header">
          <Search size={18} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          <input
            ref={inputRef}
            className="search-palette-input"
            placeholder={
              isOwner ? 'Search loads, routes, cargo, or truck types...' : 'Search shipments, routes, or cargo...'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <div className="search-palette-actions">
            {query && (
              <button
                type="button"
                className="search-palette-clear-btn"
                onClick={() => {
                  setQuery('');
                  inputRef.current?.focus();
                }}
                aria-label="Clear search input"
                title="Clear input"
              >
                <X size={15} />
              </button>
            )}

            <button
              type="button"
              className="search-palette-close-btn"
              onClick={onClose}
              aria-label="Close search"
              title="Close search"
            >
              <X size={15} />
              <span>Close</span>
              <kbd className="search-palette-kbd">Esc</kbd>
            </button>
          </div>
        </div>

        {/* Results or Empty State Recommendations */}
        <div className="search-palette-body">
          {lowerQuery.length === 0 ? (
            <div className="stack-md">
              <div>
                <div
                  className="eyebrow"
                  style={{ padding: 'var(--space-2) var(--space-2)', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <Sparkles size={12} color="var(--brand)" />
                  <span>Popular Search Categories</span>
                </div>
                <div
                  className="row"
                  style={{ flexWrap: 'wrap', gap: 'var(--space-2)', padding: 'var(--space-1) var(--space-2)' }}
                >
                  {quickCategories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className="search-palette-quick-tag"
                      onClick={() => {
                        setQuery(cat);
                        inputRef.current?.focus();
                      }}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="divider" style={{ margin: 'var(--space-2) 0' }} />

              <div>
                <div className="eyebrow" style={{ padding: 'var(--space-2) var(--space-2)' }}>
                  Quick Navigation
                </div>
                <div className="stack-xs">
                  {quickNavItems.map((item) => (
                    <button
                      key={item.path}
                      type="button"
                      className="search-result-item"
                      onClick={() => {
                        navigate(item.path);
                        onClose();
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{item.label}</div>
                        <div className="text-secondary" style={{ fontSize: 'var(--text-xs)' }}>
                          {item.desc}
                        </div>
                      </div>
                      <ArrowRight size={14} color="var(--text-muted)" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="stack-sm">
              {matchedNavItems.length > 0 && (
                <div>
                  <div className="eyebrow" style={{ padding: 'var(--space-2) var(--space-2)' }}>
                    Pages & Actions
                  </div>
                  {matchedNavItems.map((item) => (
                    <button
                      key={item.path}
                      type="button"
                      className="search-result-item"
                      onClick={() => {
                        navigate(item.path);
                        onClose();
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{item.label}</div>
                        <div className="text-secondary" style={{ fontSize: 'var(--text-xs)' }}>
                          {item.desc}
                        </div>
                      </div>
                      <ArrowRight size={14} color="var(--brand)" />
                    </button>
                  ))}
                  <div className="divider" style={{ margin: 'var(--space-2) 0' }} />
                </div>
              )}

              {results.length > 0 ? (
                <div>
                  <div className="eyebrow" style={{ padding: 'var(--space-2) var(--space-2)' }}>
                    Shipments ({results.length})
                  </div>
                  {results.map((shipment) => (
                    <button
                      key={shipment.id}
                      type="button"
                      className="search-result-item"
                      onClick={() => {
                        navigate(`/app/shipments/${shipment.id}`);
                        onClose();
                      }}
                    >
                      <div className="row" style={{ gap: 'var(--space-3)' }}>
                        <div
                          className="avatar avatar-sm"
                          style={{
                            background: isOwner ? 'var(--brand-surface)' : 'var(--brand-soft)',
                            color: 'var(--brand)',
                            flexShrink: 0
                          }}
                        >
                          {isOwner ? <Truck size={15} /> : <Package size={15} />}
                        </div>
                        <div>
                          <div className="row" style={{ gap: 'var(--space-2)' }}>
                            <span style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 'var(--text-sm)' }}>
                              {shipment.id.substring(0, 10)}
                            </span>
                            {shipment.vehicleType && (
                              <span className="badge badge-default" style={{ fontSize: '10px' }}>
                                {shipment.vehicleType}
                              </span>
                            )}
                          </div>
                          <div
                            className="text-secondary row"
                            style={{ fontSize: 'var(--text-xs)', gap: 4, marginTop: 2 }}
                          >
                            <MapPin size={11} color="var(--brand)" />
                            <span>{shipment.route || `${shipment.origin} → ${shipment.destination}`}</span>
                            {shipment.cargo && <span style={{ color: 'var(--text-muted)' }}>• {shipment.cargo}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="badge badge-default" style={{ flexShrink: 0 }}>
                        {shipment.status || shipment.rawStatus}
                      </div>
                    </button>
                  ))}
                </div>
              ) : matchedNavItems.length === 0 ? (
                <div style={{ padding: 'var(--space-8)', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <Search size={28} style={{ margin: '0 auto var(--space-2)', opacity: 0.4 }} />
                  <div>No results found for &ldquo;{query}&rdquo;</div>
                  <div style={{ fontSize: 'var(--text-xs)', marginTop: 'var(--space-1)' }}>
                    Try searching for a route, cargo name, or category like &ldquo;Lorry&rdquo;
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
