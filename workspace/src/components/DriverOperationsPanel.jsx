import { useState } from 'react';
import { ShieldCheck, Truck, UserPlus, UsersRound } from 'lucide-react';
import { api } from '../api.js';
import { useDriverAction, useDriverOperations } from '../queries/operations.js';
import AsyncState from './AsyncState.jsx';

const driverName = (driver) =>
  [driver?.firstName, driver?.lastName].filter(Boolean).join(' ') || driver?.email || 'Driver';

export default function DriverOperationsPanel({ fleet = [], notify }) {
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState({
    email: '',
    phone: '',
    countryCode: '+254',
    country: 'Kenya',
    licenseNumber: ''
  });
  const driversQuery = useDriverOperations();
  const inviteDriver = useDriverAction((payload) => api.inviteDriver(payload));
  const assignDriver = useDriverAction(({ driverId, truckId }) => api.assignDriverTruck(driverId, truckId));
  const unassignDriver = useDriverAction(({ driverId }) =>
    api.unassignDriverTruck(driverId, 'Unassigned by fleet owner')
  );
  const revokeInvitation = useDriverAction((invitationId) => api.revokeDriverInvitation(invitationId));
  const { drivers = [], invitations = [], assignments = [] } = driversQuery.data || {};

  async function invite(event) {
    event.preventDefault();
    setBusy('invite');
    try {
      const data = await inviteDriver.mutateAsync(draft);
      setDraft((current) => ({ ...current, email: '', phone: '', licenseNumber: '' }));
      if (data.invitationUrl && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(data.invitationUrl).catch(() => {});
      }
      notify('Driver invitation created; its secure link was copied when supported');
    } catch (err) {
      notify(err.message || 'Driver invitation was not created');
    } finally {
      setBusy('');
    }
  }

  async function assign(driverId, truckId) {
    setBusy(`assign-${driverId}`);
    try {
      if (truckId) {
        await assignDriver.mutateAsync({ driverId, truckId });
        notify('Driver assigned to vehicle');
      } else {
        await unassignDriver.mutateAsync({ driverId });
        notify('Driver removed from vehicle');
      }
    } catch (err) {
      notify(err.message || 'Driver assignment was not updated');
    } finally {
      setBusy('');
    }
  }

  async function revoke(invitationId) {
    setBusy(`revoke-${invitationId}`);
    try {
      await revokeInvitation.mutateAsync(invitationId);
      notify('Driver invitation revoked');
    } catch (err) {
      notify(err.message || 'Driver invitation was not revoked');
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Fleet Access</p>
          <h2>Drivers</h2>
        </div>
        <UsersRound size={20} />
      </div>
      <form className="payout-form" onSubmit={invite}>
        <div className="form-grid two">
          {[
            ['email', 'Driver email', 'email'],
            ['phone', 'Driver phone', 'tel'],
            ['country', 'Country', 'text'],
            ['licenseNumber', 'License number', 'text']
          ].map(([key, label, type]) => (
            <label className="field" key={key}>
              <span>{label}</span>
              <input
                type={type}
                required={key !== 'licenseNumber'}
                value={draft[key]}
                onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
              />
            </label>
          ))}
        </div>
        <button className="secondary icon-label" type="submit" disabled={busy === 'invite'}>
          <UserPlus size={17} />
          <span>{busy === 'invite' ? 'Inviting...' : 'Invite Driver'}</span>
        </button>
      </form>

      {driversQuery.isPending ? (
        <AsyncState compact title="Loading drivers..." detail="Checking invitations and vehicle assignments." />
      ) : driversQuery.isError ? (
        <AsyncState
          compact
          title="Drivers could not be loaded"
          detail={driversQuery.error?.message || 'Try loading your fleet access records again.'}
          onRetry={() => driversQuery.refetch()}
        />
      ) : (
        <div className="shipment-stack">
          {drivers.map((driver) => {
            const assignment = assignments.find(
              (item) => String(item.driver?._id || item.driver) === String(driver._id)
            );
            return (
              <article className="shipment-row" key={driver._id}>
                <div>
                  <span className="badge success">
                    <ShieldCheck size={12} /> Active driver
                  </span>
                  <h3>{driverName(driver)}</h3>
                  <p>{driver.email}</p>
                  <small>{assignment?.truck?.plateNumber || 'No vehicle assigned'}</small>
                </div>
                <label className="field compact-driver-select">
                  <span>
                    <Truck size={13} /> Vehicle
                  </span>
                  <select
                    value={assignment?.truck?._id || ''}
                    disabled={busy === `assign-${driver._id}`}
                    onChange={(event) => assign(driver._id, event.target.value)}
                  >
                    <option value="">{assignment ? 'Remove vehicle assignment' : 'Choose vehicle'}</option>
                    {fleet.map((truck) => (
                      <option key={truck.id} value={truck.id}>
                        {truck.plate} · {truck.name}
                      </option>
                    ))}
                  </select>
                </label>
              </article>
            );
          })}
          {!drivers.length ? <p className="muted-note">Invite a driver to create a job-scoped account.</p> : null}
        </div>
      )}

      {invitations
        .filter((item) => item.status === 'pending')
        .map((invitation) => (
          <button
            className="action-item"
            type="button"
            key={invitation._id}
            disabled={busy === `revoke-${invitation._id}`}
            onClick={() => revoke(invitation._id)}
          >
            {invitation.email} · expires {new Date(invitation.expiresAt).toLocaleDateString()} · Revoke
          </button>
        ))}
    </section>
  );
}
