import { useState, useEffect, useRef, useCallback } from 'react';
import { LogOut, CheckCircle2 } from 'lucide-react';
import { api, setSession } from '../api.js';
import DriverInvitationAcceptance from '../components/DriverInvitationAcceptance.jsx';
import PushNotificationControl from '../components/PushNotificationControl.jsx';
import SessionsManager from '../components/SessionsManager.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Panel from '../components/Panel.jsx';
import DocumentSlotButton from '../components/DocumentSlotButton.jsx';
import Input from '../components/Input.jsx';
import AsyncState from '../components/AsyncState.jsx';
import { useCurrentUserPolling } from '../hooks/usePolling.js';
import { useDocumentAction } from '../queries/documents.js';
import { useUpdateProfile } from '../queries/operations.js';
import {
  useNotificationPreferences,
  useSendTestNotification,
  useUpdateNotificationPreferences
} from '../queries/notifications.js';
import {
  roleForUser,
  profileDocumentsForRole,
  defaultNotificationPreferences,
  registrationCountries,
  normalizeProfileDocumentType,
  findProfileDocument,
  documentUploadAccept,
  documentUploadLimitText,
  roleName,
  navigate
} from '../utils/helpers.js';

export default function ProfilePage({ notify, route, user, setUser, signOut }) {
  const [email, setEmail] = useState(user.email || '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [authMode, setAuthMode] = useState('signin');
  const [resetEmail, setResetEmail] = useState(user.email || '');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetBusy, setResetBusy] = useState(false);
  const [resetStatus, setResetStatus] = useState('');
  const [uploadingDocument, setUploadingDocument] = useState('');
  const [pendingDocument, setPendingDocument] = useState('');
  const pendingDocumentRef = useRef('');
  const documentInputRef = useRef(null);
  const profileDocumentUpload = useDocumentAction(({ documentType, file }) =>
    api.uploadProfileDocument(documentType, file)
  );
  const profileUpdate = useUpdateProfile();
  const profileDetailsRef = useRef(null);
  const signedIn = Boolean(user.email);
  const driverInvitationToken = new URLSearchParams(route.split('?')[1] || '').get('driverInvite') || '';
  const activeUserRole = roleForUser(user);
  const verificationItems = profileDocumentsForRole(activeUserRole);
  const [profileDraft, setProfileDraft] = useState(() => ({
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    phone: user.phone || '',
    country: user.country || '',
    company: user.company || ''
  }));
  const [notificationPreferences, setNotificationPreferences] = useState(defaultNotificationPreferences);
  const notificationPreferencesQuery = useNotificationPreferences(user, { enabled: signedIn });
  const updateNotificationPreferencesMutation = useUpdateNotificationPreferences(user);
  const sendTestNotificationMutation = useSendTestNotification();

  useCurrentUserPolling(signedIn, setUser, 30000);

  useEffect(() => {
    if (notificationPreferencesQuery.data) setNotificationPreferences(notificationPreferencesQuery.data);
  }, [notificationPreferencesQuery.data]);

  const selectPendingDocument = useCallback((item) => {
    pendingDocumentRef.current = item;
    setPendingDocument(item);
  }, []);

  useEffect(() => {
    setProfileDraft({
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      phone: user.phone || '',
      country: user.country || '',
      company: user.company || ''
    });
  }, [user.company, user.country, user.email, user.firstName, user.lastName, user.phone]);

  useEffect(() => {
    const params = new URLSearchParams(route.split('?')[1] || '');
    const token = params.get('reset') || '';
    if (!token) return;

    setAuthMode('reset');
    setResetToken(token);
    setResetStatus('');
    setResetEmail(params.get('email') || user.email || email);
  }, [email, route, user.email]);

  useEffect(() => {
    const requestedDocument = new URLSearchParams(route.split('?')[1] || '').get('document');
    if (!requestedDocument) return;

    if (!user.email) {
      notify('Sign in before uploading verification documents');
      return;
    }

    selectPendingDocument(requestedDocument);
    const timer = window.setTimeout(() => documentInputRef.current?.click(), 250);
    return () => window.clearTimeout(timer);
  }, [notify, route, selectPendingDocument, user.email]);

  useEffect(() => {
    const focusTarget = new URLSearchParams(route.split('?')[1] || '').get('complete');
    if (focusTarget !== 'details' || !user.email) return;

    const timer = window.setTimeout(() => {
      profileDetailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      profileDetailsRef.current?.querySelector('input')?.focus();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [route, user.email]);

  // Registration state
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regCountry, setRegCountry] = useState(registrationCountries[0][0]);
  const [regCountryCode, setRegCountryCode] = useState(registrationCountries[0][1]);
  const [regRole, setRegRole] = useState('client');
  const [regBusy, setRegBusy] = useState(false);

  async function register(event) {
    event.preventDefault();
    if (
      !regFirstName.trim() ||
      !regLastName.trim() ||
      !regEmail.trim() ||
      !regPassword.trim() ||
      !regPhone.trim() ||
      !regCountry
    ) {
      notify('Complete every account field');
      return;
    }
    setRegBusy(true);
    try {
      const data = await api.register(regRole, {
        email: regEmail,
        password: regPassword,
        firstName: regFirstName,
        lastName: regLastName,
        phone: regPhone,
        country: regCountry,
        countryCode: regCountryCode
      });
      setSession(data);
      setUser(data.user);
      notify(`Account created — welcome to iTruck`);
    } catch (err) {
      notify(err.message);
    } finally {
      setRegBusy(false);
    }
  }

  async function login(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api.login({ email, password });
      setSession(data);
      setUser(data.user);
      notify('Signed in');
    } catch (err) {
      notify(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function requestPasswordReset(event) {
    event.preventDefault();
    setResetBusy(true);
    try {
      const data = await api.requestPasswordReset({ email: resetEmail || email });
      const message = data.message || 'If that email exists, password reset instructions have been sent.';
      setResetStatus('reset-requested');
      notify(message);
      setAuthMode('signin');
    } catch (err) {
      setResetStatus('');
      notify(err.message);
    } finally {
      setResetBusy(false);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    setResetBusy(true);
    try {
      if (!resetToken) throw new Error('Missing reset token in URL');
      const data = await api.resetPassword({ email: resetEmail || email, token: resetToken, password: newPassword });
      setPassword('');
      setNewPassword('');
      setResetStatus('');
      setAuthMode('signin');
      notify(data.message || 'Password updated. Sign in with your new password.');
    } catch (err) {
      setResetStatus('');
      notify(err.message);
    } finally {
      setResetBusy(false);
    }
  }

  function openVerificationUpload(item) {
    if (!user.email) {
      notify('Sign in before uploading verification documents');
      return;
    }

    selectPendingDocument(item);
    documentInputRef.current?.click();
  }

  async function uploadVerificationDocument(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    const documentType = pendingDocumentRef.current || pendingDocument;
    if (!file || !documentType) return;

    setUploadingDocument(documentType);
    try {
      const data = await profileDocumentUpload.mutateAsync({
        documentType: normalizeProfileDocumentType(documentType, activeUserRole),
        file
      });
      if (data.user) {
        setSession({ user: data.user });
        setUser(data.user);
      }
      notify(`${documentType} uploaded for review`);
    } catch (err) {
      notify(err.message);
    } finally {
      setUploadingDocument('');
    }
  }

  function updateProfileDraft(key, value) {
    setProfileDraft((current) => ({ ...current, [key]: value }));
  }

  async function saveProfileDetails(event) {
    event.preventDefault();
    try {
      const payload = Object.fromEntries(
        Object.entries(profileDraft).map(([key, value]) => [key, String(value || '').trim()])
      );
      const data = await profileUpdate.mutateAsync(payload);
      if (data.user) {
        setSession({ user: data.user });
        setUser(data.user);
      }
      notify('Profile details updated');
    } catch (err) {
      notify(err.message);
    }
  }

  function updateNotificationPreference(section, key, value) {
    setNotificationPreferences((current) => ({
      ...current,
      [section]: {
        ...current[section],
        [key]: value
      }
    }));
  }

  async function saveNotificationPreferences(event) {
    event.preventDefault();
    try {
      const data = await updateNotificationPreferencesMutation.mutateAsync(notificationPreferences);
      if (data.preferences) setNotificationPreferences(data.preferences);
      notify('Notification preferences saved');
    } catch (err) {
      notify(err.message || 'Unable to save notification preferences');
    }
  }

  async function sendNotificationTest() {
    try {
      await sendTestNotificationMutation.mutateAsync();
      notify('Test notification queued');
    } catch (err) {
      notify(err.message || 'Unable to queue test notification');
    }
  }

  if (!signedIn && driverInvitationToken) {
    return (
      <section className="profile-layout auth-only">
        <DriverInvitationAcceptance
          token={driverInvitationToken}
          notify={notify}
          onAccepted={() => navigate('/app/profile')}
        />
      </section>
    );
  }

  return (
    <section className={`profile-layout ${signedIn ? '' : 'auth-only'}`}>
      <Panel title={signedIn ? 'Account' : 'Sign in'} eyebrow={signedIn ? 'Session' : 'Access'}>
        {signedIn ? (
          <div className="account-summary">
            <div>
              <StatusBadge tone={user.isVerified ? 'success' : 'warn'}>{roleName(activeUserRole)}</StatusBadge>
              <strong>{[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}</strong>
              <span>{user.email}</span>
              <small>{user.country || 'Country pending'}</small>
            </div>
            <button className="ghost compact-button icon-label" type="button" onClick={signOut}>
              <LogOut size={16} />
              <span>Sign out</span>
            </button>
          </div>
        ) : (
          <div className="auth-card">
            <div className="auth-copy">
              <h3>{authMode === 'reset' ? 'Create a new password' : 'Welcome back'}</h3>
              <p>Access your iTruck workspace with your account credentials.</p>
            </div>

            <div className="auth-controls">
              {authMode === 'forgot' ? (
                <form className="auth-form" onSubmit={requestPasswordReset}>
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={resetEmail}
                      autoComplete="email"
                      onChange={(event) => setResetEmail(event.target.value)}
                    />
                  </label>
                  {resetStatus === 'reset-requested' ? (
                    <p className="muted-note">Check your inbox for the reset link.</p>
                  ) : null}
                  <div className="auth-actions">
                    <button className="primary auth-submit" type="submit" disabled={resetBusy}>
                      {resetBusy ? 'Sending...' : 'Send reset link'}
                    </button>
                    <button className="text-button" type="button" onClick={() => setAuthMode('signin')}>
                      Back to sign in
                    </button>
                  </div>
                </form>
              ) : authMode === 'reset' ? (
                <form className="auth-form" onSubmit={resetPassword}>
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={resetEmail}
                      autoComplete="email"
                      onChange={(event) => setResetEmail(event.target.value)}
                    />
                  </label>
                  {resetToken ? null : <p className="muted-note">Reset token is missing or invalid.</p>}
                  <label className="field">
                    <span>New password</span>
                    <input
                      type="password"
                      value={newPassword}
                      autoComplete="new-password"
                      onChange={(event) => setNewPassword(event.target.value)}
                    />
                  </label>
                  <div className="auth-actions">
                    <button className="primary auth-submit" type="submit" disabled={resetBusy || !resetToken}>
                      {resetBusy ? 'Updating...' : 'Update password'}
                    </button>
                    <button className="text-button" type="button" onClick={() => setAuthMode('signin')}>
                      Back to sign in
                    </button>
                  </div>
                </form>
              ) : authMode === 'signup' ? (
                <form className="auth-form" onSubmit={register}>
                  <label className="field">
                    <span>First name</span>
                    <input
                      type="text"
                      value={regFirstName}
                      autoComplete="given-name"
                      required
                      onChange={(event) => setRegFirstName(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Last name</span>
                    <input
                      type="text"
                      value={regLastName}
                      autoComplete="family-name"
                      required
                      onChange={(event) => setRegLastName(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={regEmail}
                      autoComplete="email"
                      required
                      onChange={(event) => setRegEmail(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Phone</span>
                    <div className="phone-input-row">
                      <select
                        value={regCountryCode}
                        aria-label="Country dial code"
                        required
                        onChange={(event) => {
                          const country = registrationCountries.find(([, code]) => code === event.target.value);
                          setRegCountryCode(event.target.value);
                          if (country) setRegCountry(country[0]);
                        }}
                      >
                        {registrationCountries.map(([country, code]) => (
                          <option key={code} value={code}>
                            {code} {country}
                          </option>
                        ))}
                      </select>
                      <input
                        type="tel"
                        value={regPhone}
                        autoComplete="tel-national"
                        required
                        onChange={(event) => setRegPhone(event.target.value)}
                      />
                    </div>
                  </label>
                  <label className="field">
                    <span>Country</span>
                    <select
                      value={regCountry}
                      required
                      onChange={(event) => {
                        const country = registrationCountries.find(([name]) => name === event.target.value);
                        setRegCountry(event.target.value);
                        if (country) setRegCountryCode(country[1]);
                      }}
                    >
                      {registrationCountries.map(([country]) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Password</span>
                    <input
                      type="password"
                      value={regPassword}
                      autoComplete="new-password"
                      minLength={8}
                      required
                      onChange={(event) => setRegPassword(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Role</span>
                    <select value={regRole} onChange={(event) => setRegRole(event.target.value)}>
                      <option value="client">Shipper</option>
                      <option value="owner">Fleet Owner</option>
                    </select>
                  </label>
                  <div className="auth-actions">
                    <button className="primary auth-submit" type="submit" disabled={regBusy}>
                      {regBusy ? 'Creating...' : 'Create account'}
                    </button>
                    <button className="text-button" type="button" onClick={() => setAuthMode('signin')}>
                      Back to sign in
                    </button>
                  </div>
                </form>
              ) : (
                <form className="auth-form" onSubmit={login}>
                  <label className="field">
                    <span>Email</span>
                    <input
                      type="email"
                      value={email}
                      autoComplete="email"
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setResetEmail(event.target.value);
                      }}
                    />
                  </label>
                  <label className="field">
                    <span>Password</span>
                    <input
                      type="password"
                      value={password}
                      autoComplete="current-password"
                      onChange={(event) => setPassword(event.target.value)}
                    />
                  </label>
                  <div className="auth-actions">
                    <button className="primary auth-submit" type="submit" disabled={busy}>
                      {busy ? 'Signing in...' : 'Sign in'}
                    </button>
                    <button
                      className="text-button"
                      type="button"
                      onClick={() => {
                        setResetEmail(email);
                        setAuthMode('forgot');
                      }}
                    >
                      Forgot password?
                    </button>
                    <button className="text-button" type="button" onClick={() => setAuthMode('signup')}>
                      Create account
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </Panel>
      {signedIn ? (
        <div ref={profileDetailsRef}>
          <Panel title="Profile Details" eyebrow="Completion">
            <form className="modal-form" onSubmit={saveProfileDetails}>
              <div className="form-grid">
                <Input
                  label="First name"
                  value={profileDraft.firstName}
                  onChange={(value) => updateProfileDraft('firstName', value)}
                />
                <Input
                  label="Last name"
                  value={profileDraft.lastName}
                  onChange={(value) => updateProfileDraft('lastName', value)}
                />
                <Input
                  label="Phone"
                  value={profileDraft.phone}
                  onChange={(value) => updateProfileDraft('phone', value)}
                />
                <Input
                  label="Country"
                  value={profileDraft.country}
                  onChange={(value) => updateProfileDraft('country', value)}
                />
                <Input
                  label="Company"
                  value={profileDraft.company}
                  onChange={(value) => updateProfileDraft('company', value)}
                />
              </div>
              <button className="primary icon-label" type="submit" disabled={profileUpdate.isPending}>
                <CheckCircle2 size={18} />
                <span>{profileUpdate.isPending ? 'Saving...' : 'Save details'}</span>
              </button>
            </form>
          </Panel>
        </div>
      ) : null}
      {signedIn && verificationItems.length ? (
        <Panel title="Verification" eyebrow="Trust">
          <input
            ref={documentInputRef}
            type="file"
            accept={documentUploadAccept}
            onChange={uploadVerificationDocument}
            style={{ display: 'none' }}
          />
          <div className="verification-card">
            <CheckCircle2 size={28} />
            <strong>{[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}</strong>
            <span>
              {roleName(activeUserRole)} - {user.country || 'Local workspace'}
            </span>
          </div>
          <div style={{ display: 'grid', gap: '6px', margin: '6px 0' }}>
            {verificationItems.map((item) => {
              const existingDoc = findProfileDocument(user.documents || [], item, activeUserRole);
              const docStatus = existingDoc ? existingDoc.status : 'missing';
              const isBusy = uploadingDocument === item;
              return (
                <DocumentSlotButton
                  key={item}
                  label={item}
                  status={docStatus}
                  busy={isBusy}
                  disabled={Boolean(uploadingDocument) || docStatus === 'approved'}
                  labels={{
                    approved: 'Verified',
                    pending: 'Under Review',
                    rejected: 'Rejected - Re-upload',
                    expired: 'Expired - Re-upload',
                    missing: 'Upload'
                  }}
                  onClick={() => openVerificationUpload(item)}
                  title={docStatus === 'approved' ? `${item} already verified` : `Click to upload ${item}`}
                />
              );
            })}
          </div>
          <p className="muted-note">{documentUploadLimitText}. Admin reviews uploaded files from the console.</p>
        </Panel>
      ) : null}
      {signedIn ? (
        <Panel title="Notifications" eyebrow="Preferences">
          {notificationPreferencesQuery.isPending ? (
            <AsyncState compact title="Loading notification preferences..." />
          ) : null}
          {notificationPreferencesQuery.isError ? (
            <AsyncState
              compact
              title="Notification preferences unavailable"
              detail={notificationPreferencesQuery.error?.message}
              onRetry={() => notificationPreferencesQuery.refetch()}
            />
          ) : null}
          {!notificationPreferencesQuery.isError ? (
            <form className="notification-preferences" onSubmit={saveNotificationPreferences}>
              <div>
                <strong>Delivery channels</strong>
                <span>In-app alerts are immediate. Email and SMS are delivered by the configured providers.</span>
              </div>
              <div className="preference-toggle-grid">
                {[
                  ['inApp', 'In-app'],
                  ['email', 'Email'],
                  ['sms', 'SMS']
                ].map(([key, label]) => (
                  <label className="preference-toggle" key={key}>
                    <input
                      type="checkbox"
                      checked={Boolean(notificationPreferences.channels?.[key])}
                      onChange={(event) => updateNotificationPreference('channels', key, event.target.checked)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              <PushNotificationControl
                notify={notify}
                onChange={(enabled) => updateNotificationPreference('channels', 'push', enabled)}
              />

              <div>
                <strong>Events</strong>
                <span>Choose which activity can use your enabled channels.</span>
              </div>
              <div className="preference-toggle-grid">
                {[
                  ['bookings', 'Bookings and bids'],
                  ['tracking', 'Tracking and delivery'],
                  ['documents', 'Documents and verification'],
                  ['payments', 'Payments'],
                  ['security', 'Security'],
                  ['system', 'System notices'],
                  ['marketing', 'Product announcements']
                ].map(([key, label]) => (
                  <label className="preference-toggle" key={key}>
                    <input
                      type="checkbox"
                      checked={Boolean(notificationPreferences.categories?.[key])}
                      onChange={(event) => updateNotificationPreference('categories', key, event.target.checked)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>

              <label className="preference-toggle quiet-hours-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(notificationPreferences.quietHours?.enabled)}
                  onChange={(event) => updateNotificationPreference('quietHours', 'enabled', event.target.checked)}
                />
                <span>Use quiet hours</span>
              </label>
              {notificationPreferences.quietHours?.enabled ? (
                <div className="form-grid">
                  <label className="field">
                    <span>From</span>
                    <input
                      type="time"
                      value={notificationPreferences.quietHours.start}
                      onChange={(event) => updateNotificationPreference('quietHours', 'start', event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Until</span>
                    <input
                      type="time"
                      value={notificationPreferences.quietHours.end}
                      onChange={(event) => updateNotificationPreference('quietHours', 'end', event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Timezone</span>
                    <input
                      value={notificationPreferences.quietHours.timezone}
                      onChange={(event) => updateNotificationPreference('quietHours', 'timezone', event.target.value)}
                    />
                  </label>
                  <label className="preference-toggle">
                    <input
                      type="checkbox"
                      checked={Boolean(notificationPreferences.quietHours.allowHighPriority)}
                      onChange={(event) =>
                        updateNotificationPreference('quietHours', 'allowHighPriority', event.target.checked)
                      }
                    />
                    <span>Allow urgent alerts during quiet hours</span>
                  </label>
                </div>
              ) : null}
              <div className="notification-preference-actions">
                <button
                  className="primary"
                  type="submit"
                  disabled={notificationPreferencesQuery.isPending || updateNotificationPreferencesMutation.isPending}
                >
                  {updateNotificationPreferencesMutation.isPending ? 'Saving...' : 'Save preferences'}
                </button>
                <button
                  className="ghost"
                  type="button"
                  disabled={notificationPreferencesQuery.isPending || sendTestNotificationMutation.isPending}
                  onClick={sendNotificationTest}
                >
                  {sendTestNotificationMutation.isPending ? 'Queuing...' : 'Send test'}
                </button>
              </div>
            </form>
          ) : null}
        </Panel>
      ) : null}
      {signedIn ? (
        <Panel title="Active Sessions" eyebrow="Security">
          <SessionsManager notify={notify} />
        </Panel>
      ) : null}
    </section>
  );
}
