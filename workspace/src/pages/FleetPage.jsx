import { useState } from 'react';
import {
  useFleetTrucks,
  useRemoveFleetTruck,
  useDrivers,
  useInviteDriver,
  useRevokeDriverInvitation
} from '../queries/commercial';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import Skeleton from '../components/ui/Skeleton';
import Badge from '../components/ui/Badge';
import Modal from '../components/ui/Modal';
import Tabs from '../components/ui/Tabs';
import { Search, Plus, Truck, Trash2, ShieldCheck, Star, Users, UserPlus, Mail } from 'lucide-react';
import { ratingSummary } from '../utils/helpers';
import { useToast } from '../components/ui/Toast';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import VehicleDetailPanel from '../components/domain/VehicleDetailPanel';

function VehiclesTab({ trucks, isLoading, search, onAddClick }) {
  const removeTruck = useRemoveFleetTruck();
  const { addToast } = useToast();
  const [selectedTruck, setSelectedTruck] = useState(null);

  const filteredTrucks = trucks.filter(
    (t) =>
      !search ||
      t.name?.toLowerCase().includes(search.toLowerCase()) ||
      t.plateNumber?.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = (id) => {
    if (confirm('Are you sure you want to remove this truck from your fleet?')) {
      removeTruck.mutate(id, {
        onSuccess: () => addToast({ title: 'Truck Removed', message: 'Vehicle removed successfully.', type: 'info' }),
        onError: (err) => addToast({ title: 'Error', message: err.message, type: 'error' })
      });
    }
  };

  if (isLoading) {
    return (
      <div className="grid-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} style={{ height: 200 }} />
        ))}
      </div>
    );
  }

  if (filteredTrucks.length === 0) {
    return (
      <EmptyState
        icon={Truck}
        title="No vehicles found"
        description={
          search
            ? "We couldn't find any vehicles matching your search."
            : "You don't have any vehicles in your fleet yet."
        }
        action={
          !search && (
            <Button variant="primary" onClick={onAddClick}>
              Add your first vehicle
            </Button>
          )
        }
      />
    );
  }

  return (
    <div className="grid-3">
      {filteredTrucks.map((truck) => (
        <Card
          key={truck.id}
          className="stack-sm hover-lift"
          style={{ cursor: 'pointer' }}
          onClick={() => setSelectedTruck(truck)}
        >
          <div className="row-between">
            <div className="row">
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 'var(--radius)',
                  background: 'var(--brand-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--brand)'
                }}
              >
                <Truck size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{truck.name}</div>
                <div className="text-muted mono" style={{ fontSize: 'var(--text-xs)' }}>
                  {truck.plateNumber || truck.id.substring(0, 8)}
                </div>
              </div>
            </div>
            <button
              className="btn btn-ghost"
              style={{ padding: 4 }}
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(truck.id);
              }}
            >
              <Trash2 size={16} color="var(--danger)" />
            </button>
          </div>

          <div className="divider" style={{ margin: 'var(--space-2) 0' }} />

          <div className="row-between text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
            <span>Type</span>
            <span style={{ color: 'var(--ink)' }}>{truck.company || truck.capacity || 'Lorry'}</span>
          </div>

          <div className="row-between text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
            <span>Status</span>
            <Badge variant={truck.verified ? 'success' : 'warning'} icon={truck.verified ? ShieldCheck : undefined}>
              {truck.verified ? 'Verified' : 'Pending'}
            </Badge>
          </div>

          <div className="row-between text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
            <span>Rating</span>
            <div className="row text-ink">
              <Star size={14} color="var(--mustard)" fill="var(--mustard)" />
              <span>{ratingSummary(truck)}</span>
            </div>
          </div>
        </Card>
      ))}
      <VehicleDetailPanel
        isOpen={Boolean(selectedTruck)}
        onClose={() => setSelectedTruck(null)}
        truck={selectedTruck}
      />
    </div>
  );
}

