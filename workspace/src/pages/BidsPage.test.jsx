import { screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import BidsPage from './BidsPage.jsx';
import { server } from '../test/mocks/server.js';
import { http, HttpResponse } from 'msw';
import { renderWithQuery as render } from '../test/renderWithQuery.jsx';

const mockNotify = vi.fn();

const ownerUser = {
  id: 'usr-owner',
  email: 'owner@example.com',
  role: 'owner',
  company: 'David Haulage',
  isVerified: true
};

const shipperUser = {
  id: 'usr-shipper',
  email: 'shipper@example.com',
  role: 'client',
  firstName: 'John',
  lastName: 'Doe',
  isVerified: true
};

describe('BidsPage Interaction & Verification Tests', () => {
  beforeEach(() => {
    mockNotify.mockClear();
    localStorage.clear();
    window.confirm = vi.fn().mockReturnValue(true);
    window.prompt = vi.fn().mockReturnValue('1500');
  });

  afterEach(() => {
    cleanup();
  });

  test('renders available loads and places bid successfully as Owner', async () => {
    server.use(
      http.get('*/api/bookings/open', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Dar es Salaam',
              cargo: 'Machine parts',
              status: 'Bidding',
              budget: 2000,
              pickupWindow: 'Morning pickup',
              distance: 900,
              estimate: {
                routeRisk: 'Low'
              }
            }
          ]
        });
      }),
      http.post('*/api/bookings/:bookingId/bids', async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json({
          success: true,
          booking: {
            id: 'ITK-1002',
            bookingId: 'ITK-1002',
            route: 'Mombasa to Dar es Salaam',
            cargo: 'Machine parts',
            status: 'Bidding',
            bids: [
              {
                id: 'bid-new',
                ownerId: 'usr-owner',
                amount: body.amount,
                message: body.message,
                status: 'pending'
              }
            ]
          }
        });
      })
    );

    render(<BidsPage notify={mockNotify} user={ownerUser} />);

    // Renders "Available Loads" panel
    expect(await screen.findByText('Machine parts')).toBeInTheDocument();

    // Click "Review Bid" to open panel
    const reviewBtn = screen.getByRole('button', { name: 'Review Bid' });
    fireEvent.click(reviewBtn);

    // Verify draft review inputs are visible
    const input = screen.getByLabelText('Your bid amount USD');
    fireEvent.change(input, { target: { value: '1800' } });

    const note = screen.getByLabelText('Bid note to shipper');
    fireEvent.change(note, { target: { value: 'Available immediately' } });

    // Place bid
    const placeBidBtn = screen.getByRole('button', { name: 'Place Bid' });
    fireEvent.click(placeBidBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith(expect.stringContaining('Bid submitted for Mombasa to Dar es Salaam'));
    });
    expect(screen.queryByRole('button', { name: 'Review Bid' })).not.toBeInTheDocument();
  });

  test('reports available-load failures and retries without sample work', async () => {
    let available = false;
    server.use(
      http.get('*/api/bookings/open', () =>
        available
          ? HttpResponse.json({
              bookings: [
                {
                  id: 'ITK-RETRY',
                  bookingId: 'ITK-RETRY',
                  route: 'Accra to Kumasi',
                  cargo: 'Retail goods',
                  status: 'Bidding'
                }
              ]
            })
          : HttpResponse.json({ message: 'Opportunity service unavailable' }, { status: 503 })
      )
    );

    render(<BidsPage notify={mockNotify} user={ownerUser} />);
    expect(await screen.findByText('Available loads unavailable')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Review Bid' })).not.toBeInTheDocument();

    available = true;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('button', { name: 'Review Bid' })).toBeInTheDocument();
  });

  test('keeps a failed bid open for retry without creating a local bid', async () => {
    server.use(
      http.get('*/api/bookings/open', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Dar es Salaam',
              cargo: 'Machine parts',
              status: 'Bidding',
              budget: 2000,
              pickupWindow: 'Morning pickup',
              distance: 900
            }
          ]
        });
      }),
      http.post('*/api/bookings/:bookingId/bids', () => {
        return new HttpResponse(null, { status: 500 });
      })
    );

    render(<BidsPage notify={mockNotify} user={ownerUser} />);

    const reviewBtn = await screen.findByRole('button', { name: 'Review Bid' });
    fireEvent.click(reviewBtn);

    const input = screen.getByLabelText('Your bid amount USD');
    fireEvent.change(input, { target: { value: '1800' } });

    const placeBidBtn = screen.getByRole('button', { name: 'Place Bid' });
    fireEvent.click(placeBidBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Request failed');
    });

    expect(screen.getByRole('button', { name: 'Place Bid' })).toBeInTheDocument();
    expect(localStorage.getItem('itruck_bids')).toBeNull();
  });

  test('Owner: Accept counter', async () => {
    server.use(
      http.get('*/api/bookings/open', () => HttpResponse.json({ bookings: [] })),
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Dar es Salaam',
              cargo: 'Machine parts',
              status: 'Bidding',
              bids: [
                {
                  id: 'bid-countered',
                  ownerId: 'usr-owner',
                  amount: 2200,
                  status: 'countered',
                  counteroffer: {
                    status: 'pending',
                    amount: 1900
                  }
                }
              ]
            }
          ]
        });
      }),
      http.patch('*/api/bookings/:bookingId/bids/:bidId/respond-counter', async () => {
        return HttpResponse.json({
          booking: {
            id: 'ITK-1002',
            bookingId: 'ITK-1002',
            route: 'Mombasa to Dar es Salaam',
            cargo: 'Machine parts',
            status: 'Bidding',
            bids: [
              {
                id: 'bid-countered',
                ownerId: 'usr-owner',
                amount: 1900,
                status: 'accepted'
              }
            ]
          }
        });
      })
    );

    render(<BidsPage notify={mockNotify} user={ownerUser} />);
    await screen.findByText('My Bids');

    const acceptCounterBtn = await screen.findByRole('button', { name: 'Accept Counter' });
    fireEvent.click(acceptCounterBtn);
    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Counteroffer accepted');
    });
  });

  test('Owner: Decline counter', async () => {
    server.use(
      http.get('*/api/bookings/open', () => HttpResponse.json({ bookings: [] })),
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Dar es Salaam',
              cargo: 'Machine parts',
              status: 'Bidding',
              bids: [
                {
                  id: 'bid-countered',
                  ownerId: 'usr-owner',
                  amount: 2200,
                  status: 'countered',
                  counteroffer: {
                    status: 'pending',
                    amount: 1900
                  }
                }
              ]
            }
          ]
        });
      }),
      http.patch('*/api/bookings/:bookingId/bids/:bidId/respond-counter', async () => {
        return HttpResponse.json({
          booking: {
            id: 'ITK-1002',
            bookingId: 'ITK-1002',
            route: 'Mombasa to Dar es Salaam',
            cargo: 'Machine parts',
            status: 'Bidding',
            bids: [
              {
                id: 'bid-countered',
                ownerId: 'usr-owner',
                amount: 2200,
                status: 'rejected'
              }
            ]
          }
        });
      })
    );

    window.prompt = vi.fn().mockReturnValue('High toll fees');

    render(<BidsPage notify={mockNotify} user={ownerUser} />);
    await screen.findByText('My Bids');

    const declineCounterBtn = await screen.findByRole('button', { name: 'Decline' });
    fireEvent.click(declineCounterBtn);
    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Counteroffer declined');
    });
  });

  test('Owner: Withdraw bid', async () => {
    server.use(
      http.get('*/api/bookings/open', () => HttpResponse.json({ bookings: [] })),
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1003',
              bookingId: 'ITK-1003',
              route: 'Kampala to Nairobi',
              cargo: 'Grains',
              status: 'Bidding',
              bids: [
                {
                  id: 'bid-pending',
                  ownerId: 'usr-owner',
                  amount: 2500,
                  status: 'pending'
                }
              ]
            }
          ]
        });
      }),
      http.patch('*/api/bookings/:bookingId/bids/:bidId/withdraw', async () => {
        return HttpResponse.json({
          booking: {
            id: 'ITK-1003',
            bookingId: 'ITK-1003',
            route: 'Kampala to Nairobi',
            cargo: 'Grains',
            status: 'Bidding',
            bids: [
              {
                id: 'bid-pending',
                ownerId: 'usr-owner',
                amount: 2500,
                status: 'withdrawn'
              }
            ]
          }
        });
      })
    );

    window.prompt = vi.fn().mockReturnValue('Vehicle broke down');

    render(<BidsPage notify={mockNotify} user={ownerUser} />);
    await screen.findByText('My Bids');

    const withdrawBtn = await screen.findByRole('button', { name: 'Withdraw' });
    fireEvent.click(withdrawBtn);
    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Bid withdrawn');
    });
  });

  test('Owner: Acknowledge bid decision', async () => {
    server.use(
      http.get('*/api/bookings/open', () => HttpResponse.json({ bookings: [] })),
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1004',
              bookingId: 'ITK-1004',
              route: 'Kigali to Kampala',
              cargo: 'Coffee',
              status: 'Bidding',
              bids: [
                {
                  id: 'bid-accepted',
                  ownerId: 'usr-owner',
                  amount: 1500,
                  status: 'accepted'
                }
              ]
            }
          ]
        });
      }),
      http.patch('*/api/bookings/:bookingId/bids/:bidId/acknowledge', async () => {
        return HttpResponse.json({
          booking: {
            id: 'ITK-1004',
            bookingId: 'ITK-1004',
            route: 'Kigali to Kampala',
            cargo: 'Coffee',
            status: 'Bidding',
            bids: [
              {
                id: 'bid-accepted',
                ownerId: 'usr-owner',
                amount: 1500,
                status: 'accepted',
                carrierAcknowledgedAt: new Date().toISOString()
              }
            ]
          }
        });
      })
    );

    render(<BidsPage notify={mockNotify} user={ownerUser} />);
    await screen.findByText('My Bids');

    const ackBtn = await screen.findByRole('button', { name: 'Acknowledge' });
    fireEvent.click(ackBtn);
    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Bid decision acknowledged');
    });
  });

  test('Shipper: Find matches and auto assign', async () => {
    server.use(
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Dar es Salaam',
              cargo: 'Machine parts',
              status: 'Bidding',
              bids: []
            }
          ]
        });
      }),
      http.get('*/api/marketplace/matches/:bookingId', () => {
        return HttpResponse.json({
          matches: [
            {
              score: 95,
              reasons: ['Equipped with cargo net'],
              truck: { id: 'TRK-001', plateNumber: 'KAA 123A' }
            }
          ]
        });
      }),
      http.post('*/api/marketplace/auto-assign/:bookingId', () => {
        return HttpResponse.json({
          success: true,
          booking: {
            id: 'ITK-1002',
            bookingId: 'ITK-1002',
            route: 'Mombasa to Dar es Salaam',
            cargo: 'Machine parts',
            status: 'Assigned'
          },
          truck: { plateNumber: 'KAA 123A' }
        });
      })
    );

    render(<BidsPage notify={mockNotify} user={shipperUser} />);
    // 1. Find verified trucks (matches)
    const findTrucksBtn = await screen.findByRole('button', { name: 'Find Verified Trucks' });
    fireEvent.click(findTrucksBtn);
    await screen.findByText(/KAA 123A/);
    expect(mockNotify).toHaveBeenCalledWith('1 verified truck matches found');

    // 2. Auto Assign
    const autoAssignBtn = screen.getByRole('button', { name: 'Auto Assign Best' });
    fireEvent.click(autoAssignBtn);
    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Assigned KAA 123A');
    });
  });

  test('Shipper: Accept, Counter, Reject carrier bids', async () => {
    server.use(
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Dar es Salaam',
              cargo: 'Machine parts',
              status: 'Bidding',
              bids: [
                {
                  id: 'bid-1',
                  ownerName: 'Carrier One',
                  truckName: 'Scania R450',
                  message: 'Ready to go',
                  amount: 2200,
                  status: 'pending'
                }
              ]
            }
          ]
        });
      }),
      http.patch('*/api/bookings/:bookingId/bids/:bidId/accept', () => {
        return HttpResponse.json({
          booking: {
            id: 'ITK-1002',
            bookingId: 'ITK-1002',
            route: 'Mombasa to Dar es Salaam',
            cargo: 'Machine parts',
            status: 'Assigned',
            bids: [
              {
                id: 'bid-1',
                ownerName: 'Carrier One',
                truckName: 'Scania R450',
                amount: 2200,
                status: 'accepted'
              }
            ]
          }
        });
      }),
      http.patch('*/api/bookings/:bookingId/bids/:bidId/counter', () => {
        return HttpResponse.json({
          booking: {
            id: 'ITK-1002',
            bookingId: 'ITK-1002',
            route: 'Mombasa to Dar es Salaam',
            cargo: 'Machine parts',
            status: 'Bidding',
            bids: [
              {
                id: 'bid-1',
                ownerName: 'Carrier One',
                truckName: 'Scania R450',
                amount: 2200,
                status: 'countered',
                counteroffer: {
                  amount: 1950,
                  message: 'Let us meet in the middle'
                }
              }
            ]
          }
        });
      }),
      http.patch('*/api/bookings/:bookingId/bids/:bidId/reject', () => {
        return HttpResponse.json({
          booking: {
            id: 'ITK-1002',
            bookingId: 'ITK-1002',
            route: 'Mombasa to Dar es Salaam',
            cargo: 'Machine parts',
            status: 'Bidding',
            bids: [
              {
                id: 'bid-1',
                ownerName: 'Carrier One',
                truckName: 'Scania R450',
                amount: 2200,
                status: 'rejected',
                rejectionReason: 'Too high'
              }
            ]
          }
        });
      })
    );

    // 1. Counter Bid
    render(<BidsPage notify={mockNotify} user={shipperUser} />);
    window.prompt = vi.fn().mockImplementation((prompt) => {
      if (prompt.includes('amount')) return '1950';
      return 'Let us meet in the middle';
    });
    const counterBtn = await screen.findByRole('button', { name: 'Counter' });
    fireEvent.click(counterBtn);
    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Counteroffer sent to carrier');
    });

    // 2. Reject Bid
    cleanup();
    render(<BidsPage notify={mockNotify} user={shipperUser} />);
    window.prompt = vi.fn().mockReturnValue('Outside budget');
    const rejectBtn = await screen.findByRole('button', { name: 'Reject' });
    fireEvent.click(rejectBtn);
    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Bid rejected with reason');
    });

    // 3. Award Bid
    cleanup();
    render(<BidsPage notify={mockNotify} user={shipperUser} />);
    const awardBtn = await screen.findByRole('button', { name: 'Award' });
    fireEvent.click(awardBtn);
    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Awarded Carrier One');
    });
    expect((await screen.findAllByText('Accepted')).length).toBeGreaterThan(0);
  });
});
