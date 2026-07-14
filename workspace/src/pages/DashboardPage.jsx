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

        {role !== 'owner' && role !== 'admin' && (
          <Button variant="primary" icon={Package} onClick={() => navigate('/app/book')}>
            New Booking
          </Button>
        )}
      </div>

      <div className="grid-3">
        {role === 'owner' ? (
          <>
            <MetricCard title="Available Loads" value={activeLoads} icon={Search} subtitle="Matching your fleet" />
            <MetricCard title="Active Trips" value={activeShipments.length} icon={Truck} trend={12} />
            <MetricCard title="Completed" value={completedShipments.length} icon={CheckCircle} />
          </>
        ) : (
          <>
            <MetricCard title="In Transit" value={activeShipments.length} icon={Truck} trend={5} />
            <MetricCard
              title="Pending Action"
              value={pendingShipments.length}
              icon={Clock}
              subtitle="Waiting for dispatch"
            />
            <MetricCard title="Delivered" value={completedShipments.length} icon={CheckCircle} />
          </>
        )}
      </div>

      <div>
        <div className="row-between" style={{ marginBottom: 'var(--space-4)' }}>
          <h2 style={{ fontSize: 'var(--text-lg)' }}>
            {role === 'owner' ? 'Your Active Shipments' : 'Recent Shipments'}
          </h2>
          <Button variant="ghost" size="sm" onClick={() => navigate('/app/shipments')}>
            View All
          </Button>
        </div>

        {shipments.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No active shipments"
            description={
              role === 'owner'
                ? "You don't have any active deliveries right now."
                : "You haven't booked any shipments yet."
            }
            action={
              role !== 'owner' ? (
                <Button variant="primary" onClick={() => navigate('/app/book')}>
                  Book a Truck
                </Button>
              ) : null
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
