import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderWithQuery } from '../test/renderWithQuery.jsx';
import { server } from '../test/mocks/server.js';
import DocumentsPage from './DocumentsPage.jsx';

const client = {
  id: 'user-1',
  email: 'shipper@example.com',
  role: 'client',
  documents: []
};

const owner = {
  id: 'owner-1',
  email: 'owner@example.com',
  role: 'owner',
  documents: []
};

function uploadResponse() {
  return HttpResponse.json({ urls: ['https://cdn.example.test/document.pdf'] });
}

describe('DocumentsPage server-state workflows', () => {
  const notify = vi.fn();
  const setUser = vi.fn();

  beforeEach(() => {
    notify.mockClear();
    setUser.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  test('uploads a profile document and applies the returned review state', async () => {
    server.use(
      http.get('*/api/users/profile', () => HttpResponse.json({ user: client })),
      http.get('*/api/bookings', () => HttpResponse.json({ bookings: [] })),
      http.post('*/api/upload/cargo', uploadResponse),
      http.patch('*/api/users/documents/:documentType', ({ params }) =>
        HttpResponse.json({
          user: {
            ...client,
            documents: [{ type: params.documentType, status: 'pending', url: 'https://cdn.example.test/document.pdf' }]
          }
        })
      )
    );

    const view = renderWithQuery(<DocumentsPage notify={notify} user={client} setUser={setUser} />);
    fireEvent.click(await screen.findByRole('button', { name: /Shipper KYC.*Upload/ }));
    fireEvent.change(view.container.querySelector('input[type="file"]'), {
      target: { files: [new File(['kyc'], 'kyc.pdf', { type: 'application/pdf' })] }
    });

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Document sent to admin review'));
    expect(await screen.findByRole('button', { name: /Shipper KYC.*Under Review/ })).toBeInTheDocument();
    expect(setUser).toHaveBeenCalledWith(
      expect.objectContaining({ documents: [expect.objectContaining({ status: 'pending' })] })
    );
  });

  test('updates fleet and booking document cards from upload responses', async () => {
    let truckDocuments = [];
    let bookingDocuments = [];
    server.use(
      http.get('*/api/users/profile', () => HttpResponse.json({ user: owner })),
      http.get('*/api/trucks/fleet', () =>
        HttpResponse.json({
          trucks: [
            {
              _id: 'truck-1',
              plateNumber: 'KDA 101A',
              make: 'Isuzu',
              model: 'FVR',
              documents: truckDocuments
            }
          ]
        })
      ),
      http.get('*/api/bookings', () =>
        HttpResponse.json({
          bookings: [
            {
              _id: 'booking-1',
              pickup: 'Nairobi',
              destination: 'Kampala',
              cargo: 'Tea',
              status: 'confirmed',
              documents: bookingDocuments,
              estimate: { requiredDocuments: ['Cargo photos'] }
            }
          ]
        })
      ),
      http.post('*/api/upload/cargo', uploadResponse),
      http.patch('*/api/trucks/:truckId/documents/:documentType', ({ params }) => {
        truckDocuments = [{ type: params.documentType, status: 'pending' }];
        return HttpResponse.json({
          truck: {
            _id: 'truck-1',
            plateNumber: 'KDA 101A',
            make: 'Isuzu',
            model: 'FVR',
            documents: truckDocuments
          }
        });
      }),
      http.patch('*/api/bookings/:bookingId/documents/:documentType', ({ params }) => {
        bookingDocuments = [
          { type: params.documentType, status: 'pending', url: 'https://cdn.example.test/document.pdf' }
        ];
        return HttpResponse.json({
          booking: {
            _id: 'booking-1',
            pickup: 'Nairobi',
            destination: 'Kampala',
            cargo: 'Tea',
            status: 'confirmed',
            documents: bookingDocuments,
            estimate: { requiredDocuments: ['Cargo photos'] }
          }
        });
      })
    );

    const view = renderWithQuery(<DocumentsPage notify={notify} user={owner} setUser={setUser} />);
    const truckCard = (await screen.findByText('KDA 101A')).closest('.quote-card');
    fireEvent.click(within(truckCard).getByRole('button', { name: /Insurance.*Upload/ }));
    fireEvent.change(view.container.querySelector('input[type="file"]'), {
      target: { files: [new File(['insurance'], 'insurance.pdf', { type: 'application/pdf' })] }
    });
    expect(await within(truckCard).findByRole('button', { name: /Insurance.*Under Review/ })).toBeInTheDocument();

    const bookingCard = (await screen.findAllByText('booking-1'))[0].closest('.quote-card');
    fireEvent.click(within(bookingCard).getByRole('button', { name: /Cargo photos.*Upload/ }));
    fireEvent.change(view.container.querySelector('input[type="file"]'), {
      target: { files: [new File(['cargo'], 'cargo.jpg', { type: 'image/jpeg' })] }
    });
    expect(await within(bookingCard).findByRole('button', { name: /Cargo photos.*Review/ })).toBeInTheDocument();
    expect(notify).toHaveBeenCalledWith('Document sent to admin review');
  });

  test('shows retryable shipment document failures without demo records', async () => {
    let failing = true;
    server.use(
      http.get('*/api/users/profile', () => HttpResponse.json({ user: client })),
      http.get('*/api/bookings', () =>
        failing ? new HttpResponse(null, { status: 500 }) : HttpResponse.json({ bookings: [] })
      )
    );

    renderWithQuery(<DocumentsPage notify={notify} user={client} setUser={setUser} />);
    await screen.findByText('Shipment documents could not be loaded');
    expect(screen.queryByText('ITK-1002')).not.toBeInTheDocument();
    failing = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No shipment documents')).toBeInTheDocument();
  });
});
