import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOpenBookings } from '../queries/commercial';
import { useSessionBootstrap } from '../queries/session';
import { roleForUser } from '../utils/roles';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import Badge from '../components/ui/Badge';
import { Search, MapPin, Truck, Box } from 'lucide-react';
import { money } from '../utils/helpers';

export default function MarketPage() {
  const navigate = useNavigate();
  const { data: user } = useSessionBootstrap();
  const role = roleForUser(user);
  const { data: loads = [], isLoading } = useOpenBookings();

  const [search, setSearch] = useState('');

  // If the user is a Shipper, they shouldn't really see the open loads board,
  // they should see trucks available to bid on their shipments, but we'll adapt.
  const isOwner = role === 'owner';

  const filteredLoads = loads.filter(
    (load) =>
      !search ||
      load.origin?.toLowerCase().includes(search.toLowerCase()) ||
      load.destination?.toLowerCase().includes(search.toLowerCase()) ||
      load.cargo?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="animate-fade-in stack-lg">
      <div className="page-header" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div className="row-between" style={{ marginBottom: 'var(--space-4)' }}>
          <div>
            <h1 className="page-title">{isOwner ? 'Load Board' : 'Marketplace'}</h1>
            <p className="text-secondary">
              {isOwner
                ? 'Find and bid on open shipments matching your fleet.'
                : 'Discover carriers for your shipments.'}
            </p>
          </div>
        </div>

        <div className="row" style={{ gap: 'var(--space-4)' }}>
          <div className="input-group" style={{ flex: 1, margin: 0, position: 'relative' }}>
            <Search
              size={20}
              color="var(--text-muted)"
              style={{ position: 'absolute', left: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)' }}
            />
            <input
              className="input-field"
              placeholder="Search by city, route, or cargo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 'var(--space-10)' }}
            />
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
          title="No loads found"
          description="We couldn't find any open shipments matching your search."
        />
      ) : (
        <div className="grid-2">
          {filteredLoads.map((load) => (
            <Card
              key={load.id}
              className="stack-sm animate-slide-up"
              style={{ transition: 'transform var(--duration-fast)', cursor: 'pointer' }}
              onClick={() => navigate(`/app/shipments/${load.id}`)}
              onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-2px)')}
              onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
            >
              <div className="row-between">
                <Badge variant={load.budget > 1000 ? 'success' : 'info'}>{load.border || 'Domestic'}</Badge>
                <div style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--ink)' }}>
                  {money(load.budget)}
                </div>
              </div>

              <div className="stack" style={{ margin: 'var(--space-2) 0' }}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <MapPin size={20} color="var(--brand)" style={{ marginTop: 2, marginRight: 'var(--space-2)' }} />
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{load.origin}</div>
                    <div className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
                      Pickup
                    </div>
                  </div>
                </div>
                <div style={{ marginLeft: 9, width: 2, height: 16, background: 'var(--border)' }} />
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <MapPin size={20} color="var(--brand-mid)" style={{ marginTop: 2, marginRight: 'var(--space-2)' }} />
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{load.destination}</div>
                    <div className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
                      Dropoff ({load.distance} km)
                    </div>
                  </div>
                </div>
              </div>

              <div className="divider" />

              <div className="row-between text-muted" style={{ fontSize: 'var(--text-sm)' }}>
                <div className="row">
                  <Box size={14} /> {load.cargo} ({load.weight}t)
                </div>
                <div className="row">
                  <Truck size={14} /> {load.vehicleType}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
