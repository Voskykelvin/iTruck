import { useNavigate } from 'react-router-dom';
import { useSessionBootstrap } from '../queries/session';
import { useBookings, useOpenBookings } from '../queries/commercial';
import { roleForUser } from '../utils/roles';
import MetricCard from '../components/domain/MetricCard';
import ShipmentCard from '../components/domain/ShipmentCard';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import Button from '../components/ui/Button';
import { Package, Truck, CheckCircle, Clock, Search } from 'lucide-react';

export default function DashboardPage() {
  const { data: user } = useSessionBootstrap();
  const role = roleForUser(user);
  const navigate = useNavigate();

  const { data: shipments = [], isLoading: loadingShipments } = useBookings();
  const { data: openLoads = [], isLoading: loadingLoads } = useOpenBookings();

  // Shipper Metrics
  const activeShipments = shipments.filter((s) => ['in_transit', 'delivery_pending'].includes(s.rawStatus));
  const completedShipments = shipments.filter((s) => s.rawStatus === 'delivered');
  const pendingShipments = shipments.filter((s) => ['pending', 'bidding', 'confirmed'].includes(s.rawStatus));

  // Owner Metrics
  const activeLoads = openLoads.length;

  if (loadingShipments || (role === 'owner' && loadingLoads)) {
    return (
      <div className="animate-fade-in stack-lg">
        <div className="grid-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} style={{ height: 120 }} />
          ))}
        </div>
        <Skeleton style={{ height: 400 }} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in stack-lg">
      <div className="page-header">
        <div>
          <h1 className="page-title">Welcome back, {user?.firstName || 'User'}</h1>
          <p className="text-secondary">
            Here&apos;s what&apos;s happening with your {role === 'owner' ? 'fleet' : 'logistics'} today.
          </p>
        </div>

        {role === 'owner' ? (
          <Button variant="primary" icon={Search} onClick={() => navigate('/app/bids')}>
            Browse Load Board
          </Button>
        ) : role !== 'admin' ? (
          <Button variant="primary" icon={Package} onClick={() => navigate('/app/book')}>
            Book a Truck
          </Button>
        ) : null}
      </div>

      <div className="grid-3 metrics-grid" aria-label="Shipment summary">
        {role === 'owner' ? (
          <>
            <MetricCard title="Available Loads" value={activeLoads} icon={Search} subtitle="Open on the Load Board" />
            <MetricCard
              title="Active Trips"
              value={activeShipments.length}
              icon={Truck}
              trend={12}
              subtitle="Fleet in transit"
            />
            <MetricCard
              title="Completed Runs"
              value={completedShipments.length}
              icon={CheckCircle}
              subtitle="Delivered & verified"
            />
          </>
        ) : (
          <>
            <MetricCard
              title="In Transit"
              value={activeShipments.length}
              icon={Truck}
              trend={5}
              subtitle="Live tracking active"
            />
            <MetricCard
              title="Pending Dispatch"
              value={pendingShipments.length}
              icon={Clock}
              subtitle="Quotes & confirmations"
            />
            <MetricCard
              title="Delivered"
              value={completedShipments.length}
              icon={CheckCircle}
              subtitle="POD verified"
            />
          </>
        )}
      </div>

      <div>
        <div className="row-between" style={{ marginBottom: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)' }}>{role === 'owner' ? 'Active Fleet Trips' : 'Recent Shipments'}</h2>
          <Button variant="ghost" size="sm" onClick={() => navigate('/app/shipments')}>
            View All
          </Button>
        </div>

        {shipments.length === 0 ? (
          <EmptyState
            icon={role === 'owner' ? Truck : Package}
            title={role === 'owner' ? 'No active fleet trips' : 'No active shipments'}
            description={
              role === 'owner'
                ? 'Your fleet currently has no trips on the road. Bid on open loads to get assigned.'
                : 'You have not booked any shipments yet. Get transparent rates and instant carrier matching.'
            }
            action={
              role === 'owner' ? (
                <Button variant="primary" icon={Search} onClick={() => navigate('/app/bids')}>
                  Browse Available Loads
                </Button>
              ) : (
                <Button variant="primary" icon={Package} onClick={() => navigate('/app/book')}>
                  Book a Truck
                </Button>
              )
            }
          />
        ) : (
          <div className="stack-sm">
            {shipments.slice(0, 5).map((shipment) => (
              <ShipmentCard key={shipment.id} shipment={shipment} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
