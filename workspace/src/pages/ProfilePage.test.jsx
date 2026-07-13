import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import ProfilePage from './ProfilePage.jsx';
import { server } from '../test/mocks/server.js';
import { renderWithQuery as render } from '../test/renderWithQuery.jsx';

const user = {
  id: 'usr-profile',
  email: 'profile@example.com',
  role: 'client',
  firstName: 'Amina',
  lastName: 'Shipper',
  phone: '+254700000000',
  country: 'Kenya',
  documents: []
};

describe('ProfilePage server-state integrity', () => {
  afterEach(cleanup);

  test('shows and retries unavailable notification preferences without displaying defaults as live settings', async () => {
    let available = false;
    server.use(
      http.get('*/api/notifications/preferences', () =>
        available
          ? HttpResponse.json({
              preferences: {
                channels: { inApp: true, email: false, sms: false, push: false },
                categories: { bookings: true },
                quietHours: { enabled: false, start: '22:00', end: '06:00', timezone: 'Africa/Nairobi' }
              }
            })
          : HttpResponse.json({ message: 'Preferences unavailable' }, { status: 503 })
      )
    );

    render(<ProfilePage notify={vi.fn()} route="/app/profile" user={user} setUser={vi.fn()} signOut={vi.fn()} />);

    expect(await screen.findByText('Notification preferences unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save preferences' })).not.toBeInTheDocument();

    available = true;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Save preferences' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).not.toBeChecked();
  });

  test('retains edited profile fields when the backend rejects the save', async () => {
    const notify = vi.fn();
    const setUser = vi.fn();
    server.use(
      http.patch('*/api/users/profile', () =>
        HttpResponse.json({ message: 'Profile update unavailable' }, { status: 503 })
      )
    );

    render(<ProfilePage notify={notify} route="/app/profile" user={user} setUser={setUser} signOut={vi.fn()} />);
    const firstName = await screen.findByLabelText('First name');
    fireEvent.change(firstName, { target: { value: 'Amara' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Profile update unavailable'));
    expect(firstName).toHaveValue('Amara');
    expect(setUser).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalledWith('Profile details updated');
  });
});
