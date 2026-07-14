import { useAdminWorkspace } from '../queries/admin';
import Card from '../components/ui/Card';
import MetricCard from '../components/domain/MetricCard';
import Skeleton from '../components/ui/Skeleton';
import DataTable from '../components/ui/DataTable';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Tabs from '../components/ui/Tabs';
import { Users, Truck, Package, Activity, FileText, CheckCircle, ShieldAlert } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { adminQueryKeys } from '../queries/admin';
import { useToast } from '../components/ui/Toast';

export default function AdminPage() {
  const { data: workspace, isLoading } = useAdminWorkspace();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const verifyTruck = useMutation({
    mutationFn: (truck) => api.adminVerifyTruck(truck.id || truck._id, true),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminQueryKeys.all });
      addToast({ title: 'Vehicle Verified', type: 'success' });
    },
    onError: (error) => addToast({ title: 'Verification Failed', message: error.message, type: 'error' })
  });

  const handleVerifyTruck = (truck) => {
    if (window.confirm(`Verify ${truck.name || truck.registrationNumber || 'this vehicle'}?`)) {
      verifyTruck.mutate(truck);
    }
  };

  const stats = workspace?.stats;
  const { users = [], trucks = [], bookings = [], cases = [] } = workspace?.data || {};

  if (isLoading) {
    return (
      <div className="animate-fade-in stack-lg">
        <div className="grid-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} style={{ height: 120 }} />
          ))}
        </div>
        <Skeleton style={{ height: 400 }} />
      </div>
    );
  }

  const unverifiedTrucks = trucks.filter((t) => !t.verified);
  const openCases = cases.filter((c) => c.status === 'open' || c.status === 'pending');
  const activeBookings = bookings.filter((b) => ['in_transit', 'pending', 'bidding'].includes(b.rawStatus));

  const userCols = [
    {
      header: 'User',
      accessor: 'firstName',
      cell: (row) => (
        <div style={{ fontWeight: 600 }}>
          {row.firstName} {row.lastName}
        </div>
      )
    },
    { header: 'Email', accessor: 'email', cell: (row) => <div className="text-secondary">{row.email}</div> },
    {
      header: 'Role',
      accessor: 'role',
      cell: (row) => <Badge variant={row.role === 'owner' ? 'info' : 'default'}>{row.role}</Badge>
    },
    {
      header: 'Joined',
      accessor: 'createdAt',
      cell: (row) => <div className="text-muted">{new Date(row.createdAt || Date.now()).toLocaleDateString()}</div>
    }
  ];

  const truckCols = [
    { header: 'Vehicle', accessor: 'name', cell: (row) => <div style={{ fontWeight: 600 }}>{row.name}</div> },
    {
      header: 'Plate',
      accessor: 'registrationNumber',
      cell: (row) => <div className="mono text-muted">{row.registrationNumber}</div>
    },
    {
      header: 'Owner',
      accessor: 'ownerId',
      cell: (row) => <div className="text-secondary">{row.owner?.firstName || 'Unknown'}</div>
    },
    {
      header: 'Status',
      accessor: 'verified',
      cell: (row) => (
        <Badge variant={row.verified ? 'success' : 'warning'}>
          {row.verified ? 'Verified' : 'Pending Verification'}
        </Badge>
      )
    },
    {
      header: 'Action',
      accessor: 'id',
      align: 'right',
      cell: (row) =>
        !row.verified && (
          <Button size="sm" variant="secondary" onClick={() => handleVerifyTruck(row)} loading={verifyTruck.isPending}>
            Verify
          </Button>
        )
    }
  ];

  return (
    <div className="animate-fade-in stack-lg">
      <div className="page-header">
        <div>
          <h1 className="page-title">Admin Console</h1>
          <p className="text-secondary">Platform overview, verification, and support.</p>
        </div>
      </div>

      <div className="grid-4">
        <MetricCard title="Total Users" value={stats?.users || users.length} icon={Users} trend={4} />
        <MetricCard title="Active Trucks" value={stats?.trucks || trucks.length} icon={Truck} trend={12} />
        <MetricCard
          title="Active Bookings"
          value={stats?.bookings || activeBookings.length}
          icon={Package}
          trend={-2}
        />
        <MetricCard
          title="Platform Volume"
          value={`$${((stats?.volume || 0) / 1000).toFixed(1)}k`}
          icon={Activity}
          trend={18}
        />
      </div>

      <div className="grid-2" style={{ alignItems: 'flex-start' }}>
        <Card
          className="stack"
          style={{ borderColor: openCases.length > 0 ? 'var(--warning-border)' : 'var(--border)' }}
        >
          <div className="row-between">
            <div className="row">
              <ShieldAlert
                size={20}
                color={openCases.length > 0 ? 'var(--warning)' : 'var(--success)'}
                style={{ marginRight: 'var(--space-2)' }}
              />
              <h3 style={{ fontSize: 'var(--text-md)', margin: 0 }}>Support Cases</h3>
            </div>
            {openCases.length > 0 && <Badge variant="warning">{openCases.length} Open</Badge>}
          </div>

          <div className="stack-sm">
            {openCases.length === 0 ? (
              <div className="text-muted" style={{ padding: 'var(--space-4) 0', textAlign: 'center' }}>
                <CheckCircle size={32} style={{ margin: '0 auto var(--space-2)' }} color="var(--success)" />
                <div>All support cases resolved!</div>
              </div>
            ) : (
              openCases.slice(0, 5).map((c) => (
                <div key={c.id} className="row-between glass-panel" style={{ padding: 'var(--space-3)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{c.subject}</div>
                    <div className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
                      Case #{c.id.substring(0, 6)} • {c.priority}
                    </div>
                  </div>
                  <Badge variant="warning">{c.status}</Badge>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card
          className="stack"
          style={{ borderColor: unverifiedTrucks.length > 0 ? 'var(--info-border)' : 'var(--border)' }}
        >
          <div className="row-between">
            <div className="row">
              <FileText
                size={20}
                color={unverifiedTrucks.length > 0 ? 'var(--info)' : 'var(--text-muted)'}
                style={{ marginRight: 'var(--space-2)' }}
              />
              <h3 style={{ fontSize: 'var(--text-md)', margin: 0 }}>Pending Verifications</h3>
            </div>
            {unverifiedTrucks.length > 0 && <Badge variant="info">{unverifiedTrucks.length} Trucks</Badge>}
          </div>

          <div className="stack-sm">
            {unverifiedTrucks.length === 0 ? (
              <div className="text-muted" style={{ padding: 'var(--space-4) 0', textAlign: 'center' }}>
                <CheckCircle size={32} style={{ margin: '0 auto var(--space-2)' }} color="var(--success)" />
                <div>No pending verifications.</div>
              </div>
            ) : (
              unverifiedTrucks.slice(0, 5).map((t) => (
                <div key={t.id} className="row-between glass-panel" style={{ padding: 'var(--space-3)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{t.name}</div>
                    <div className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
                      {t.registrationNumber} • {t.company}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleVerifyTruck(t)}
                    loading={verifyTruck.isPending}
                  >
                    Verify
                  </Button>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="stack">
        <h2 style={{ fontSize: 'var(--text-lg)' }}>Platform Data</h2>
        <Tabs
          defaultTab="users"
          tabs={[
            { id: 'users', label: 'Users', content: <DataTable columns={userCols} data={users} /> },
            { id: 'trucks', label: 'Trucks', content: <DataTable columns={truckCols} data={trucks} /> }
          ]}
        />
      </div>
    </div>
  );
}
