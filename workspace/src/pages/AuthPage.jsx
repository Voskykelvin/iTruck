import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, setSession } from '../api';
import Input from '../components/ui/Input';
import Button from '../components/ui/Button';
import { Truck } from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import { registrationCountries } from '../utils/helpers';

export default function AuthPage() {
  const initialParams = new URLSearchParams(window.location.search);
  const resetToken = initialParams.get('reset') || '';
  const [mode, setMode] = useState(
    resetToken ? 'reset' : initialParams.get('tab') === 'register' ? 'register' : 'login'
  );
  const [role, setRole] = useState(initialParams.get('role') === 'owner' ? 'owner' : 'client');
  const [formData, setFormData] = useState({
    email: initialParams.get('email') || '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    country: 'Kenya',
    countryCode: '+254'
  });

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addToast } = useToast();

  const mutation = useMutation({
    mutationFn: async (data) => {
      if (mode === 'login') return api.login({ email: data.email, password: data.password });
      if (mode === 'register') return api.register(role, data);
      if (mode === 'forgot') return api.requestPasswordReset({ email: data.email });
      return api.resetPassword({ email: data.email, password: data.password, token: resetToken });
    },
    onSuccess: (data) => {
      if (mode === 'forgot' || mode === 'reset') {
        addToast({
          title: mode === 'forgot' ? 'Check your email' : 'Password updated',
          message: data.message,
          type: 'success'
        });
        setMode('login');
        setFormData((current) => ({ ...current, password: '' }));
        return;
      }
      setSession(data);
      queryClient.setQueryData(['session', 'current'], data.user);

      const userRole = data.user?.role || 'client';
      if (userRole === 'owner') navigate('/app/owner', { replace: true });
      else if (userRole === 'admin') navigate('/app/admin', { replace: true });
      else navigate('/app/shipper', { replace: true });

      addToast({ title: 'Welcome back!', message: 'Successfully signed in.', type: 'success' });
    },
    onError: (error) => {
      addToast({ title: 'Authentication Failed', message: error.message, type: 'error' });
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    mutation.mutate(formData);
  };

  const isLogin = mode === 'login';
  const isRegister = mode === 'register';
  const heading = {
    login: 'Welcome back',
    register: 'Create your account',
    forgot: 'Reset your password',
    reset: 'Choose a new password'
  }[mode];

  return (
    <div className="auth-layout animate-fade-in">
      <div className="auth-visual">
        <div style={{ maxWidth: 480 }}>
          <div
            style={{
              display: 'inline-flex',
              padding: 16,
              background: 'var(--brand-dark)',
              borderRadius: 'var(--radius-lg)',
              marginBottom: 'var(--space-6)'
            }}
          >
            <Truck size={48} color="var(--mustard)" />
          </div>
          <h1 style={{ fontSize: 'var(--text-4xl)', color: 'white', marginBottom: 'var(--space-4)' }}>
            Logistics that actually works.
          </h1>
          <p style={{ fontSize: 'var(--text-lg)', color: 'rgba(255,255,255,0.8)' }}>
            Connect with verified carriers, track in real-time, and automate payments across borders.
          </p>
        </div>
      </div>

      <div className="auth-form-container">
        <div style={{ width: '100%', maxWidth: 400 }}>
          <div style={{ marginBottom: 'var(--space-8)' }}>
            <h2 style={{ fontSize: 'var(--text-2xl)', marginBottom: 'var(--space-2)' }}>{heading}</h2>
            <p className="text-secondary">
              {mode === 'login' && 'Sign in to your iTruck workspace.'}
              {mode === 'register' && 'Get started with iTruck today.'}
              {mode === 'forgot' && 'Enter your email and we will send a secure reset link.'}
              {mode === 'reset' && 'Enter a new password for your iTruck account.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="stack-lg">
            {isRegister && (
              <div className="row" style={{ gap: 'var(--space-2)' }}>
                {['client', 'owner'].map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className="input-field"
                    style={{
                      flex: 1,
                      textAlign: 'center',
                      background: role === r ? 'var(--brand-soft)' : 'var(--surface)',
                      borderColor: role === r ? 'var(--brand)' : 'var(--border)',
                      fontWeight: role === r ? 600 : 400,
                      color: role === r ? 'var(--brand)' : 'var(--ink)'
                    }}
                  >
                    {r === 'owner' ? 'Carrier / Fleet' : 'Shipper'}
                  </button>
                ))}
              </div>
            )}

            <div className="stack">
              {isRegister && (
                <div className="grid-2">
                  <Input
                    label="First Name"
                    required
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  />
                  <Input
                    label="Last Name"
                    required
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  />
                </div>
              )}

              <Input
                label="Email Address"
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                readOnly={mode === 'reset'}
              />

              {isRegister && (
                <div className="grid-2">
                  <Input
                    label="Phone Number"
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  />
                  <label className="input-group">
                    <span className="input-label">Country</span>
                    <select
                      className="input-field"
                      required
                      value={formData.country}
                      onChange={(e) => {
                        const selected = registrationCountries.find(([country]) => country === e.target.value);
                        setFormData({ ...formData, country: e.target.value, countryCode: selected?.[1] || '' });
                      }}
                    >
                      {registrationCountries.map(([country]) => (
                        <option key={country} value={country}>
                          {country}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {mode !== 'forgot' && (
                <div>
                  <Input
                    label="Password"
                    type="password"
                    required
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                  {isLogin && (
                    <div style={{ textAlign: 'right', marginTop: 'var(--space-2)' }}>
                      <button
                        type="button"
                        className="text-brand"
                        style={{ fontSize: 'var(--text-sm)' }}
                        onClick={() => setMode('forgot')}
                      >
                        Forgot password?
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            <Button type="submit" variant="primary" size="lg" style={{ width: '100%' }} loading={mutation.isPending}>
              {mode === 'login' && 'Sign In'}
              {mode === 'register' && 'Create Account'}
              {mode === 'forgot' && 'Send Reset Link'}
              {mode === 'reset' && 'Update Password'}
            </Button>
          </form>

          <div
            style={{
              marginTop: 'var(--space-8)',
              textAlign: 'center',
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)'
            }}
          >
            {isLogin ? "Don't have an account? " : 'Return to sign in? '}
            <button
              type="button"
              onClick={() => setMode(isLogin ? 'register' : 'login')}
              style={{ color: 'var(--brand)', fontWeight: 600 }}
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