function DriversTab({ search, onInviteClick }) {
  const { data, isLoading } = useDrivers();
  const revokeInvite = useRevokeDriverInvitation();
  const { addToast } = useToast();

  const drivers = data?.drivers || [];
  const invitations = data?.invitations || [];

  const filteredDrivers = drivers.filter(
    (d) =>
      !search ||
      `${d.firstName} ${d.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
      d.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleRevoke = (id) => {
    if (confirm('Revoke this driver invitation?')) {
      revokeInvite.mutate(id, {
        onSuccess: () => addToast({ title: 'Invitation Revoked', type: 'info' })
      });
    }
  };

  if (isLoading) return <Skeleton style={{ height: 200 }} />;

  if (drivers.length === 0 && invitations.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No drivers yet"
        description="Invite drivers to join your fleet and assign them to vehicles."
        action={
          <Button variant="primary" icon={UserPlus} onClick={onInviteClick}>
            Invite a Driver
          </Button>
        }
      />
    );
  }

  return (
    <div className="stack-lg">
      {invitations.length > 0 && (
        <Card className="stack">
          <h3 className="eyebrow" style={{ margin: 0 }}>
            Pending Invitations
          </h3>
          <div className="stack-sm">
            {invitations.map((inv) => (
              <div
                key={inv._id}
                className="row-between"
                style={{ padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border)' }}
              >
                <div className="row">
                  <Mail size={16} color="var(--text-muted)" />
                  <div style={{ marginLeft: 'var(--space-3)' }}>
                    <div style={{ fontWeight: 500, color: 'var(--ink)' }}>{inv.email}</div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      Sent {new Date(inv.lastSentAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="row">
                  <Badge variant="warning">Pending</Badge>
                  <Button variant="ghost" size="sm" onClick={() => handleRevoke(inv._id)}>
                    Revoke
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {filteredDrivers.length > 0 && (
        <Card className="stack">
          <h3 className="eyebrow" style={{ margin: 0 }}>
            Active Drivers
          </h3>
          <div className="stack-sm">
            {filteredDrivers.map((driver) => (
              <div
                key={driver._id}
                className="row-between"
                style={{ padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border)' }}
              >
                <div className="row">
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: '50%',
                      background: 'var(--surface-2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 600,
                      color: 'var(--text-muted)'
                    }}
                  >
                    {driver.firstName?.[0]}
                    {driver.lastName?.[0]}
                  </div>
                  <div style={{ marginLeft: 'var(--space-3)' }}>
                    <div style={{ fontWeight: 500, color: 'var(--ink)' }}>
                      {driver.firstName} {driver.lastName}
                    </div>
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                      {driver.email} • {driver.phone}
                    </div>
                  </div>
                </div>
                <Badge variant={driver.isActive ? 'success' : 'secondary'}>
                  {driver.isActive ? 'Active' : 'Inactive'}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

export default function FleetPage() {
  const { data: trucks = [], isLoading } = useFleetTrucks();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const inviteDriver = useInviteDriver();

  const [search, setSearch] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTruck, setNewTruck] = useState({ name: '', plateNumber: '', type: 'Lorry', capacity: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');

  const handleAddTruck = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await api.createTruck({
        name: newTruck.name,
        type: newTruck.type,
        plateNumber: newTruck.plateNumber,
        capacityTonnes: Number(newTruck.capacity)
      });
      queryClient.invalidateQueries({ queryKey: ['commercial', 'fleet'] });
      setIsAddModalOpen(false);
      setNewTruck({ name: '', plateNumber: '', type: 'Lorry', capacity: '' });
      addToast({ title: 'Truck Added', message: 'Your vehicle has been added to the fleet.', type: 'success' });
    } catch (err) {
      addToast({ title: 'Failed to add truck', message: err.message, type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInviteDriver = (e) => {
    e.preventDefault();
    inviteDriver.mutate(
      { email: inviteEmail },
      {
        onSuccess: () => {
          setIsInviteModalOpen(false);
          setInviteEmail('');
          addToast({ title: 'Invitation Sent', message: `An email has been sent to ${inviteEmail}`, type: 'success' });
        },
        onError: (err) => addToast({ title: 'Invitation Failed', message: err.message, type: 'error' })
      }
    );
  };

  return (
    <div className="animate-fade-in stack-lg">
      <div className="page-header" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div className="row-between" style={{ marginBottom: 'var(--space-4)' }}>
          <div>
            <h1 className="page-title">My Fleet</h1>
            <p className="text-secondary">Manage your vehicles and drivers.</p>
          </div>

          <div className="row">
            <Button variant="secondary" icon={UserPlus} onClick={() => setIsInviteModalOpen(true)}>
              Invite Driver
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setIsAddModalOpen(true)}>
              Add Vehicle
            </Button>
          </div>
        </div>

        <div className="input-group" style={{ margin: 0, position: 'relative', maxWidth: 400 }}>
          <Search
            size={20}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            className="input-field"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 'var(--space-10)' }}
          />
        </div>
      </div>

      <Tabs
        tabs={[
          {
            id: 'vehicles',
            label: 'Vehicles',
            content: (
              <VehiclesTab
                trucks={trucks}
                isLoading={isLoading}
                search={search}
                onAddClick={() => setIsAddModalOpen(true)}
              />
            )
          },
          {
            id: 'drivers',
            label: 'Drivers',
            content: <DriversTab search={search} onInviteClick={() => setIsInviteModalOpen(true)} />
          }
        ]}
      />

      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add Vehicle">
        <form onSubmit={handleAddTruck} className="stack">
          <Input
            label="Vehicle Name / Model"
            required
            placeholder="e.g. Volvo FH16"
            value={newTruck.name}
            onChange={(e) => setNewTruck({ ...newTruck, name: e.target.value })}
          />
          <Input
            label="License Plate Number"
            required
            placeholder="e.g. KCA 123A"
            value={newTruck.plateNumber}
            onChange={(e) => setNewTruck({ ...newTruck, plateNumber: e.target.value })}
          />
          <div className="grid-2">
            <div className="input-group">
              <label className="input-label">Vehicle Type</label>
              <select
                className="input-field"
                value={newTruck.type}
                onChange={(e) => setNewTruck({ ...newTruck, type: e.target.value })}
              >
                <option value="Lorry">Lorry</option>
                <option value="Trailer">Trailer</option>
                <option value="Refrigerated">Refrigerated</option>
              </select>
            </div>
            <Input
              label="Capacity (Tonnes)"
              type="number"
              required
              placeholder="e.g. 15"
              value={newTruck.capacity}
              onChange={(e) => setNewTruck({ ...newTruck, capacity: e.target.value })}
            />
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
            <Button type="button" variant="ghost" onClick={() => setIsAddModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={isSubmitting}>
              Add Vehicle
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isInviteModalOpen} onClose={() => setIsInviteModalOpen(false)} title="Invite Driver">
        <form onSubmit={handleInviteDriver} className="stack">
          <p className="text-secondary">Send an invitation link to a driver so they can join your fleet on iTruck.</p>
          <Input
            label="Email Address"
            type="email"
            required
            placeholder="driver@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
          />
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
            <Button type="button" variant="ghost" onClick={() => setIsInviteModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={inviteDriver.isPending}>
              Send Invitation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
