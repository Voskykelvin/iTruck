import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import TrackingPage from './TrackingPage.jsx';
import { server } from '../test/mocks/server.js';
import { http, HttpResponse } from 'msw';

const mockNotify = vi.fn();

const driverUser = {
  id: 'usr-driver',
  email: 'driver@example.com',
  role: 'driver',
  firstName: 'Sam',
  lastName: 'Driver',
  isVerified: true
};

const clientUser = {
  id: 'usr-shipper',
  email: 'shipper@example.com',
  role: 'client',
  firstName: 'John',
  lastName: 'Doe',
  isVerified: true
};

describe('TrackingPage Interaction & Verification Tests', () => {
  beforeEach(() => {
    mockNotify.mockClear();
    localStorage.clear();
    window.confirm = vi.fn().mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
  });

  test('Driver: runs live tracking start/stop and sync flows', async () => {
    server.use(
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Nairobi',
              cargo: 'Machine parts',
              status: 'In transit',
              progress: 40,
              driver: {
                firstName: 'Sam',
                lastName: 'Driver'
              }
            }
          ]
        });
      }),
      http.post('*/api/bookings/:bookingId/tracking', () => {
        return HttpResponse.json({
          booking: {
            id: 'ITK-1002',
            bookingId: 'ITK-1002',
            status: 'In transit'
          }
        });
      }),
      http.get('*/api/workflow/messages', () => HttpResponse.json({ items: [] })),
      http.get('*/api/cases', () => HttpResponse.json({ cases: [] }))
    );

    render(<TrackingPage notify={mockNotify} user={driverUser} />);

    await screen.findByText('Driver GPS');

    // Start Live GPS tracking
    const startBtn = screen.getByRole('button', { name: 'Start' });
    fireEvent.click(startBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Live tracking started');
    });

    // Stop Live GPS tracking
    const stopBtn = screen.getByRole('button', { name: 'Stop' });
    fireEvent.click(stopBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Live tracking stopped');
    });
  });

  test('Client: confirms delivery once receiver proof is present', async () => {
    server.use(
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Nairobi',
              cargo: 'Machine parts',
              status: 'In transit',
              progress: 88,
              deliveryProof: {
                proof: 'pod-proof',
                recordHash: 'a'.repeat(64), // valid 64-char hex hash
                verificationMethod: 'sms_otp',
                verifiedAt: new Date().toISOString(),
                photoCount: 1
              },
              bookingDocuments: [
                {
                  type: 'pod',
                  status: 'approved',
                  url: 'https://example.com/pod.pdf'
                }
              ]
            }
          ]
        });
      }),
      http.patch('*/api/bookings/:bookingId/confirm-delivery', () => {
        return HttpResponse.json({
          booking: {
            id: 'ITK-1002',
            bookingId: 'ITK-1002',
            status: 'Delivered',
            progress: 100
          }
        });
      }),
      http.get('*/api/workflow/messages', () => HttpResponse.json({ items: [] })),
      http.get('*/api/cases', () => HttpResponse.json({ cases: [] }))
    );

    render(<TrackingPage notify={mockNotify} user={clientUser} />);
    await screen.findByText('Closeout');

    // Renders "Confirm Delivery" button
    const confirmBtn = screen.getByRole('button', { name: 'Confirm Delivery' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Delivery confirmed');
    });
  });

  test('Support Cases: reports new issue, comments on and reopens resolution', async () => {
    server.use(
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Nairobi',
              status: 'In transit'
            }
          ]
        });
      }),
      http.get('*/api/workflow/messages', () => HttpResponse.json({ items: [] })),
      // Initial list has no cases, then reports one
      http.get('*/api/cases', () => {
        return HttpResponse.json({
          cases: [
            {
              id: 'CASE-111',
              _id: 'CASE-111',
              caseNumber: 'CASE-111',
              booking: 'ITK-1002',
              title: 'Damaged cargo',
              message: 'Found cargo wet',
              status: 'resolved',
              priority: 'normal',
              comments: [
                {
                  body: 'Initial comment',
                  author: { email: 'admin@example.com' },
                  createdAt: new Date().toISOString()
                }
              ]
            }
          ]
        });
      }),
      http.post('*/api/cases', () => {
        return HttpResponse.json({
          success: true,
          case: {
            id: 'CASE-111',
            _id: 'CASE-111',
            caseNumber: 'CASE-111',
            booking: 'ITK-1002',
            title: 'Damaged cargo',
            message: 'Found cargo wet',
            status: 'resolved',
            priority: 'normal'
          }
        });
      }),
      http.post('*/api/cases/:id/reopen', () => {
        return HttpResponse.json({
          success: true,
          case: {
            id: 'CASE-111',
            _id: 'CASE-111',
            status: 'open',
            priority: 'normal'
          }
        });
      })
    );

    render(<TrackingPage notify={mockNotify} user={clientUser} />);
    await screen.findByText('Support');

    // 1. Report issue modal flow
    const reportBtn = screen.getByRole('button', { name: 'Report Issue' });
    fireEvent.click(reportBtn);

    await screen.findByRole('heading', { name: 'Report Issue' });

    const descInput = screen.getByLabelText('Description');
    fireEvent.change(descInput, { target: { value: 'Wet cement bags' } });

    const submitIssueBtn = screen.getByRole('button', { name: 'Submit Report' });
    fireEvent.click(submitIssueBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Support case sent to operations');
    });

    // 2. Case Workspace exists
    await screen.findByText('CASE-111');

    // 3. Reopen resolved case
    const reopenBtn = screen.getByRole('button', { name: 'Reopen case' });
    fireEvent.click(reopenBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Case reopened');
    });
  });

  test('Ratings: submits rating star scores once delivered', async () => {
    server.use(
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Nairobi',
              status: 'Delivered',
              progress: 100
            }
          ]
        });
      }),
      http.get('*/api/workflow/messages', () => HttpResponse.json({ items: [] })),
      http.get('*/api/cases', () => HttpResponse.json({ cases: [] })),
      http.post('*/api/bookings/:bookingId/ratings', () => {
        return HttpResponse.json({ success: true });
      })
    );

    render(<TrackingPage notify={mockNotify} user={clientUser} />);

    await screen.findByText('Rate Carrier');

    // Click score 5 star button
    const starBtn = screen.getByRole('button', { name: 'Rate Carrier 5 out of 5' });
    fireEvent.click(starBtn);

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith('Carrier rating recorded');
    });
  });

  test('Chat: receives loaded messages and sends chat updates', async () => {
    server.use(
      http.get('*/api/bookings', () => {
        return HttpResponse.json({
          bookings: [
            {
              id: 'ITK-1002',
              bookingId: 'ITK-1002',
              route: 'Mombasa to Nairobi',
              status: 'In transit'
            }
          ]
        });
      }),
      http.get('*/api/workflow/messages', () => {
        return HttpResponse.json({
          items: [
            {
              id: 'msg-1',
              payload: {
                text: 'On our way',
                senderName: 'Driver Sam'
              },
              createdAt: new Date().toISOString()
            }
          ]
        });
      }),
      http.post('*/api/workflow/messages', () => {
        return HttpResponse.json({ success: true });
      }),
      http.get('*/api/cases', () => HttpResponse.json({ cases: [] }))
    );

    // Render with contact query parameter to open chat pane immediately
    render(<TrackingPage notify={mockNotify} route="/app/tracking?contact=driver" user={clientUser} />);

    await screen.findByText('Driver Chat');
    expect(screen.getByText('On our way')).toBeInTheDocument();

    // Type a reply message
    const chatInput = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(chatInput, { target: { value: 'Drive safe!' } });

    // Click send button
    const sendBtn = screen.getByLabelText('Send message');
    fireEvent.click(sendBtn);

    expect(chatInput.value).toBe(''); // chatInput cleared
  });
});
