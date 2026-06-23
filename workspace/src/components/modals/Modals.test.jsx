import React from 'react';
import { describe, test, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/mocks/server.js';

import WalletTopupModal from './WalletTopupModal.jsx';
import MobileMoneyEscrowModal from './MobileMoneyEscrowModal.jsx';
import ReportIssueModal from './ReportIssueModal.jsx';
import GlobalSearch from './GlobalSearch.jsx';
import DeliveryProofModal from './DeliveryProofModal.jsx';

describe('Modal Components', () => {
  afterEach(() => {
    cleanup();
  });

  test('WalletTopupModal submits custom amount', () => {
    const handleClose = vi.fn();
    const handleTopup = vi.fn();
    const transactions = [
      { id: 't1', amount: 100, type: 'Credit', status: 'Completed', description: 'Topup' }
    ];

    render(
      <WalletTopupModal
        balance={150}
        onClose={handleClose}
        onTopup={handleTopup}
        busy={false}
        transactions={transactions}
      />
    );

    expect(screen.getByText('Admin Wallet Adjustment')).toBeInTheDocument();
    expect(screen.getByText('USD 150')).toBeInTheDocument();
    expect(screen.getByText('Topup')).toBeInTheDocument();

    // Select presets or change input
    const input = screen.getByLabelText('Custom amount');
    fireEvent.change(input, { target: { value: '200' } });

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Top up/ });
    fireEvent.click(submitBtn);

    expect(handleTopup).toHaveBeenCalledWith({
      method: 'mpesa',
      amount: 200,
      phone: ''
    });
  });

  test('MobileMoneyEscrowModal submits phone number', () => {
    const shipment = { id: 'ITK-1001', amount: 500, route: 'Nairobi to Kampala' };
    const onSubmit = vi.fn();
    const onClose = vi.fn();

    render(
      <MobileMoneyEscrowModal
        shipment={shipment}
        busy={false}
        onClose={onClose}
        onSubmit={onSubmit}
      />
    );

    expect(screen.getByText('ITK-1001')).toBeInTheDocument();
    expect(screen.getByText('USD 500')).toBeInTheDocument();

    const input = screen.getByLabelText(/phone/i);
    fireEvent.change(input, { target: { value: '+254711222333' } });

    fireEvent.submit(screen.getByRole('dialog').querySelector('form'));
    expect(onSubmit).toHaveBeenCalledWith({
      method: 'mpesa',
      phone: '+254711222333'
    });
  });

  test('ReportIssueModal submits support case details', () => {
    const shipment = { id: 'ITK-1001', route: 'Nairobi to Kampala' };
    const onSubmit = vi.fn();
    const onClose = vi.fn();

    render(
      <ReportIssueModal
        shipment={shipment}
        onClose={onClose}
        onSubmit={onSubmit}
        busy={false}
      />
    );

    expect(screen.getByText('Report Issue')).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/Describe the/);
    fireEvent.change(textarea, { target: { value: 'Driver delayed' } });

    const submitBtn = screen.getByRole('button', { name: 'Submit Report' });
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalledWith({
      kind: 'support',
      issueType: 'delay',
      description: 'Driver delayed',
      severity: 'normal',
      photos: []
    });
  });

  test('GlobalSearch searches and navigates', () => {
    const shipments = [
      { id: 'ITK-1001', route: 'Nairobi to Kampala', cargo: 'Soda', status: 'In transit' }
    ];
    const trucks = [
      { id: 'TRK-001', plate: 'TRK 001', name: 'Scania', type: 'Trailer', availability: 'Available' }
    ];
    const onClose = vi.fn();
    const onNavigate = vi.fn();

    render(
      <GlobalSearch
        shipments={shipments}
        trucks={trucks}
        onClose={onClose}
        onNavigate={onNavigate}
      />
    );

    const input = screen.getByPlaceholderText(/Search bookings/);
    fireEvent.change(input, { target: { value: 'Soda' } });

    // Expect search result
    const resultBtn = screen.getAllByText('ITK-1001')[0].closest('button');
    expect(resultBtn).toBeInTheDocument();
    fireEvent.click(resultBtn);

    expect(onNavigate).toHaveBeenCalledWith('/app/tracking?shipment=ITK-1001');
    expect(onClose).toHaveBeenCalled();
  });

  test('DeliveryProofModal works through OTP and geolocation submission', async () => {
    // Setup MSW for OTP and upload checks
    server.use(
      http.post('*/api/bookings/:bookingId/delivery-proof/otp', () => {
        return HttpResponse.json({
          challenge: {
            receiverPhoneLast4: '4321',
            expiresAt: new Date(Date.now() + 600000).toISOString()
          }
        });
      })
    );

    // Mock geolocation API
    const mockGeolocation = {
      getCurrentPosition: vi.fn().mockImplementation((success) =>
        success({
          coords: { latitude: -1.2921, longitude: 36.8219, accuracy: 10 },
          timestamp: Date.now()
        })
      )
    };
    globalThis.navigator.geolocation = mockGeolocation;

    const shipment = { bookingId: 'bk-1', id: 'ITK-1001', receiverName: 'John Doe' };
    const onSubmit = vi.fn();
    const onClose = vi.fn();

    render(
      <DeliveryProofModal
        shipment={shipment}
        onClose={onClose}
        onSubmit={onSubmit}
        busy={false}
      />
    );

    // 1. Click Send OTP
    const otpBtn = screen.getByRole('button', { name: 'Send OTP' });
    fireEvent.click(otpBtn);
    await screen.findByText(/Code sent to phone ending/);

    // Enter OTP
    const otpInput = screen.getByLabelText('Receiver OTP');
    fireEvent.change(otpInput, { target: { value: '123456' } });

    // 2. Click Capture GPS
    const gpsBtn = screen.getByRole('button', { name: 'Capture GPS' });
    fireEvent.click(gpsBtn);

    // 3. Attach file
    const file = new File(['dummy content'], 'photo.png', { type: 'image/png' });
    const inputEl = screen.getByLabelText(/Receiver OTP/).closest('form').querySelector('input[type="file"]');
    fireEvent.change(inputEl, { target: { files: [file] } });

    // 4. Fill signature
    const sigInput = screen.getByLabelText('Type full name as signature');
    fireEvent.change(sigInput, { target: { value: 'John Doe' } });

    // 5. Consent checkbox
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);

    // 6. Submit
    const submitBtn = screen.getByRole('button', { name: 'Verify and Seal Proof' });
    fireEvent.click(submitBtn);

    expect(onSubmit).toHaveBeenCalled();
  });
});
