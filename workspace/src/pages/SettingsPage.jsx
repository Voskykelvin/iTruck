import { useState, useEffect } from 'react';
import { useProfile, useUpdateProfile } from '../queries/operations';
import { useSessionBootstrap, useLogout, useRevokeSession, useRevokeOtherSessions } from '../queries/session';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { User, Shield, LogOut, Laptop, Smartphone } from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import PushNotificationControl from '../components/domain/PushNotificationControl';

export default function SettingsPage() {
  const { data: user } = useSessionBootstrap();
  const { data: profile } = useProfile(user);
  const updateProfile = useUpdateProfile();

  const logout = useLogout();
  const revokeSession = useRevokeSession();
  const revokeOther = useRevokeOtherSessions();
  const { addToast } = useToast();

  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    companyName: ''
  });

  useEffect(() => {
    if (profile) {
      setFormData({
        firstName: profile.firstName || '',
        lastName: profile.lastName || '',
        companyName: profile.companyName || ''
      });
    }
  }, [profile]);

  const handleUpdate = (e) => {
    e.preventDefault();
    updateProfile.mutate(formData, {
      onSuccess: () =>
        addToast({ title: 'Profile Updated', message: 'Your settings have been saved.', type: 'success' }),
      onError: (err) => addToast({ title: 'Update Failed', message: err.message, type: 'error' })
    });
  };

  const sessions = profile?.sessions || [];

  return (
    <div className="animate-fade-in stack-lg">
      <div className="page-header" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <h1 className="page-title">Settings</h1>
        <p className="text-secondary">Manage your account preferences and security.</p>
      </div>

      <div className="grid-2" style={{ alignItems: 'flex-start' }}>
        <div className="stack">
          <Card className="stack">
            <div className="row" style={{ gap: 'var(--space-3)' }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  background: 'var(--brand-soft)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--brand)'
                }}
              >
                <User size={32} />
              </div>
              <div>
                <h2 style={{ fontSize: 'var(--text-xl)', margin: 0 }}>
                  {profile?.firstName} {profile?.lastName}
                </h2>
                <div className="text-secondary">{profile?.email}</div>
                <Badge variant="info" style={{ marginTop: 'var(--space-1)' }}>
                  {profile?.role}
                </Badge>
              </div>
            </div>

            <div className="divider" />

            <form onSubmit={handleUpdate} className="stack">
              <h3 style={{ fontSize: 'var(--text-md)', margin: 0 }}>Personal Information</h3>
              <div className="settings-form-grid">
                <Input
                  label="First Name"
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                />
                <Input
                  label="Last Name"
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                />
              </div>

              {profile?.role === 'owner' && (
                <Input
                  label="Company Name"
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                />
              )}

              <div className="row" style={{ justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <Button type="submit" variant="primary" loading={updateProfile.isPending}>
                  Save Changes
                </Button>
              </div>
            </form>
          </Card>
        </div>

        <div className="stack">
          <Card className="stack">
            <div className="row" style={{ color: 'var(--ink)' }}>
              <Shield size={20} style={{ marginRight: 'var(--space-2)' }} />
              <h3 style={{ fontSize: 'var(--text-md)', margin: 0 }}>Security & Sessions</h3>
            </div>

            <p className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
              Manage your active sessions across different devices.
            </p>

            <div className="stack-sm">
              {sessions.map((session, i) => (
                <div
                  key={session.id || i}
                  className="row-between glass-panel"
                  style={{
                    padding: 'var(--space-3)',
                    background: session.current ? 'var(--brand-soft)' : 'var(--surface-2)'
                  }}
                >
                  <div className="row">
                    {session.device?.toLowerCase().includes('mobile') ? (
                      <Smartphone size={20} color="var(--text-muted)" />
                    ) : (
                      <Laptop size={20} color="var(--text-muted)" />
                    )}
                    <div style={{ marginLeft: 'var(--space-3)' }}>
                      <div style={{ fontWeight: 600 }}>{session.device || 'Unknown Device'}</div>
                      <div className="text-muted" style={{ fontSize: 'var(--text-xs)' }}>
                        {session.location || 'Unknown location'} • Last active{' '}
                        {new Date(session.lastActive || Date.now()).toLocaleDateString()}
                      </div>
                    </div>
                  </div>

                  {session.current ? (
                    <Badge variant="success">Current</Badge>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        revokeSession.mutate(session.id, {
                          onSuccess: () => addToast({ title: 'Session revoked', type: 'info' })
                        })
                      }
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {sessions.length > 1 && (
              <Button
                variant="secondary"
                style={{ width: '100%', marginTop: 'var(--space-2)' }}
                onClick={() => {
                  if (confirm('Are you sure you want to sign out of all other devices?')) {
                    revokeOther.mutate(undefined, {
                      onSuccess: () => addToast({ title: 'Other sessions revoked', type: 'info' })
                    });
                  }
                }}
              >
                Sign out of all other devices
              </Button>
            )}
          </Card>

          <Card className="stack account-access-card">
            <div className="row" style={{ color: 'var(--ink)' }}>
              <LogOut size={20} style={{ marginRight: 'var(--space-2)' }} />
              <h3 style={{ fontSize: 'var(--text-md)', margin: 0 }}>Account access</h3>
            </div>
            <p className="text-secondary" style={{ fontSize: 'var(--text-sm)' }}>
              Signing out will end your current session on this device.
            </p>
            <Button variant="ghost" icon={LogOut} className="sign-out-button" onClick={() => logout.mutate()}>
              Sign Out
            </Button>
          </Card>

          <Card className="stack">
            <div className="row" style={{ color: 'var(--ink)' }}>
              <Shield size={20} style={{ marginRight: 'var(--space-2)' }} />
              <h3 style={{ fontSize: 'var(--text-md)', margin: 0 }}>Notifications</h3>
            </div>
            <PushNotificationControl subscribed={Boolean(profile?.pushSubscription)} />
          </Card>
        </div>
      </div>
    </div>
  );
}
