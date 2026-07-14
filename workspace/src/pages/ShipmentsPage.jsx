import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useBookings } from '../queries/commercial';
import { useSessionBootstrap } from '../queries/session';
import { roleForUser } from '../utils/roles';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import DataTable from '../components/ui/DataTable';
import Badge from '../components/ui/Badge';
import { Search, Package, Plus, MapPin } from 'lucide-react';
import { money } from '../utils/helpers';
import Tabs from '../components/ui/Tabs';

export default function ShipmentsPage() {
  const navigate = useNavigate();
  const { data: user } = useSessionBootstrap();
  const role = roleForUser(user);
  const { data: shipments = [], isLoading } = useBookings();

  const [search, setSearch] = useState('');

  const activeShipments = shipments.filter((s) =>
    ['in_transit', 'delivery_pending', 'pending', 'bidding', 'confirmed'].includes(s.rawStatus)
  );
  const pastShipments = shipments.filter((s) => ['delivered', 'cancelled'].includes(s.rawStatus));

  const columns = [
    { header: 'ID', accessor: 'id', cell: (row) => <span className="mono text-muted">{row.id.substring(0, 8)}</span> },
    {
      header: 'Status',
      accessor: 'status',
      cell: (row) => (
        <Badge
          variant={
            row.rawStatus === 'delivered'
              ? 'success'
              : row.rawStatus === 'in_transit'
                ? 'info'
                : row.rawStatus === 'cancelled'
                  ? 'danger'
                  : 'default'
          }
        >
          {row.status}
        </Badge>
      )
    },
    {
      header: 'Route',
      accessor: 'route',
      cell: (row) => (
        <div className="row">
          <MapPin size={14} color="var(--brand)" />
          <span className="truncate" style={{ maxWidth: 200 }}>
            {row.origin} → {row.destination}
          </span>
        </div>
      )
    },
    {
      header: 'Cargo',
      accessor: 'cargo',
      cell: (row) => (
        <span className="truncate" style={{ maxWidth: 150 }}>
          {row.cargo} ({row.weight}t)
        </span>
      )
    },
    { header: 'ETA', accessor: 'eta' },
    {
      header: 'Price',
      accessor: 'price',
      align: 'right',
      cell: (row) => <span style={{ fontWeight: 600 }}>{money(row.price)}</span>
    }
  ];

  const TableContent = ({ data }) => {
    const filtered = data.filter(
      (s) =>
        !search ||
        s.id.toLowerCase().includes(search.toLowerCase()) ||
        s.origin.toLowerCase().includes(search.toLowerCase()) ||
        s.destination.toLowerCase().includes(search.toLowerCase())
    );

    if (!isLoading && filtered.length === 0) {
      return (
        <EmptyState
          icon={Package}
          title="No shipments found"
          description={
            search
              ? "We couldn't find any shipments matching your search."
              : "You don't have any shipments in this category."
          }
        />
      );
    }

    return (
      <DataTable
        columns={columns}
        data={filtered}
        loading={isLoading}
        onRowClick={(row) => navigate(`/app/shipments/${row.id}`)}
      />
    );
  };

  return (
    <div className="animate-fade-in stack-lg">
      <div className="page-header" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div className="row-between" style={{ marginBottom: 'var(--space-4)' }}>
          <div>
            <h1 className="page-title">Shipments</h1>
            <p className="text-secondary">Track and manage all your logistics operations.</p>
          </div>

          {role !== 'owner' && role !== 'admin' && (
            <Button variant="primary" icon={Plus} onClick={() => navigate('/app/book')}>
              New Booking
            </Button>
          )}
        </div>

        <div className="input-group" style={{ margin: 0, position: 'relative', maxWidth: 400 }}>
          <Search
            size={20}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            className="input-field"
            placeholder="Search by ID, city, or route..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 'var(--space-10)' }}
          />
        </div>
      </div>

      <Tabs
        defaultTab="active"
        tabs={[
          {
            id: 'active',
            label: `Active (${activeShipments.length})`,
            content: <TableContent data={activeShipments} />
          },
          {
            id: 'past',
            label: 'Past Shipments',
            content: <TableContent data={pastShipments} />
          }
        ]}
      />
    </div>
  );
}
