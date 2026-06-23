import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import OwnerPage from './OwnerPage.jsx';
import { server } from '../test/mocks/server.js';
import { http, HttpResponse } from 'msw';

const mockNotify = vi.fn();

const ownerUser = {
  id: 'usr-owner',
  email: 'owner@example.com',
  role: 'owner',
  company: 'David Haulage',
  isVerified: true
};

describe('OwnerPage Interaction & Verification Tests', () => {
  beforeEach(() => {
    mockNotify.mockClear();
    localStorage.clear();
    window.confirm = vi.fn().mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  test('renders metrics, fleet trucks, and job board available loads', async () => {
    server.use(
      http.get('*/api/trucks/fleet', () => {
        return HttpResponse.json({
          trucks: [
            {
              id: 'TRK-001',
              plate: 'KAA 123A',
              name: 'Isuzu Lorry',
              verified: true,
              documentStatus: 'Docs verified',
              availability: 'Available now',
              routes: ['Mombasa-Nairobi'],
              routeFit: 95
            }
          ]
        });
      }),
      http.get('*/api/bookings/open', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Nairobi',
              cargo: 'Cement',
              status: 'Bidding',
              budget: 1500,
              distance: 500,
              pickupWindow: 'Flexible'
            }
          ]
        });
      }),
      http.get('*/api/bookings', () => HttpResponse.json({ bookings: [] })),
      http.get('*/api/payments/wallet', () => HttpResponse.json({ balance: 4120 }))
    );

    render(<OwnerPage notify={mockNotify} user={ownerUser} />);

    await screen.findByText('Job Board');
    expect(screen.getByText('Cement')).toBeInTheDocument();
    expect(screen.getByText('KAA 123A')).toBeInTheDocument();
    expect(screen.getByText('USD 4,120')).toBeInTheDocument(); // Wallet balance metric
    expect(screen.getByText('1')).toBeInTheDocument(); // Gauge metric for 1 open load
  });

  test('adds vehicle (online success and offline fallback)', async () => {
    server.use(
      http.get('*/api/trucks/fleet', () => HttpResponse.json({ trucks: [] })),
      http.get('*/api/bookings/open', () => HttpResponse.json({ bookings: [] })),
      http.get('*/api/bookings', () => HttpResponse.json({ bookings: [] })),
      http.get('*/api/payments/wallet', () => HttpResponse.json({ balance: 0 })),
      // 1. Success case
      http.post('*/api/trucks', () => {
        return HttpResponse.json({
          truck: {
            id: 'TRK-999',
            plate: 'KAA 999B',
            name: 'Listed vehicle',
            verified: false,
            documentStatus: 'Docs pending',
            availability: 'Online',
            routes: ['Route pending'],
            routeFit: 64
          }
        });
      })
    );

    render(<OwnerPage notify={mockNotify} user={ownerUser} />);
    await screen.findByText('Vehicle Readiness');

    // Attempt adding with empty plate
    const addBtn = screen.getByRole('button', { name: 'Add' });
    fireEvent.click(addBtn);
    expect(mockNotify).toHaveBeenCalledWith('Enter a plate number before adding a vehicle');

    // Add valid plate
    const input = screen.getByPlaceholderText('Plate number');
    fireEvent.change(input, { target: { value: 'KAA 999B' } });
    fireEvent.click(addBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Vehicle sent to admin review');
    });
    expect(screen.getByText('KAA 999B')).toBeInTheDocument();

    // 2. Offline case (api.createTruck throws)
    cleanup();
    server.use(
      http.post('*/api/trucks', () => {
        return new HttpResponse(null, { status: 500 });
      })
    );

    render(<OwnerPage notify={mockNotify} user={ownerUser} />);
    await screen.findByText('Vehicle Readiness');

    const input2 = screen.getByPlaceholderText('Plate number');
    fireEvent.change(input2, { target: { value: 'KAA 777C' } });
    const addBtn2 = screen.getByRole('button', { name: 'Add' });
    fireEvent.click(addBtn2);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Sign in to save this vehicle to your fleet');
    });
    expect(screen.getByText('KAA 777C')).toBeInTheDocument();
  });

  test('submits owner bid successfully and triggers offline save locally if API fails', async () => {
    server.use(
      http.get('*/api/trucks/fleet', () => HttpResponse.json({ trucks: [] })),
      http.get('*/api/bookings/open', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Nairobi',
              cargo: 'Cement',
              status: 'Bidding',
              budget: 1500,
              distance: 500,
              pickupWindow: 'Flexible'
            }
          ]
        });
      }),
      http.get('*/api/bookings', () => HttpResponse.json({ bookings: [] })),
      http.get('*/api/payments/wallet', () => HttpResponse.json({ balance: 0 })),
      // Submit bid success mock
      http.post('*/api/bookings/:bookingId/bids', () => {
        return HttpResponse.json({
          booking: {
            id: 'ITK-1002',
            bookingId: 'ITK-1002',
            route: 'Mombasa to Nairobi',
            cargo: 'Cement',
            status: 'Bidding',
            bids: [
              {
                id: 'bid-ok',
                ownerId: 'usr-owner',
                amount: 1400,
                status: 'pending'
              }
            ]
          }
        });
      })
    );

    render(<OwnerPage notify={mockNotify} user={ownerUser} />);
    await screen.findByText('Job Board');

    // Click "Review Bid"
    const reviewBtn = screen.getByRole('button', { name: 'Review Bid' });
    fireEvent.click(reviewBtn);

    // Click "Place Bid"
    const placeBtn = screen.getByRole('button', { name: 'Place Bid' });
    fireEvent.click(placeBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Bid submitted for Mombasa to Nairobi. Moved to My Bids.');
    });

    // 2. Offline submit bid
    cleanup();
    server.use(
      http.get('*/api/trucks/fleet', () => HttpResponse.json({ trucks: [] })),
      http.get('*/api/bookings/open', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Nairobi',
              cargo: 'Cement',
              status: 'Bidding',
              budget: 1500,
              distance: 500,
              pickupWindow: 'Flexible'
            }
          ]
        });
      }),
      http.get('*/api/bookings', () => HttpResponse.json({ bookings: [] })),
      http.get('*/api/payments/wallet', () => HttpResponse.json({ balance: 0 })),
      http.post('*/api/bookings/:bookingId/bids', () => {
        return new HttpResponse(null, { status: 500 });
      })
    );

    render(<OwnerPage notify={mockNotify} user={ownerUser} />);
    await screen.findByText('Job Board');

    const reviewBtn2 = screen.getByRole('button', { name: 'Review Bid' });
    fireEvent.click(reviewBtn2);

    const placeBtn2 = screen.getByRole('button', { name: 'Place Bid' });
    fireEvent.click(placeBtn2);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Request failed');
    });
  });

  test('runs action queue actions: insurance updates and pickup start checks', async () => {
    server.use(
      http.get('*/api/trucks/fleet', () => HttpResponse.json({ trucks: [] })),
      http.get('*/api/bookings/open', () => HttpResponse.json({ bookings: [] })),
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Nairobi',
              cargo: 'Cement',
              status: 'Confirmed'
            }
          ]
        });
      }),
      http.get('*/api/payments/wallet', () => HttpResponse.json({ balance: 0 })),
      http.patch('*/api/bookings/:bookingId/status', () => {
        return HttpResponse.json({
          booking: {
            id: 'ITK-1002',
            bookingId: 'ITK-1002',
            status: 'In transit'
          }
        });
      })
    );

    render(<OwnerPage notify={mockNotify} user={ownerUser} />);
    await screen.findByText('Action Queue');

    // 1. Insurance upload action
    const insBtn = screen.getByRole('button', { name: 'Upload insurance - Toyota Hilux' });
    fireEvent.click(insBtn);
    expect(mockNotify).toHaveBeenCalledWith('Insurance upload opened');

    // 2. Confirm pickup started action
    const pickupBtn = screen.getByRole('button', { name: 'Confirm pickup - Kampala depot' });
    fireEvent.click(pickupBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Pickup started for ITK-1002');
    });
  });

  test('removes vehicle from fleet', async () => {
    server.use(
      http.get('*/api/trucks/fleet', () => {
        return HttpResponse.json({
          trucks: [
            {
              id: 'TRK-001',
              plate: 'KAA 123A',
              name: 'Isuzu Lorry',
              verified: true,
              documentStatus: 'Docs verified',
              availability: 'Available now',
              routes: ['Mombasa-Nairobi'],
              routeFit: 95
            }
          ]
        });
      }),
      http.get('*/api/bookings/open', () => HttpResponse.json({ bookings: [] })),
      http.get('*/api/bookings', () => HttpResponse.json({ bookings: [] })),
      http.get('*/api/payments/wallet', () => HttpResponse.json({ balance: 0 })),
      http.delete('*/api/trucks/:truckId', () => {
        return HttpResponse.json({ success: true });
      })
    );

    render(<OwnerPage notify={mockNotify} user={ownerUser} />);
    await screen.findByText('Vehicle Readiness');

    const removeBtn = screen.getByRole('button', { name: 'Remove' });
    fireEvent.click(removeBtn);

    expect(window.confirm).toHaveBeenCalledWith('Remove KAA 123A from your fleet?');
    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Vehicle removed from fleet');
    });
    expect(screen.queryByText('KAA 123A')).not.toBeInTheDocument();
  });
});
