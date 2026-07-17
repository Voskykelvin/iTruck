import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  BellRing,
  CheckCircle,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  FileWarning,
  Landmark,
  Laptop,
  MessageSquareWarning,
  Package,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  Truck,
  UserCheck,
  Users
} from 'lucide-react';
import { api } from '../api';
import { adminQueryKeys, useAdminWorkspace } from '../queries/admin';
import { useSessionBootstrap } from '../queries/session';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import DataTable from '../components/ui/DataTable';
import Input from '../components/ui/Input';
import MetricCard from '../components/domain/MetricCard';
import Modal from '../components/ui/Modal';
import NetworkStatus from '../components/ui/NetworkStatus';
import Skeleton from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { money } from '../utils/helpers';

const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'verification', label: 'Verification' },
  { id: 'cases', label: 'Cases & disputes' },
  { id: 'payments', label: 'Payments' },
  { id: 'security', label: 'Security' },
  { id: 'delivery', label: 'Delivery health' }
];

const activeCaseStatuses = new Set([
  'submitted',
  'reviewing',
  'open',
  'triaged',
  'in_progress',
  'waiting_on_user',
  'waiting_on_carrier'
]);

function dateTime(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not recorded' : date.toLocaleString();
}

function priorityVariant(priority) {
  if (['urgent', 'high', 'critical'].includes(String(priority).toLowerCase())) return 'danger';
  if (['normal', 'medium'].includes(String(priority).toLowerCase())) return 'warning';
  return 'default';
}

function statusVariant(status) {
  const value = String(status || '').toLowerCase();
  if (['completed', 'sent', 'approved', 'verified', 'resolved', 'released'].includes(value)) return 'success';
  if (['failed', 'rejected', 'cancelled', 'dismissed'].includes(value)) return 'danger';
  if (['pending', 'retry', 'processing', 'reviewing', 'triaged', 'in_progress'].includes(value)) return 'warning';
  return 'info';
}

function documentRows(entity) {
  return Array.isArray(entity?.documents) ? entity.documents : [];
}

