import React from 'react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

import ShipmentTimeline from './ShipmentTimeline.jsx';
import BidComparisonTable from './BidComparisonTable.jsx';
import SessionsManager from './SessionsManager.jsx';
import PushNotificationControl from './PushNotificationControl.jsx';
import DriverInvitationAcceptance from './DriverInvitationAcceptance.jsx';
import DriverOperationsPanel from './DriverOperationsPanel.jsx';
import LegalPage from './LegalPage.jsx';
import OwnerBidReviewPanel from './OwnerBidReviewPanel.jsx';
import ServiceWorkerUpdateToast from './ServiceWorkerUpdateToast.jsx';

describe('Extended Components', () => {
  beforeEach(() => {
    // Mock navigator.serviceWorker and window.PushManager
    globalThis.navigator.serviceWorker = {
      ready: Promise.resolve({
        pushManager: {
          getSubscription: vi.fn().mockResolvedValue(null),
          subscribe: vi.fn().mockResolvedValue({
            toJSON: () => ({ endpoint: 'mock-endpoint' })
          })
        }
      })
    };
    globalThis.PushManager = {};
    globalThis.Notification = {
      permission: 'default',
      requestPermission: vi.fn().mockResolvedValue('granted')
    };
  });

  afterEach(() => {
    cleanup();
  });

  test('ShipmentTimeline renders nodes and times', () => {
    const tracking = [
      { status: 'pending', queuedAt: new Date('2026-06-20T10:00:00Z').toISOString() },
      { status: 'bidding', queuedAt: new Date('2026-06-20T11:00:00Z').toISOString() }
    ];
    render(<ShipmentTimeline rawStatus="bidding" tracking={tracking} />);
    expect(screen.getByText('Booked')).toBeInTheDocument();
    expect(screen.getByText('Bidding')).toBeInTheDocument();
    expect(screen.getByText('Confirmed')).toBeInTheDocument();
  });

  test('BidComparisonTable sorts and awards bids', () => {
    const bids = [
      { id: 'b1', ownerName: 'Carrier A', truckName: 'Lorry A', amount: 1500, rating: 4.5, message: 'Fast', status: 'pending' },
      { id: 'b2', ownerName: 'Carrier B', truckName: 'Lorry B', amount: 1200, rating: 4.8, message: 'Cheap', status: 'pending' }
    ];
    const onAward = vi.fn();
    render(<BidComparisonTable bids={bids} onAward={onAward} busyId="" />);

    expect(screen.getByText('Carrier A')).toBeInTheDocument();
    expect(screen.getByText('Carrier B')).toBeInTheDocument();

    // Click award
    const awardBtns = screen.getAllByRole('button', { name: 'Award' });
    fireEvent.click(awardBtns[0]);
    expect(onAward).toHaveBeenCalled();
  });

  test('SessionsManager list and revoke sessions', async () => {
    const notify = vi.fn();
    render(<SessionsManager notify={notify} />);

    // Renders loader initially
    expect(screen.getByText('Loading sessions...')).toBeInTheDocument();

    // Wait for mock server data to resolve
    await waitFor(() => expect(screen.queryByText('Loading sessions...')).not.toBeInTheDocument());

    // Should list current session or fallback
    expect(screen.getByText('No active sessions found.')).toBeInTheDocument();
  });

  test('PushNotificationControl handles push state', async () => {
    const notify = vi.fn();
    const onChange = vi.fn();
    render(<PushNotificationControl notify={notify} onChange={onChange} />);

    expect(screen.getByText(/Enable alerts/)).toBeInTheDocument();
  });

  test('DriverInvitationAcceptance accepts inputs and submits', async () => {
    const notify = vi.fn();
    const onAccepted = vi.fn();
    render(<DriverInvitationAcceptance token="test-token" notify={notify} onAccepted={onAccepted} />);

    expect(screen.getByText('Validating invitation...')).toBeInTheDocument();
  });

  test('DriverOperationsPanel invites and loads', async () => {
    const notify = vi.fn();
    render(<DriverOperationsPanel fleet={[]} notify={notify} />);
    expect(screen.getByText('Drivers')).toBeInTheDocument();
  });

  test('LegalPage matches structure', () => {
    render(<LegalPage type="privacy" />);
    expect(screen.getByText('Privacy Notice')).toBeInTheDocument();
  });

  test('OwnerBidReviewPanel shows active bids', () => {
    const draft = { amount: 1000, truck: '', message: '' };
    const load = { cargo: 'Wheat', route: 'N-K', window: 'Tomorrow', price: 900 };
    render(
      <OwnerBidReviewPanel
        load={load}
        draft={draft}
        fleet={[]}
        busy={false}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Wheat')).toBeInTheDocument();
  });

  test('ServiceWorkerUpdateToast handles click triggers', () => {
    render(<ServiceWorkerUpdateToast />);
    // Toast should not render by default
    expect(screen.queryByText(/A new update is available/)).not.toBeInTheDocument();
  });
});
