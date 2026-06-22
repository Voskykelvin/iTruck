import { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, Truck, UserPlus, UsersRound } from 'lucide-react';
import { api } from '../api.js';

const driverName = (driver) =>
  [driver?.firstName, driver?.lastName].filter(Boolean).join(' ') || driver?.email || 'Driver';

export default function DriverOperationsPanel({ fleet = [], notify }) {
  const [drivers, setDrivers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [busy, setBusy] = useState('');
  const [draft, setDraft] = useState({
    email: '',
    phone: '',
    countryCode: '+254',
    country: 'Kenya',
    licenseNumber: ''
  });

  const load = useCallback(async () => {
    try {
      const data = await api.listDrivers();
      setDrivers(data.drivers || []);
      setInvitations(data.invitations || []);
      setAssignments(data.assignments || []);
    } catch (err) {
      notify(err.message || 'Unable to load drivers');
    }
  }, [notify]);

  useEffect(() => {
    load();
  }, [load]);

  async function invite(event) {
    event.preventDefault();
    setBusy('invite');
    try {
      const data = await api.inviteDriver(draft);
      setDraft((current) => ({ ...current, email: '', phone: '', licenseNumber: '' }));
      await load();
      if (data.invitationUrl && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(data.invitationUrl).catch(() => {});
      }
      notify('Driver invitation created; its secure link was copied when supported');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  async function assign(driverId, truckId) {
    if (!truckId) return;
    setBusy(`assign-${driverId}`);
    try {
      await api.assignDriverTruck(driverId, truckId);
      await load();
      notify('Driver assigned to vehicle');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy('');
    }
  }

  async function revoke(invitationId) {
    setBusy(`revoke-${invitationId}`);
    try {
      await api.revokeDriverInvitation(invitationId);
      await load();
      notify('Driver invitation revoked');
    } catch (err) {
      notify(err.message);
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
      <div className="shipment-stack">
        {drivers.map((driver) => {
          const assignment = assignments.find((item) => String(item.driver?._id || item.driver) === String(driver._id));
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
                  <option value="">Choose vehicle</option>
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
