import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOpenBookings } from '../queries/commercial';
import { useSessionBootstrap } from '../queries/session';
import { roleForUser } from '../utils/roles';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { Search, MapPin, Truck, Box, Filter, X } from 'lucide-react';
import { money, vehicleCategoryOptions, cargoCategories } from '../utils/helpers';

export default function MarketPage() {
  const navigate = useNavigate();
  const { data: user } = useSessionBootstrap();
  const role = roleForUser(user);
  const { data: loads = [], isLoading } = useOpenBookings();

  const [search, setSearch] = useState('');
  const [selectedRouteType, setSelectedRouteType] = useState('All');
  const [selectedVehicleType, setSelectedVehicleType] = useState('All');
  const [selectedCargoCategory, setSelectedCargoCategory] = useState('All');

  const isOwner = role === 'owner';

  const filteredLoads = useMemo(() => {
    return loads.filter((load) => {
      const matchesSearch =
        !search ||
        load.origin?.toLowerCase().includes(search.toLowerCase()) ||
        load.destination?.toLowerCase().includes(search.toLowerCase()) ||
        load.cargo?.toLowerCase().includes(search.toLowerCase()) ||
        load.vehicleType?.toLowerCase().includes(search.toLowerCase());

      const matchesRoute =
        selectedRouteType === 'All' ||
        (selectedRouteType === 'Domestic' && (!load.border || load.border.toLowerCase() === 'domestic')) ||
        (selectedRouteType === 'Cross-border' && load.border && load.border.toLowerCase().includes('cross'));

      const matchesVehicle =
        selectedVehicleType === 'All' ||
        String(load.vehicleType || '').toLowerCase() === selectedVehicleType.toLowerCase();

      const matchesCargo =
        selectedCargoCategory === 'All' ||
        String(load.cargoCategory || load.cargo || '')
          .toLowerCase()
          .includes(selectedCargoCategory.toLowerCase());

      return matchesSearch && matchesRoute && matchesVehicle && matchesCargo;
    });
  }, [loads, search, selectedRouteType, selectedVehicleType, selectedCargoCategory]);

  const hasActiveFilters =
    search || selectedRouteType !== 'All' || selectedVehicleType !== 'All' || selectedCargoCategory !== 'All';

  const resetFilters = () => {
    setSearch('');
    setSelectedRouteType('All');
    setSelectedVehicleType('All');
    setSelectedCargoCategory('All');
  };

  return (
    <div className="animate-fade-in stack-lg">
      <div className="page-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 'var(--space-4)' }}>
        <div className="row-between">
          <div>
            <h1 className="page-title">{isOwner ? 'Carrier Load Board' : 'Freight Marketplace'}</h1>
            <p className="text-secondary">
              {isOwner
                ? 'Discover and place bids on verified shipper freight matching your fleet.'
                : 'Browse verified capacity and live carrier freight options.'}
            </p>
          </div>
          {isOwner && (
            <Badge variant="primary" style={{ padding: '6px 12px', fontSize: 'var(--text-xs)' }}>
              {loads.length} Open Loads Available
            </Badge>
          )}
        </div>

        {/* Search & Category Filter Bar */}
        <div className="stack-sm">
          <div className="row" style={{ gap: 'var(--space-3)' }}>
            <div className="input-group" style={{ flex: 1, margin: 0, position: 'relative' }}>
              <Search
                size={18}
                color="var(--text-muted)"
                style={{ position: 'absolute', left: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)' }}
              />
              <input
                className="input-field"
                placeholder="Search by pickup city, destination, or cargo..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: 'var(--space-10)' }}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  className="btn btn-ghost"
                  style={{
                    position: 'absolute',
                    right: 'var(--space-2)',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    padding: 4
                  }}
                  aria-label="Clear search"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters} icon={X}>
                Reset Filters
              </Button>
            )}
          </div>

          {/* Quick Filter Category Pills */}
          <div className="row" style={{ flexWrap: 'wrap', gap: 'var(--space-2)', paddingTop: 'var(--space-1)' }}>
            <div className="row" style={{ gap: 4, marginRight: 'var(--space-2)' }}>
              <Filter size={14} color="var(--text-muted)" />
              <span className="text-muted" style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
                Categories:
              </span>
            </div>

            {/* Route Type Pills */}
            {['All', 'Domestic', 'Cross-border'].map((route) => (
              <button
                key={route}
                type="button"
                className={`btn btn-sm ${selectedRouteType === route ? 'btn-primary' : 'btn-secondary'}`}
                style={{ borderRadius: 'var(--radius-full)', padding: '4px 12px', fontSize: 'var(--text-xs)' }}
                onClick={() => setSelectedRouteType(route)}
              >
                {route === 'All' ? 'All Routes' : route}
              </button>
            ))}

            <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 var(--space-1)' }} />

            {/* Vehicle Category Pills */}
            <select
              className="input-field"
              style={{
                width: 'auto',
                height: 32,
                padding: '2px 10px',
                fontSize: 'var(--text-xs)',
                borderRadius: 'var(--radius-full)'
              }}
              value={selectedVehicleType}
              onChange={(e) => setSelectedVehicleType(e.target.value)}
              aria-label="Filter by vehicle type"
            >
              <option value="All">All Vehicle Types</option>
              {vehicleCategoryOptions.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label} ({v.capacity})
                </option>
              ))}
            </select>

            {/* Cargo Category Pills */}
            <select
              className="input-field"
              style={{
                width: 'auto',
                height: 32,
                padding: '2px 10px',
                fontSize: 'var(--text-xs)',
                borderRadius: 'var(--radius-full)'
              }}
              value={selectedCargoCategory}
              onChange={(e) => setSelectedCargoCategory(e.target.value)}
              aria-label="Filter by cargo category"
            >
              <option value="All">All Cargo Categories</option>
              {cargoCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} style={{ height: 240 }} />
          ))}
        </div>
      ) : filteredLoads.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No matching loads found"
          description={
            hasActiveFilters
              ? 'No open shipments match your active filters. Try broadening your criteria.'
              : 'There are currently no open loads available on the load board.'
          }
          action={
            hasActiveFilters ? (
              <Button variant="secondary" onClick={resetFilters}>
                Clear Active Filters
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid-2">
          {filteredLoads.map((load) => (
            <Card
              key={load.id}
              className="stack-sm animate-slide-up hover-lift"
              style={{
                transition: 'transform var(--duration-fast)',
                cursor: 'pointer',
                border: '1px solid var(--border)'
              }}
              onClick={() => navigate(`/app/shipments/${load.id}`)}
            >
              <div className="row-between">
                <div className="row" style={{ gap: 'var(--space-2)' }}>
                  <Badge variant={load.border === 'Cross-border' ? 'warning' : 'info'}>
                    {load.border || 'Domestic'}
                  </Badge>
                  {load.vehicleType && (
                    <span className="badge badge-default" style={{ fontSize: '11px' }}>
                      {load.vehicleType}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--brand)' }}>
                  {money(load.budget || load.price || 0)}
                </div>
              </div>

              <div className="stack" style={{ margin: 'var(--space-3) 0' }}>
                <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                  <MapPin size={18} color="var(--brand)" style={{ marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{load.origin}</div>
                    <div className="text-secondary" style={{ fontSize: 'var(--text-xs)' }}>
                      Pickup
                    </div>
                  </div>
                </div>
                <div style={{ marginLeft: 8, width: 2, height: 14, background: 'var(--border)' }} />
                <div className="row" style={{ alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                  <MapPin size={18} color="var(--brand-mid)" style={{ marginTop: 2, flexShrink: 0 }} />
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{load.destination}</div>
                    <div className="text-secondary" style={{ fontSize: 'var(--text-xs)' }}>
                      Dropoff {load.distance ? `(${load.distance} km)` : ''}
                    </div>
                  </div>
                </div>
              </div>

              <div className="divider" style={{ margin: 'var(--space-2) 0' }} />

              <div className="row-between text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
                <div className="row" style={{ gap: 6 }}>
                  <Box size={14} color="var(--text-muted)" />
                  <span className="truncate" style={{ maxWidth: 160 }}>
                    {load.cargo || 'General Freight'}
                  </span>
                  {load.weight ? <span className="text-muted">({load.weight}t)</span> : null}
                </div>
                <div className="row" style={{ gap: 6 }}>
                  <Truck size={14} color="var(--brand)" />
                  <span style={{ fontWeight: 600, color: 'var(--brand)', fontSize: 'var(--text-xs)' }}>
                    Bid on Load →
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
