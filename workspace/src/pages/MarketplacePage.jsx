import { useState, useMemo } from 'react';
import { Filter, Search, Truck, Plus } from 'lucide-react';
import Select from '../components/Select.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import EmptyState from '../components/EmptyState.jsx';
import AsyncState from '../components/AsyncState.jsx';
import { normalizeTruck, ratingSummary, vehicleTypes, navigate } from '../utils/helpers.js';
import { useTrucks } from '../queries/commercial.js';

export default function MarketplacePage({ route }) {
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [verified, setVerified] = useState(true);
  const [sort, setSort] = useState('best');
  const truckParams = useMemo(() => ({ type, verified, isAvailable: true, limit: 50 }), [type, verified]);
  const {
    data: trucks = [],
    error: trucksError,
    isError: trucksFailed,
    isFetching: trucksRefreshing,
    isPending: trucksPending,
    refetch: retryTrucks
  } = useTrucks(truckParams);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return trucks
      .filter((truck) => {
        const haystack = [
          truck.name,
          truck.type,
          truck.owner,
          truck.company,
          truck.plate,
          truck.price,
          ...(truck.routes || []),
          ...(truck.features || [])
        ]
          .join(' ')
          .toLowerCase();
        return (!type || truck.type === type) && (!verified || truck.verified) && haystack.includes(q);
      })
      .sort((a, b) => {
        if (sort === 'price') return (a.pricePerKm || 999) - (b.pricePerKm || 999);
        if (sort === 'rating') return b.ratingCount - a.ratingCount || b.rating - a.rating;
        if (sort === 'trips') return b.trips - a.trips;
        return b.routeFit - a.routeFit;
      });
  }, [trucks, search, type, verified, sort]);

  const selectedTruckKey = useMemo(() => new URLSearchParams(route.split('?')[1] || '').get('truck'), [route]);
  const selectedBookingKey = useMemo(() => new URLSearchParams(route.split('?')[1] || '').get('booking'), [route]);
  const selectedTruck = useMemo(() => {
    if (!selectedTruckKey) return null;
    return trucks
      .map(normalizeTruck)
      .find((truck) => [truck.id, truck.plate].some((value) => String(value) === selectedTruckKey));
  }, [selectedTruckKey, trucks]);

  return (
    <section className="market-layout">
      <aside className="filter-panel">
        <div className="filter-heading">
          <Filter size={18} />
          <strong>Refine fleet</strong>
        </div>
        <label className="search-field">
          <Search size={18} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search route, owner, plate"
          />
        </label>
        <Select
          label="Vehicle type"
          value={type}
          onChange={setType}
          options={['', ...vehicleTypes]}
          emptyLabel="All vehicles"
        />
        <Select label="Sort" value={sort} onChange={setSort} options={['best', 'price', 'rating', 'trips']} />
        <label className="toggle-row">
          <input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} />
          <span />
          <strong>Verified only</strong>
        </label>
      </aside>

      <div className="stack">
        {selectedBookingKey ? (
          <section className="truck-profile-panel">
            <div>
              <StatusBadge tone="warn">Bid Review</StatusBadge>
              <h2>Carrier options for {selectedBookingKey}</h2>
              <p>Compare verified trucks, rates, route fit, and response time before requesting a carrier.</p>
            </div>
            <div className="button-row">
              <button className="primary" type="button" onClick={() => navigate('/app/book')}>
                Create Follow-up Request
              </button>
              <button className="ghost" type="button" onClick={() => navigate('/app/shipper')}>
                Back to Shipments
              </button>
            </div>
          </section>
        ) : null}
        {selectedTruck ? (
          <section className="truck-profile-panel">
            <div>
              <StatusBadge tone={selectedTruck.verified ? 'success' : 'warn'}>
                {selectedTruck.verified ? 'Verified' : 'Pending'}
              </StatusBadge>
              <h2>{selectedTruck.name}</h2>
              <p>
                {selectedTruck.type} by {selectedTruck.owner}
              </p>
            </div>
            <div className="facts-grid">
              <span>Plate</span>
              <strong>{selectedTruck.plate}</strong>
              <span>Capacity</span>
              <strong>{selectedTruck.capacity}</strong>
              <span>Rate</span>
              <strong>{selectedTruck.price}</strong>
              <span>Rating</span>
              <strong>{ratingSummary(selectedTruck)}</strong>
            </div>
            <div className="vehicle-photo-strip">
              {selectedTruck.photos.length ? (
                selectedTruck.photos
                  .slice(0, 3)
                  .map((photo) => <img src={photo} alt={`${selectedTruck.name} vehicle`} key={photo} loading="lazy" />)
              ) : (
                <span>Vehicle photos will appear after the owner uploads them.</span>
              )}
            </div>
            <div className="button-row">
              <button
                className="primary"
                type="button"
                onClick={() => navigate(`/app/book?truck=${encodeURIComponent(selectedTruck.id)}`)}
              >
                Request Truck
              </button>
              <button className="ghost" type="button" onClick={() => navigate('/app/marketplace')}>
                Close
              </button>
            </div>
          </section>
        ) : null}
        <div className="result-bar">
          <strong>{trucksPending ? 'Loading live fleet...' : `${filtered.length} trucks found`}</strong>
          {trucksRefreshing && !trucksPending ? (
            <span className="refresh-status" role="status">
              Updating results...
            </span>
          ) : null}
          <button className="ghost icon-label" type="button" onClick={() => navigate('/app/book')}>
            <Plus size={18} />
            <span>Create Request</span>
          </button>
        </div>
        {trucksFailed ? (
          <AsyncState
            title={trucks.length ? 'Live fleet refresh failed' : 'Live fleet unavailable'}
            detail={
              trucks.length
                ? 'Showing the last loaded results. Retry to check current availability.'
                : trucksError?.message || 'We could not load verified, available vehicles.'
            }
            onRetry={() => retryTrucks()}
          />
        ) : null}
        <div className="cards-grid truck-grid">
          {filtered.map((truck) => (
            <article className="truck-card" key={truck.id}>
              <div className={`truck-media ${truck.photo ? '' : 'is-empty'}`}>
                {truck.photo ? (
                  <img
                    src={truck.photo}
                    alt={`${truck.name} ${truck.plate}`}
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                      event.currentTarget.parentElement.classList.add('is-empty');
                    }}
                  />
                ) : null}
                <div className="truck-media-fallback">
                  <Truck size={28} />
                  <span>{truck.type}</span>
                </div>
              </div>
              <div className="truck-head">
                <StatusBadge tone={truck.verified ? 'success' : 'warn'}>
                  {truck.verified ? 'Verified' : 'Pending'}
                </StatusBadge>
                <strong>{truck.routeFit}% fit</strong>
              </div>
              <h3>{truck.name}</h3>
              <p>
                {truck.type} by {truck.owner}
              </p>
              <small>
                {truck.plate} - {truck.capacity}
              </small>
              <div className="decision-grid">
                <span>
                  Rate<strong>{truck.price}</strong>
                </span>
                <span>
                  Rating
                  <strong>{ratingSummary(truck)}</strong>
                </span>
                <span>
                  Status<strong>{truck.availability}</strong>
                </span>
              </div>
              <div className="chips">
                {truck.routes.slice(0, 2).map((route) => (
                  <span key={route}>{route}</span>
                ))}
              </div>
              <div className="trust-line">
                <span>{truck.documentStatus}</span>
                <span>{truck.responseTime}</span>
              </div>
              <div className="button-row">
                <button
                  className="primary"
                  type="button"
                  onClick={() => navigate(`/app/marketplace?truck=${encodeURIComponent(truck.id || truck.plate)}`)}
                >
                  View Profile
                </button>
                <button
                  className="ghost"
                  type="button"
                  onClick={() => navigate(`/app/book?truck=${encodeURIComponent(truck.id)}`)}
                >
                  Request
                </button>
              </div>
            </article>
          ))}
          {!trucksPending && !trucksFailed && !filtered.length ? (
            <EmptyState
              title="No trucks found"
              detail="Live marketplace data will appear here after carriers are added and verified."
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