export default function AdminPage() {
  const { data: workspace, isLoading } = useAdminWorkspace();
  const { data: currentUser } = useSessionBootstrap();
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  const [section, setSection] = useState('overview');
  const [verificationTab, setVerificationTab] = useState('vehicles');
  const [selectedReview, setSelectedReview] = useState(null);
  const [selectedCase, setSelectedCase] = useState(null);
  const [resolution, setResolution] = useState({ outcome: 'no_action', summary: '' });

  const invalidate = async () => queryClient.invalidateQueries({ queryKey: adminQueryKeys.all });
  const actionMutation = useMutation({
    mutationFn: ({ action }) => action(),
    onSuccess: async (_, variables) => {
      await invalidate();
      if (variables?.message) addToast({ title: variables.message, type: 'success' });
    },
    onError: (error) => addToast({ title: 'Action failed', message: error.message, type: 'error' })
  });

  const stats = workspace?.stats || {};
  const {
    users = [],
    trucks = [],
    bookings = [],
    payments = [],
    providerOperations = [],
    cases = [],
    notificationDeliveries = [],
    sessions = [],
    logs = []
  } = workspace?.data || {};

  const queues = useMemo(() => {
    const pendingUsers = users.filter((user) => !user.verified && user.active);
    const pendingVehicles = trucks.filter((truck) => !truck.verified);
    const openCases = cases.filter((record) => activeCaseStatuses.has(record.status));
    const paymentExceptions = payments.filter((payment) =>
      ['pending', 'failed'].includes(String(payment.status).toLowerCase())
    );
    const failedDeliveries = notificationDeliveries.filter((delivery) => ['failed', 'retry'].includes(delivery.status));
    return { pendingUsers, pendingVehicles, openCases, paymentExceptions, failedDeliveries };
  }, [users, trucks, cases, payments, notificationDeliveries]);

  const reviewDocument = (document, status) => {
    if (!selectedReview?.entity || !document?.type) return;
    const entity = selectedReview.entity;
    const request =
      selectedReview.kind === 'user'
        ? api.adminReviewUserDocument(entity.id, document.type, { status })
        : api.adminReviewTruckDocument(entity.id, document.type, { status });
    actionMutation.mutate({ action: () => request, message: `Document marked ${status}` });
  };

  const verifyEntity = (kind, entity, isVerified) => {
    const action =
      kind === 'user' ? api.adminVerifyUser(entity.id, isVerified) : api.adminVerifyTruck(entity.id, isVerified);
    actionMutation.mutate({
      action: () => action,
      message: isVerified ? 'Verification approved' : 'Verification held'
    });
  };

  const userColumns = [
    {
      header: 'Person',
      accessor: 'displayName',
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 700 }}>{row.displayName}</div>
          <div className="text-secondary" style={{ fontSize: 'var(--text-xs)' }}>
            {row.email}
          </div>
        </div>
      )
    },
    {
      header: 'Role',
      accessor: 'role',
      cell: (row) => <Badge variant={row.role === 'owner' ? 'info' : 'default'}>{row.role}</Badge>
    },
    {
      header: 'Evidence',
      accessor: 'documents',
      cell: (row) => <span className="text-secondary">{documentRows(row).length} document(s)</span>
    },
    {
      header: 'Status',
      accessor: 'verified',
      cell: (row) => (
        <Badge variant={row.verified ? 'success' : 'warning'}>{row.verified ? 'Verified' : 'Review needed'}</Badge>
      )
    },
    {
      header: 'Action',
      accessor: 'id',
      align: 'right',
      cell: (row) => (
        <Button size="sm" variant="secondary" onClick={() => setSelectedReview({ kind: 'user', entity: row })}>
          Review
        </Button>
      )
    }
  ];

  const truckColumns = [
    {
      header: 'Vehicle',
      accessor: 'displayName',
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 700 }}>{row.displayName}</div>
          <div className="mono text-muted" style={{ fontSize: 'var(--text-xs)' }}>
            {row.plateNumber}
          </div>
        </div>
      )
    },
    { header: 'Owner', accessor: 'ownerName', cell: (row) => <span className="text-secondary">{row.ownerName}</span> },
    { header: 'Capacity', accessor: 'capacityTonnes', cell: (row) => <span>{row.capacityTonnes || '—'} t</span> },
    {
      header: 'Evidence',
      accessor: 'documents',
      cell: (row) => <span className="text-secondary">{documentRows(row).length} document(s)</span>
    },
    {
      header: 'Status',
      accessor: 'verified',
      cell: (row) => (
        <Badge variant={row.verified ? 'success' : 'warning'}>{row.verified ? 'Verified' : 'Review needed'}</Badge>
      )
    },
    {
      header: 'Action',
      accessor: 'id',
      align: 'right',
      cell: (row) => (
        <Button size="sm" variant="secondary" onClick={() => setSelectedReview({ kind: 'truck', entity: row })}>
          Review
        </Button>
      )
    }
  ];

  const caseColumns = [
    {
      header: 'Case',
      accessor: 'title',
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 700 }}>{row.title || `${row.kind || 'Support'} case`}</div>
          <div className="text-secondary" style={{ fontSize: 'var(--text-xs)' }}>
            {row.caseNumber || row.id.slice(0, 8)} · {row.category || 'other'}
          </div>
        </div>
      )
    },
    {
      header: 'Type',
      accessor: 'kind',
      cell: (row) => <Badge variant={row.kind === 'dispute' ? 'danger' : 'info'}>{row.kind || 'support'}</Badge>
    },
    {
      header: 'Priority',
      accessor: 'priority',
      cell: (row) => <Badge variant={priorityVariant(row.priority)}>{row.priority || 'normal'}</Badge>
    },
    {
      header: 'Status',
      accessor: 'status',
      cell: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
    },
    {
      header: 'Action',
      accessor: 'id',
      align: 'right',
      cell: (row) => (
        <Button size="sm" variant="secondary" onClick={() => setSelectedCase(row)}>
          Manage
        </Button>
      )
    }
  ];

  const paymentColumns = [
    {
      header: 'Transaction',
      accessor: 'reference',
      cell: (row) => (
        <div>
          <div style={{ fontWeight: 700 }}>{row.reference || row.id.slice(0, 10)}</div>
          <div className="text-secondary" style={{ fontSize: 'var(--text-xs)' }}>
            {row.provider || row.method || 'Internal ledger'} · {row.type}
          </div>
        </div>
      )
    },
    { header: 'Amount', accessor: 'amount', cell: (row) => <strong>{money(row.amount || 0)}</strong> },
    {
      header: 'Status',
      accessor: 'status',
      cell: (row) => <Badge variant={statusVariant(row.status)}>{row.status || 'pending'}</Badge>
    },
    {
      header: 'Next action',
      accessor: 'id',
      align: 'right',
      cell: (row) => {
        const bookingId = typeof row.booking === 'object' ? row.booking?._id || row.booking?.id : row.booking;
        if (row.type === 'withdrawal' && row.status === 'pending') {
          return (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                actionMutation.mutate({ action: () => api.adminExecutePayout(row.id), message: 'Payout submitted' })
              }
            >
              Execute payout
            </Button>
          );
        }
        if (row.type === 'payment' && row.status === 'pending' && bookingId) {
          return (
            <Button
              size="sm"
              variant="secondary"
              onClick={() =>
                actionMutation.mutate({
                  action: () => api.adminReleaseBookingPayment(bookingId),
                  message: 'Payment released'
                })
              }
            >
              Release
            </Button>
          );
        }
        if (row.type === 'payment' && row.status === 'completed') {
          return (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                actionMutation.mutate({
                  action: () => api.adminRefundPayment(row.id, { reason: 'requested_by_customer' }),
                  message: 'Refund submitted'
                })
              }
            >
              Refund
            </Button>
          );
        }
        return <span className="text-muted">Monitor</span>;
      }
    }
  ];

  if (isLoading) {
    return <AdminLoading />;
  }

  return (
    <div className="animate-fade-in stack-lg admin-workspace">
      <div className="page-header admin-page-header">
        <div>
          <p className="eyebrow">Operations workspace</p>
          <h1 className="page-title">Admin Console</h1>
          <p className="text-secondary">
            Review identity, vehicles, payment exceptions, support cases, and delivery health from one queue.
          </p>
        </div>
        <div className="admin-connection-status">
          <NetworkStatus />
          <span>Operational data refreshes every 30 seconds</span>
        </div>
      </div>

      <nav className="admin-section-nav" aria-label="Admin sections">
        {sections.map((item) => (
          <button key={item.id} className={section === item.id ? 'active' : ''} onClick={() => setSection(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

      {workspace?.errors?.length > 0 && (
        <Card className="admin-warning-card">
          <FileWarning size={20} />
          <div>
            <strong>Some operational data is temporarily unavailable.</strong>
            <p>{workspace.errors.map((error) => error.label).join(', ')} will refresh automatically.</p>
          </div>
        </Card>
      )}

      {section === 'overview' && (
        <Overview stats={stats} trucks={trucks} bookings={bookings} queues={queues} onNavigate={setSection} />
      )}

      {section === 'verification' && (
        <VerificationCenter
          tab={verificationTab}
          onTabChange={setVerificationTab}
          users={users}
          trucks={trucks}
          pendingUsers={queues.pendingUsers}
          pendingVehicles={queues.pendingVehicles}
          userColumns={userColumns}
          truckColumns={truckColumns}
        />
      )}

      {section === 'cases' && (
        <OperationsTable
          title="Cases and disputes"
          description="Prioritize active disputes and support cases by urgency, SLA, and payment impact."
          data={cases}
          columns={caseColumns}
          empty="No open cases are waiting for review."
        />
      )}

      {section === 'payments' && (
        <PaymentsWorkspace payments={payments} providerOperations={providerOperations} columns={paymentColumns} />
      )}

      {section === 'security' && (
        <SecurityWorkspace sessions={sessions} users={users} logs={logs} actionMutation={actionMutation} />
      )}

      {section === 'delivery' && <DeliveryHealth deliveries={notificationDeliveries} actionMutation={actionMutation} />}

      <ReviewModal
        review={selectedReview}
        pending={actionMutation.isPending}
        onClose={() => setSelectedReview(null)}
        onVerify={verifyEntity}
        onReviewDocument={reviewDocument}
      />

      <CaseModal
        record={selectedCase}
        resolution={resolution}
        setResolution={setResolution}
        currentUser={currentUser}
        pending={actionMutation.isPending}
        onClose={() => {
          setSelectedCase(null);
          setResolution({ outcome: 'no_action', summary: '' });
        }}
        onAction={(action, message) => actionMutation.mutate({ action, message })}
      />
    </div>
  );
}

function AdminLoading() {
  return (
    <div className="animate-fade-in stack-lg">
      <div className="grid-4">
        {[1, 2, 3, 4].map((item) => (
          <Skeleton key={item} style={{ height: 128 }} />
        ))}
      </div>
      <Skeleton style={{ height: 420 }} />
    </div>
  );
}

function Overview({ stats, trucks, bookings, queues, onNavigate }) {
  const verifiedTrucks = trucks.filter((truck) => truck.verified).length;
  const activeBookings = bookings.filter((booking) =>
    ['pending', 'bidding', 'confirmed', 'in_transit', 'delivery_pending', 'disputed'].includes(
      booking.rawStatus || booking.status
    )
  ).length;
  const actions = [
    {
      id: 'verification',
      icon: FileCheck2,
      title: 'Verification queue',
      value: queues.pendingUsers.length + queues.pendingVehicles.length,
      description: `${queues.pendingUsers.length} people · ${queues.pendingVehicles.length} vehicles`
    },
    {
      id: 'cases',
      icon: MessageSquareWarning,
      title: 'Cases requiring attention',
      value: queues.openCases.length,
      description: 'Support and disputes'
    },
    {
      id: 'payments',
      icon: CircleDollarSign,
      title: 'Payment exceptions',
      value: queues.paymentExceptions.length,
      description: 'Pending or failed transactions'
    },
    {
      id: 'delivery',
      icon: BellRing,
      title: 'Delivery retries',
      value: queues.failedDeliveries.length,
      description: 'Notification retries or failures'
    }
  ];
  return (
    <div className="stack-lg">
      <div className="grid-4">
        <MetricCard title="Total users" value={stats.users} icon={Users} subtitle="All registered roles" />
        <MetricCard
          title="Verified vehicles"
          value={verifiedTrucks}
          icon={Truck}
          subtitle={`${trucks.length} total vehicles`}
        />
        <MetricCard
          title="Active bookings"
          value={activeBookings}
          icon={Package}
          subtitle={`${stats.bookings} total bookings`}
        />
        <MetricCard
          title="Platform volume"
          value={money(stats.volume)}
          icon={Activity}
          subtitle="Completed payment volume"
        />
      </div>
      <section className="stack">
        <div className="row-between">
          <div>
            <h2>Needs attention</h2>
            <p className="text-secondary">The highest-value work is separated into focused operational queues.</p>
          </div>
        </div>
        <div className="admin-action-grid">
          {actions.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className="admin-action-card" onClick={() => onNavigate(item.id)}>
                <span className="admin-action-icon">
                  <Icon size={19} />
                </span>
                <span className="admin-action-copy">
                  <strong>{item.title}</strong>
                  <small>{item.description}</small>
                </span>
                <span className="admin-action-value">{item.value}</span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function VerificationCenter({
  tab,
  onTabChange,
  users,
  trucks,
  pendingUsers,
  pendingVehicles,
  userColumns,
  truckColumns
}) {
  const documents = tab === 'people' ? pendingUsers.flatMap(documentRows) : pendingVehicles.flatMap(documentRows);
  return (
    <section className="stack admin-content-card">
      <div className="row-between admin-content-heading">
        <div>
          <h2>Verification center</h2>
          <p className="text-secondary">
            Review people and vehicles separately. Open an item to approve evidence or hold it for follow-up.
          </p>
        </div>
        <Badge variant="warning">{tab === 'people' ? pendingUsers.length : pendingVehicles.length} pending</Badge>
      </div>
      <div className="admin-subnav" role="tablist">
        <button
          className={tab === 'vehicles' ? 'active' : ''}
          onClick={() => onTabChange('vehicles')}
          role="tab"
          aria-selected={tab === 'vehicles'}
        >
          Vehicles ({pendingVehicles.length})
        </button>
        <button
          className={tab === 'people' ? 'active' : ''}
          onClick={() => onTabChange('people')}
          role="tab"
          aria-selected={tab === 'people'}
        >
          People ({pendingUsers.length})
        </button>
        <span className="admin-evidence-count">{documents.length} evidence record(s) in this queue</span>
      </div>
      <DataTable columns={tab === 'people' ? userColumns : truckColumns} data={tab === 'people' ? users : trucks} />
    </section>
  );
}

function OperationsTable({ title, description, data, columns, empty }) {
  return (
    <section className="stack admin-content-card">
      <div className="admin-content-heading">
        <h2>{title}</h2>
        <p className="text-secondary">{description}</p>
      </div>
      {data.length ? (
        <DataTable columns={columns} data={data} />
      ) : (
        <div className="admin-empty-state">
          <CheckCircle size={32} />
          <strong>{empty}</strong>
        </div>
      )}
    </section>
  );
}

function PaymentsWorkspace({ payments, providerOperations, columns }) {
  return (
    <div className="stack-lg">
      <OperationsTable
        title="Payment provider workflows"
        description="Release escrow only after evidence checks; execute refunds and payouts through auditable provider operations."
        data={payments}
        columns={columns}
        empty="No payment transactions need review."
      />
      <section className="stack admin-content-card">
        <div className="admin-content-heading">
          <h2>Provider operations</h2>
          <p className="text-secondary">
            Async provider requests remain visible until their callback or reconciliation completes.
          </p>
        </div>
        {providerOperations.length ? (
          <DataTable
            columns={[
              { header: 'Operation', accessor: 'type', cell: (row) => <strong>{row.type}</strong> },
              { header: 'Provider', accessor: 'provider' },
              { header: 'Amount', accessor: 'amount', cell: (row) => money(row.amount || 0) },
              {
                header: 'Status',
                accessor: 'status',
                cell: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
              },
              {
                header: 'Reference',
                accessor: 'providerReference',
                cell: (row) => <span className="mono text-muted">{row.providerReference || 'Pending'}</span>
              }
            ]}
            data={providerOperations}
          />
        ) : (
          <div className="admin-empty-state">
            <Landmark size={32} />
            <strong>No provider operations are pending.</strong>
          </div>
        )}
      </section>
    </div>
  );
}

function SecurityWorkspace({ sessions, users, logs, actionMutation }) {
  const pushEnabled = users.filter((user) => user.pushSubscription).length;
  const activeAdmins = users.filter((user) => user.role === 'admin' && user.active).length;
  const columns = [
    {
      header: 'Account',
      accessor: 'user',
      cell: (row) => (
        <div>
          <strong>
            {row.user?.firstName} {row.user?.lastName}
          </strong>
          <div className="text-secondary" style={{ fontSize: 'var(--text-xs)' }}>
            {row.user?.email}
          </div>
        </div>
      )
    },
    {
      header: 'Device',
      accessor: 'deviceName',
      cell: (row) => (
        <div className="row" style={{ gap: 'var(--space-2)' }}>
          {row.deviceType === 'mobile' ? <Smartphone size={16} /> : <Laptop size={16} />}
          <span>{row.deviceName || 'Unknown device'}</span>
        </div>
      )
    },
    {
      header: 'Last active',
      accessor: 'lastUsedAt',
      cell: (row) => <span className="text-secondary">{dateTime(row.lastUsedAt)}</span>
    },
    {
      header: 'Expires',
      accessor: 'expiresAt',
      cell: (row) => <span className="text-secondary">{dateTime(row.expiresAt)}</span>
    },
    {
      header: 'Action',
      accessor: 'id',
      align: 'right',
      cell: (row) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            actionMutation.mutate({ action: () => api.adminRevokeSecuritySession(row.id), message: 'Session revoked' })
          }
        >
          Revoke
        </Button>
      )
    }
  ];
  return (
    <div className="stack-lg">
      <div className="grid-3">
        <MetricCard
          title="Active sessions"
          value={sessions.length}
          icon={ShieldCheck}
          subtitle="Revocable device sessions"
        />
        <MetricCard title="Active admins" value={activeAdmins} icon={Users} subtitle="Privileged accounts" />
        <MetricCard title="Push enabled" value={pushEnabled} icon={BellRing} subtitle="Accounts with subscriptions" />
      </div>
      <OperationsTable
        title="Session security controls"
        description="Only device metadata is shown. Tokens and hashes never leave the server."
        data={sessions}
        columns={columns}
        empty="No active sessions are available in this environment."
      />
      <section className="stack admin-content-card">
        <div className="admin-content-heading">
          <h2>Recent audit trail</h2>
          <p className="text-secondary">Recent admin actions across verification, payments, cases, and security.</p>
        </div>
        {logs.length ? (
          <DataTable
            columns={[
              { header: 'Action', accessor: 'action', cell: (row) => <strong>{row.action}</strong> },
              { header: 'Target', accessor: 'targetType', cell: (row) => `${row.targetType} · ${row.targetId}` },
              { header: 'When', accessor: 'createdAt', cell: (row) => dateTime(row.createdAt) }
            ]}
            data={logs}
          />
        ) : (
          <div className="admin-empty-state">
            <Clock3 size={32} />
            <strong>No audit events are available yet.</strong>
          </div>
        )}
      </section>
    </div>
  );
}

function DeliveryHealth({ deliveries, actionMutation }) {
  const columns = [
    {
      header: 'Notification',
      accessor: 'notification',
      cell: (row) => <strong>{row.notification?.title || row.notification?.type || 'Notification'}</strong>
    },
    { header: 'Channel', accessor: 'channel', cell: (row) => <Badge variant="info">{row.channel || 'in-app'}</Badge> },
    {
      header: 'Status',
      accessor: 'status',
      cell: (row) => <Badge variant={statusVariant(row.status)}>{row.status}</Badge>
    },
    { header: 'Attempts', accessor: 'attempts', cell: (row) => row.attempts || 0 },
    {
      header: 'Action',
      accessor: 'id',
      align: 'right',
      cell: (row) =>
        ['failed', 'retry'].includes(row.status) ? (
          <Button
            size="sm"
            variant="secondary"
            icon={RefreshCw}
            onClick={() =>
              actionMutation.mutate({
                action: () => api.adminRetryNotificationDelivery(row.id),
                message: 'Delivery queued for retry'
              })
            }
          >
            Retry
          </Button>
        ) : (
          <span className="text-muted">Healthy</span>
        )
    }
  ];
  return (
    <OperationsTable
      title="Delivery and notification health"
      description="Monitor provider delivery retries. Client-side tracking queues remain device-local and retry when connectivity returns."
      data={deliveries}
      columns={columns}
      empty="No delivery attempts are waiting for review."
    />
  );
}

function ReviewModal({ review, pending, onClose, onVerify, onReviewDocument }) {
  const entity = review?.entity;
  if (!entity) return null;
  const title = review.kind === 'user' ? entity.displayName : entity.displayName || entity.plateNumber;
  return (
    <Modal
      isOpen={Boolean(entity)}
      onClose={onClose}
      title={`Review ${review.kind === 'user' ? 'person' : 'vehicle'}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            variant="secondary"
            loading={pending}
            icon={ShieldOff}
            onClick={() => onVerify(review.kind, entity, false)}
          >
            Hold
          </Button>
          <Button
            variant="primary"
            loading={pending}
            icon={UserCheck}
            onClick={() => onVerify(review.kind, entity, true)}
          >
            Approve verification
          </Button>
        </>
      }
    >
      <div className="stack">
        <div>
          <h3>{title}</h3>
          <p className="text-secondary">
            {review.kind === 'user' ? entity.email : `${entity.plateNumber} · ${entity.ownerName}`}
          </p>
        </div>
        <div className="divider" />
        <div className="stack-sm">
          <h4>Submitted evidence</h4>
          {documentRows(entity).length ? (
            documentRows(entity).map((document, index) => (
              <div className="admin-document-row" key={`${document.type}-${index}`}>
                <div>
                  <strong>{document.type || 'Document'}</strong>
                  <div className="text-secondary">{document.fileName || document.url || 'Evidence record'}</div>
                </div>
                <div className="row">
                  <Badge variant={statusVariant(document.status)}>{document.status || 'pending'}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => onReviewDocument(document, 'rejected')}>
                    Reject
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => onReviewDocument(document, 'approved')}>
                    Approve
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <div className="admin-empty-state">
              <FileWarning size={28} />
              <strong>No uploaded documents yet.</strong>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function CaseModal({ record, resolution, setResolution, currentUser, pending, onClose, onAction }) {
  if (!record) return null;
  const assignable = currentUser?.id || currentUser?._id;
  const active = activeCaseStatuses.has(record.status);
  const resolve = () => onAction(() => api.adminResolveCase(record.id, resolution), 'Case resolved');
  return (
    <Modal
      isOpen={Boolean(record)}
      onClose={onClose}
      title="Manage case"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {active && (
            <Button variant="primary" loading={pending} onClick={resolve}>
              Resolve case
            </Button>
          )}
        </>
      }
    >
      <div className="stack">
        <div>
          <div className="row">
            <Badge variant={record.kind === 'dispute' ? 'danger' : 'info'}>{record.kind || 'support'}</Badge>
            <Badge variant={priorityVariant(record.priority)}>{record.priority || 'normal'}</Badge>
          </div>
          <h3 style={{ marginTop: 'var(--space-2)' }}>{record.title || record.caseNumber}</h3>
          <p className="text-secondary">{record.message || 'No case description supplied.'}</p>
        </div>
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {assignable && !record.assignedTo && (
            <Button
              size="sm"
              variant="secondary"
              loading={pending}
              onClick={() =>
                onAction(
                  () =>
                    api.adminAssignCase(record.id, { assignedTo: assignable, note: 'Claimed from operations console' }),
                  'Case assigned to you'
                )
              }
            >
              Claim case
            </Button>
          )}
          {active && record.status !== 'in_progress' && (
            <Button
              size="sm"
              variant="secondary"
              loading={pending}
              onClick={() =>
                onAction(
                  () => api.adminUpdateCaseStatus(record.id, { status: 'in_progress', note: 'Under active review' }),
                  'Case marked in progress'
                )
              }
            >
              Start work
            </Button>
          )}
          {['resolved', 'dismissed'].includes(record.status) && (
            <Button
              size="sm"
              variant="secondary"
              loading={pending}
              onClick={() =>
                onAction(
                  () => api.adminReopenCase(record.id, { note: 'Reopened from operations console' }),
                  'Case reopened'
                )
              }
            >
              Reopen
            </Button>
          )}
        </div>
        {active && (
          <>
            <div className="divider" />
            <label className="input-group">
              <span className="input-label">Resolution outcome</span>
              <select
                className="input-field"
                value={resolution.outcome}
                onChange={(event) => setResolution({ ...resolution, outcome: event.target.value })}
              >
                <option value="no_action">No action</option>
                <option value="resume_booking">Resume booking</option>
                <option value="cancel_booking">Cancel booking</option>
                <option value="confirm_delivery">Confirm delivery</option>
                <option value="refund_required">Refund required</option>
                <option value="dismissed">Dismiss</option>
              </select>
            </label>
            <Input
              label="Resolution summary"
              value={resolution.summary}
              onChange={(event) => setResolution({ ...resolution, summary: event.target.value })}
              placeholder="Explain the decision and next step"
            />
          </>
        )}
        <div className="stack-sm">
          <h4>Timeline</h4>
          {(record.timeline || [])
            .slice(-5)
            .reverse()
            .map((item, index) => (
              <div className="admin-timeline-row" key={item._id || index}>
                <strong>{item.action}</strong>
                <span>{dateTime(item.createdAt)}</span>
                {item.note && <p>{item.note}</p>}
              </div>
            ))}
        </div>
      </div>
    </Modal>
  );
}
