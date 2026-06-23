import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import PaymentsPage from './PaymentsPage.jsx';
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

const ownerUser = {
  id: 'usr-owner',
  email: 'owner@example.com',
  role: 'owner',
  firstName: 'David',
  lastName: 'Carrier',
  isVerified: true
};

const adminUser = {
  id: 'usr-admin',
  email: 'admin@example.com',
  role: 'admin',
  isVerified: true
};

describe('PaymentsPage Interaction & Verification Tests', () => {
  beforeEach(() => {
    mockNotify.mockClear();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  test('Shipper: renders metrics, wallet balances, and funds shipment escrow via wallet', async () => {
    server.use(
      http.get('*/api/payments/wallet', () => {
        return HttpResponse.json({
          balance: 3000,
          wallet: {
            balance: 3000
          }
        });
      }),
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Dar es Salaam',
              cargo: 'Machine parts',
              status: 'Confirmed', // must be confirmed/in_transit/delivered to fund
              paymentStatus: 'unpaid',
              bids: [
                {
                  id: 'bid-1',
                  status: 'accepted',
                  amount: 1500
                }
              ]
            }
          ]
        });
      }),
      http.post('*/api/payments/bookings/:bookingId/escrow', () => {
        return HttpResponse.json({
          success: true,
          balance: 1500,
          booking: {
            id: 'ITK-1002',
            bookingId: 'ITK-1002',
            status: 'Confirmed',
            paymentStatus: 'escrowed',
            bids: [
              {
                id: 'bid-1',
                status: 'accepted',
                amount: 1500
              }
            ]
          },
          transaction: {
            id: 'tx-new',
            type: 'Debit',
            amount: 1500,
            status: 'Completed',
            createdAt: new Date().toISOString()
          }
        });
      })
    );

    render(<PaymentsPage notify={mockNotify} user={clientUser} />);

    await screen.findByText('Booking Funding');
    expect(screen.getAllByText('USD 3,000')[0]).toBeInTheDocument(); // wallet balance

    // Click "Wallet" button to fund escrow
    const walletBtn = screen.getByRole('button', { name: 'Wallet' });
    fireEvent.click(walletBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Escrow funded for ITK-1002');
    });
    // Wallet balance should update to 1500
    expect(screen.getAllByText('USD 1,500')[0]).toBeInTheDocument();
  });

  test('Shipper: funds shipment escrow via Mobile Money modal', async () => {
    server.use(
      http.get('*/api/payments/wallet', () => {
        return HttpResponse.json({ balance: 0 });
      }),
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Dar es Salaam',
              cargo: 'Machine parts',
              status: 'Confirmed',
              paymentStatus: 'unpaid',
              bids: [{ id: 'bid-1', status: 'accepted', amount: 1500 }]
            }
          ]
        });
      }),
      http.post('*/api/payments/bookings/:bookingId/mobile-money', () => {
        return HttpResponse.json({
          success: true,
          message: 'Mobile money authorization sent',
          booking: {
            id: 'ITK-1002',
            bookingId: 'ITK-1002',
            status: 'Confirmed',
            paymentStatus: 'pending'
          },
          transaction: {
            id: 'tx-momo',
            type: 'Credit',
            amount: 1500,
            status: 'Pending'
          }
        });
      })
    );

    render(<PaymentsPage notify={mockNotify} user={clientUser} />);
    await screen.findByText('Booking Funding');

    // Click "Mobile" button to open modal
    const mobileBtn = screen.getByRole('button', { name: 'Mobile' });
    fireEvent.click(mobileBtn);

    await screen.findByText('Mobile Money Escrow');

    // Fill phone number input inside modal
    const phoneInput = screen.getByLabelText('M-Pesa phone');
    fireEvent.change(phoneInput, { target: { value: '+254700999888' } });

    // Submit payment authorization
    const submitBtn = screen.getByRole('button', { name: 'Send Authorization' });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Mobile money authorization sent');
    });
  });

  test('Owner: withdraws earnings form submission', async () => {
    server.use(
      http.get('*/api/payments/wallet', () => HttpResponse.json({ balance: 1000 })),
      http.get('*/api/bookings', () => HttpResponse.json({ bookings: [] })),
      http.post('*/api/payments/withdraw', () => {
        return HttpResponse.json({
          success: true,
          transaction: {
            id: 'tx-withdraw',
            type: 'Debit',
            amount: 200,
            status: 'Completed'
          }
        });
      })
    );

    render(<PaymentsPage notify={mockNotify} user={ownerUser} />);
    await screen.findByText('Withdraw Earnings');

    // Fill form
    fireEvent.change(screen.getByLabelText('Amount USD'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'stripe' } });
    fireEvent.change(screen.getByLabelText('Phone or account'), { target: { value: 'acc-12345' } });

    const withdrawBtn = screen.getByRole('button', { name: 'Withdraw' });
    fireEvent.click(withdrawBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Withdrawal queued');
    });
    // Wallet balance should decrease by 200
    expect(screen.getAllByText('USD 800')[0]).toBeInTheDocument();
  });

  test('Admin: topups wallet balance via topup modal', async () => {
    server.use(
      http.get('*/api/payments/wallet', () => HttpResponse.json({ balance: 5000 })),
      http.get('*/api/bookings', () => HttpResponse.json({ bookings: [] })),
      http.post('*/api/payments/wallet/credit', () => {
        return HttpResponse.json({
          id: 'tx-credit',
          type: 'Credit',
          amount: 1000,
          status: 'Completed',
          metadata: {
            walletBalance: 6000
          }
        });
      })
    );

    render(<PaymentsPage notify={mockNotify} user={adminUser} />);
    await screen.findByText('Admin Wallet Adjustment');

    // Open topup modal
    const creditBtn = screen.getByRole('button', { name: 'Credit Admin Wallet' });
    fireEvent.click(creditBtn);

    // Modal header is 'Admin Wallet Adjustment'
    await screen.findAllByText('Admin Wallet Adjustment');

    // Preset chips or custom input 'Custom amount'
    const amountInput = screen.getByLabelText('Custom amount');
    fireEvent.change(amountInput, { target: { value: '1000' } });

    // Click submit button (Top up USD 1,000)
    const authorizeBtn = screen.getByRole('button', { name: /Top up/ });
    fireEvent.click(authorizeBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Admin wallet credited');
    });
    // Wallet balance should update to 6000
    expect(screen.getAllByText('USD 6,000')[0]).toBeInTheDocument();
  });
});
