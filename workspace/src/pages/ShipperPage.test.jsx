import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import ShipperPage from './ShipperPage.jsx';
import { server } from '../test/mocks/server.js';
import { http, HttpResponse } from 'msw';

const mockNotify = vi.fn();

const clientUser = {
  id: 'usr-shipper',
  email: 'shipper@example.com',
  role: 'client',
  firstName: 'John',
  lastName: 'Doe',
  isVerified: true
};

const adminUser = {
  id: 'usr-admin',
  email: 'admin@example.com',
  role: 'admin',
  isVerified: true
};

describe('ShipperPage Interaction & Verification Tests', () => {
  beforeEach(() => {
    mockNotify.mockClear();
    localStorage.clear();
    window.confirm = vi.fn().mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  test('renders page stats, wallet balance, and shipment command rows', async () => {
    server.use(
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Dar es Salaam',
              cargo: 'Machine parts',
              status: 'In transit',
              progress: 40
            }
          ]
        });
      }),
      http.get('*/api/payments/wallet', () => {
        return HttpResponse.json({
          balance: 3400,
          wallet: {
            balance: 3400
          }
        });
      })
    );

    render(<ShipperPage notify={mockNotify} user={clientUser} />);

    await screen.findByText('Shipment Command');
    expect(screen.getByText('Mombasa to Dar es Salaam')).toBeInTheDocument();
    expect(screen.getByText('USD 3,400')).toBeInTheDocument(); // Wallet balance
    expect(screen.getByText('1 active')).toBeInTheDocument();
  });

  test('cancels a booking successfully after user confirmation', async () => {
    server.use(
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Dar es Salaam',
              cargo: 'Machine parts',
              status: 'Confirmed',
              progress: 40
            }
          ]
        });
      }),
      http.patch('*/api/bookings/:bookingId/status', async () => {
        return HttpResponse.json({
          booking: {
            id: 'ITK-1002',
            bookingId: 'ITK-1002',
            status: 'Cancelled'
          }
        });
      })
    );

    render(<ShipperPage notify={mockNotify} user={clientUser} />);
    await screen.findByText('Shipment Command');

    // Click cancel button
    const cancelBtn = screen.getByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelBtn);

    expect(window.confirm).toHaveBeenCalledWith('Cancel shipment ITK-1002?');
    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Shipment ITK-1002 cancelled');
    });
  });

  test('does not show cancel action for in-transit bookings', async () => {
    server.use(
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Dar es Salaam',
              cargo: 'Machine parts',
              status: 'In transit',
              progress: 40
            }
          ]
        });
      })
    );

    render(<ShipperPage notify={mockNotify} user={clientUser} />);
    await screen.findByText('Shipment Command');

    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  test('opens bid review panel and awards carrier bid', async () => {
    server.use(
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Dar es Salaam',
              cargo: 'Machine parts',
              status: 'Bidding'
            }
          ]
        });
      }),
      http.get('*/api/bookings/:bookingId', () => {
        return HttpResponse.json({
          booking: {
            id: 'ITK-1002',
            bookingId: 'ITK-1002',
            route: 'Mombasa to Dar es Salaam',
            cargo: 'Machine parts',
            status: 'Bidding',
            bids: [
              {
                id: 'bid-123',
                ownerName: 'Express Carrier',
                truckName: 'Actros',
                amount: 2100,
                status: 'pending'
              }
            ]
          }
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
                id: 'bid-123',
                ownerName: 'Express Carrier',
                truckName: 'Actros',
                amount: 2100,
                status: 'accepted'
              }
            ]
          }
        });
      })
    );

    render(<ShipperPage notify={mockNotify} user={clientUser} />);
    await screen.findByText('Shipment Command');

    // Open bid review panel
    const reviewBidsBtn = screen.getByRole('button', { name: 'Review Bids' });
    fireEvent.click(reviewBidsBtn);

    await screen.findByText('Bid Review');
    expect(screen.getByText('Express Carrier')).toBeInTheDocument();

    // Award the bid
    const awardBtn = screen.getByRole('button', { name: 'Award' });
    fireEvent.click(awardBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Awarded Express Carrier');
    });
  });

  test('runs actions from Action Queue and manages documents download/upload', async () => {
    server.use(
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Dar es Salaam',
              cargo: 'Machine parts',
              status: 'Delivered',
              progress: 100
            }
          ]
        });
      }),
      http.post('*/api/upload/cargo', () => {
        return HttpResponse.json({
          urls: ['https://example.com/cargo.jpg']
        });
      }),
      http.get('*/api/documents/:type/:bookingId', () => {
        return new HttpResponse('dummy payload', {
          headers: { 'Content-Type': 'application/pdf' }
        });
      }),
      http.patch('*/api/bookings/:bookingId/documents/:documentType', () => {
        return HttpResponse.json({
          booking: {
            id: 'ITK-1002',
            bookingId: 'ITK-1002',
            route: 'Mombasa to Dar es Salaam',
            cargo: 'Machine parts',
            status: 'Delivered',
            documents: ['Cargo photos ready']
          }
        });
      })
    );

    render(<ShipperPage notify={mockNotify} user={clientUser} />);
    await screen.findByText('Shipment Command');

    // 1. Click Waybill / Cargo photos download helper in action list
    const waybillBtn = screen.getByRole('button', { name: 'Confirm waybill and cargo photos' });
    fireEvent.click(waybillBtn);
    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Waybill downloaded for ITK-1002');
    });

    // 2. Trigger Document Workbench mode 'upload'
    // Scope search to the Readiness Documents panel to avoid matching duplicate buttons in Workbench
    const readinessPanel = screen.getByText('Documents', { selector: 'h2' }).closest('.panel');
    const cargoPhotosBtn = within(readinessPanel).getByRole('button', { name: 'Cargo photos' });
    fireEvent.click(cargoPhotosBtn);

    // Verify file input onChange handler
    const fileInput = document.querySelector('input[type="file"]');
    const file = new File(['dummy content'], 'cargo.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Cargo photos uploaded');
    });
  });

  test('payment release restrictions for clients and approvals for admins', async () => {
    server.use(
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Dar es Salaam',
              cargo: 'Machine parts',
              status: 'Delivered',
              progress: 100
            }
          ]
        });
      }),
      http.post('*/api/payments/bookings/:bookingId/release', () => {
        return HttpResponse.json({ success: true });
      })
    );

    // 1. Client role: release button redirects with error
    render(<ShipperPage notify={mockNotify} user={clientUser} />);
    await screen.findByText('Shipment Command');

    const releaseBtn = screen.getByRole('button', { name: 'Release payment after POD' });
    fireEvent.click(releaseBtn);
    expect(mockNotify).toHaveBeenCalledWith('Payment release requires admin approval');

    // 2. Admin role: releases payment successfully
    cleanup();
    render(<ShipperPage notify={mockNotify} user={adminUser} />);
    await screen.findByText('Shipment Command');

    const releaseBtnAdmin = screen.getByRole('button', { name: 'Release payment after POD' });
    fireEvent.click(releaseBtnAdmin);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Payment released for ITK-1002');
    });
  });
});
