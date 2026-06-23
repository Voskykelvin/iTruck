import React, { useEffect, useRef, useState } from 'react';
import { Map, Search, Truck } from 'lucide-react';

export default function GlobalSearch({ shipments = [], trucks = [], onClose, onNavigate }) {
  const [q, setQ] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const query = q.toLowerCase().trim();

  const shipmentResults = query
    ? shipments.filter((s) => [s.id, s.route, s.cargo, s.status].join(' ').toLowerCase().includes(query)).slice(0, 5)
    : [];

  const truckResults = query
    ? trucks.filter((t) => [t.name, t.plate, t.type, t.owner].join(' ').toLowerCase().includes(query)).slice(0, 5)
    : [];

  const hasResults = shipmentResults.length + truckResults.length > 0;

  return (
    <div
      className="global-search-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="global-search-box">
        <div className="global-search-input-row">
          <Search size={18} />
          <input
            ref={inputRef}
            className="global-search-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search bookings, trucks, messages..."
            onKeyDown={(e) => e.key === 'Escape' && onClose()}
          />
          <button className="global-search-esc" type="button" onClick={onClose}>
            ESC
          </button>
        </div>
        <div className="global-search-results">
          {!query && <div className="global-search-empty">Type to search bookings, trucks, and messages</div>}
          {query && !hasResults && <div className="global-search-empty">No results for &ldquo;{q}&rdquo;</div>}
          {shipmentResults.length > 0 && (
            <div className="global-search-section">
              <div className="global-search-section-label">Bookings</div>
              {shipmentResults.map((s) => (
                <button
                  key={s.id}
                  className="global-search-result"
                  type="button"
                  onClick={() => {
                    onNavigate(`/app/tracking?shipment=${s.id}`);
                    onClose();
                  }}
                >
                  <Map size={16} />
                  <span>
                    <span className="global-search-result-title">{s.id}</span>
                    <span className="global-search-result-sub">
                      {s.route} · {s.status}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {truckResults.length > 0 && (
            <div className="global-search-section">
              <div className="global-search-section-label">Trucks</div>
              {truckResults.map((t) => (
                <button
                  key={t.id}
                  className="global-search-result"
                  type="button"
                  onClick={() => {
                    onNavigate(`/app/marketplace?truck=${encodeURIComponent(t.id || t.plate)}`);
                    onClose();
                  }}
                >
                  <Truck size={16} />
                  <span>
                    <span className="global-search-result-title">
                      {t.plate} – {t.name}
                    </span>
                    <span className="global-search-result-sub">
                      {t.type} · {t.availability}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="global-search-hint">
          <span>
            <kbd>↵</kbd> to open
          </span>
          <span>
            <kbd>ESC</kbd> to close
          </span>
          <span>
            <kbd>⌘K</kbd> to reopen
          </span>
        </div>
      </div>
    </div>
  );
}
