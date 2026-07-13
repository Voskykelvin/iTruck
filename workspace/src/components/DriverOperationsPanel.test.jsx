import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderWithQuery } from '../test/renderWithQuery.jsx';
import { server } from '../test/mocks/server.js';
import DriverOperationsPanel from './DriverOperationsPanel.jsx';

const fleet = [{ id: 'truck-1', plate: 'KDA 101A', name: 'Isuzu Lorry' }];

describe('DriverOperationsPanel', () => {
  const notify = vi.fn();

  beforeEach(() => {
    notify.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  test('assigns and unassigns an active driver from a fleet vehicle', async () => {
    let assigned = false;
    server.use(
      http.get('*/api/drivers', () =>
        HttpResponse.json({
          drivers: [{ _id: 'driver-1', firstName: 'Amina', lastName: 'Otieno', email: 'amina@example.com' }],
          invitations: [],
          assignments: assigned
            ? [{ _id: 'assignment-1', driver: { _id: 'driver-1' }, truck: { _id: 'truck-1', plateNumber: 'KDA 101A' } }]
            : []
        })
      ),
      http.patch('*/api/drivers/:driverId/truck', () => {
        assigned = true;
        return HttpResponse.json({ assignment: { _id: 'assignment-1' } });
      }),
      http.delete('*/api/drivers/:driverId/truck', () => {
        assigned = false;
        return HttpResponse.json({ assignment: { _id: 'assignment-1', status: 'ended' } });
      })
    );

    renderWithQuery(<DriverOperationsPanel fleet={fleet} notify={notify} />);
    await screen.findByText('Amina Otieno');

    fireEvent.change(screen.getByLabelText('Vehicle'), { target: { value: 'truck-1' } });
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Driver assigned to vehicle'));
    expect(await screen.findByText('KDA 101A')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Vehicle'), { target: { value: '' } });
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Driver removed from vehicle'));
    expect(await screen.findByText('No vehicle assigned')).toBeInTheDocument();
  });

  test('creates and revokes a driver invitation through the backend', async () => {
    let invitation = null;
    server.use(
      http.get('*/api/drivers', () =>
        HttpResponse.json({ drivers: [], invitations: invitation ? [invitation] : [], assignments: [] })
      ),
      http.post('*/api/drivers/invitations', async ({ request }) => {
        const body = await request.json();
        invitation = {
          _id: 'invite-1',
          email: body.email,
          status: 'pending',
          expiresAt: '2026-08-01T00:00:00.000Z'
        };
        return HttpResponse.json({ invitation, invitationUrl: 'https://example.test/invite/token' }, { status: 201 });
      }),
      http.delete('*/api/drivers/invitations/:invitationId', () => {
        invitation = null;
        return HttpResponse.json({ invitation: { _id: 'invite-1', status: 'revoked' } });
      })
    );

    renderWithQuery(<DriverOperationsPanel fleet={fleet} notify={notify} />);
    await screen.findByText('Invite a driver to create a job-scoped account.');
    fireEvent.change(screen.getByLabelText('Driver email'), { target: { value: 'newdriver@example.com' } });
    fireEvent.change(screen.getByLabelText('Driver phone'), { target: { value: '+254700111222' } });
    fireEvent.click(screen.getByRole('button', { name: 'Invite Driver' }));

    await waitFor(() =>
      expect(notify).toHaveBeenCalledWith('Driver invitation created; its secure link was copied when supported')
    );
    const revoke = await screen.findByRole('button', { name: /newdriver@example\.com.*Revoke/ });
    fireEvent.click(revoke);
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Driver invitation revoked'));
    await waitFor(() => expect(screen.queryByRole('button', { name: /newdriver@example\.com.*Revoke/ })).toBeNull());
  });

  test('shows a retry action when driver records fail to load', async () => {
    let failing = true;
    server.use(
      http.get('*/api/drivers', () =>
        failing
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({ drivers: [], invitations: [], assignments: [] })
      )
    );

    renderWithQuery(<DriverOperationsPanel fleet={fleet} notify={notify} />);
    await screen.findByText('Drivers could not be loaded');
    failing = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Invite a driver to create a job-scoped account.')).toBeInTheDocument();
  });
});
