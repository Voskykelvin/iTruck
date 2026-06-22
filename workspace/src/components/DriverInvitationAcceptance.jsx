import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { api } from '../api.js';

export default function DriverInvitationAcceptance({ token, notify, onAccepted }) {
  const [invitation, setInvitation] = useState(null);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ firstName: '', lastName: '', password: '', licenseNumber: '' });

  useEffect(() => {
    api
      .driverInvitation(token)
      .then((data) => setInvitation(data.invitation))
      .catch((err) => notify(err.message));
  }, [notify, token]);

  async function accept(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api.acceptDriverInvitation(token, draft);
      notify(data.message || 'Driver account created');
      onAccepted?.(data.user);
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel driver-invitation-card">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Secure Fleet Invitation</p>
          <h2>Create Driver Account</h2>
        </div>
        <ShieldCheck size={22} />
      </div>
      <p className="muted-note">
        {invitation
          ? `${invitation.owner?.company || invitation.owner?.firstName || 'A fleet owner'} invited ${
              invitation.email
            }. This account can access only assigned jobs.`
          : 'Validating invitation...'}
      </p>
      <form className="auth-form" onSubmit={accept}>
        {[
          ['firstName', 'First name', 'text'],
          ['lastName', 'Last name', 'text'],
          ['licenseNumber', 'License number', 'text'],
          ['password', 'Password', 'password']
        ].map(([key, label, type]) => (
          <label className="field" key={key}>
            <span>{label}</span>
            <input
              type={type}
              minLength={key === 'password' ? 8 : undefined}
              required={key !== 'licenseNumber'}
              value={draft[key]}
              onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
            />
          </label>
        ))}
        <button className="primary full" type="submit" disabled={busy || !invitation}>
          {busy ? 'Creating...' : 'Create Driver Account'}
        </button>
      </form>
    </section>
  );
}
