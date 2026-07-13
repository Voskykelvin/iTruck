import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { renderWithQuery } from '../test/renderWithQuery.jsx';
import { server } from '../test/mocks/server.js';
import MessagesPage from './MessagesPage.jsx';

const user = {
  id: 'user-1',
  email: 'shipper@example.com',
  role: 'client',
  firstName: 'Jane',
  lastName: 'Shipper'
};

const bookings = [
  { _id: 'booking-1', pickup: 'Nairobi', destination: 'Kampala', cargo: 'Tea', status: 'in_transit' },
  { _id: 'booking-2', pickup: 'Mombasa', destination: 'Arusha', cargo: 'Parts', status: 'confirmed' }
];

describe('MessagesPage server conversations', () => {
  const notify = vi.fn();

  beforeEach(() => {
    notify.mockClear();
    localStorage.clear();
  });

  afterEach(() => cleanup());

  test('loads message history and appends only the server-confirmed sent message', async () => {
    server.use(
      http.get('*/api/bookings', () => HttpResponse.json({ bookings })),
      http.get('*/api/workflow/messages', ({ request }) => {
        const booking = new URL(request.url).searchParams.get('booking');
        return HttpResponse.json({
          items:
            booking === 'booking-1'
              ? [
                  {
                    _id: 'message-1',
                    user: { _id: 'owner-1', firstName: 'Omar', role: 'owner' },
                    payload: { text: 'Truck is at the pickup gate' },
                    createdAt: '2026-07-13T08:00:00.000Z'
                  }
                ]
              : []
        });
      }),
      http.post('*/api/workflow/messages', async ({ request }) => {
        const body = await request.json();
        return HttpResponse.json(
          {
            item: {
              _id: 'message-2',
              user: { _id: 'user-1', firstName: 'Jane', role: 'client' },
              payload: body,
              createdAt: '2026-07-13T08:05:00.000Z'
            }
          },
          { status: 201 }
        );
      })
    );

    renderWithQuery(<MessagesPage notify={notify} user={user} />);
    expect(await screen.findByText('Truck is at the pickup gate')).toBeInTheDocument();

    const input = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(input, { target: { value: 'Receiver is ready' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByText('Receiver is ready')).toBeInTheDocument();
    expect(input).toHaveValue('');
    expect(localStorage.getItem('itruck_chat_booking-1')).toBeNull();
  });

  test('keeps a failed message draft available for retry without local delivery state', async () => {
    server.use(
      http.get('*/api/bookings', () => HttpResponse.json({ bookings: [bookings[0]] })),
      http.get('*/api/workflow/messages', () => HttpResponse.json({ items: [] })),
      http.post('*/api/workflow/messages', () =>
        HttpResponse.json({ message: 'Messaging service is unavailable' }, { status: 503 })
      )
    );

    renderWithQuery(<MessagesPage notify={notify} user={user} />);
    await screen.findByText('No messages in this thread');
    const input = screen.getByPlaceholderText('Type a message...');
    fireEvent.change(input, { target: { value: 'Please call me' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() => expect(notify).toHaveBeenCalledWith('Messaging service is unavailable'));
    expect(input).toHaveValue('Please call me');
    expect(screen.queryByText('Please call me')).not.toBeInTheDocument();
    expect(localStorage.getItem('itruck_chat_booking-1')).toBeNull();
    expect(localStorage.getItem('itruck_messages')).toBeNull();
  });

  test('switches booking-scoped histories and applies live socket messages', async () => {
    server.use(
      http.get('*/api/bookings', () => HttpResponse.json({ bookings })),
      http.get('*/api/workflow/messages', ({ request }) => {
        const booking = new URL(request.url).searchParams.get('booking');
        return HttpResponse.json({
          items: [{ _id: `${booking}-message`, payload: { text: `History for ${booking}` } }]
        });
      })
    );

    renderWithQuery(<MessagesPage notify={notify} user={user} />);
    await screen.findByText('History for booking-1');
    fireEvent.click(screen.getByRole('button', { name: /booking-2.*Mombasa to Arusha/i }));
    await screen.findByText('History for booking-2');

    globalThis.__itruckSocketHandlers['message:new']?.({
      _id: 'live-message',
      user: { _id: 'owner-1', firstName: 'Omar', role: 'owner' },
      payload: { text: 'Live arrival update' }
    });
    expect(await screen.findByText('Live arrival update')).toBeInTheDocument();
    expect(screen.queryByText('History for booking-1')).not.toBeInTheDocument();
  });

  test('shows retryable booking and history failures without demo conversations', async () => {
    let bookingsFail = true;
    let messagesFail = true;
    server.use(
      http.get('*/api/bookings', () =>
        bookingsFail ? new HttpResponse(null, { status: 500 }) : HttpResponse.json({ bookings: [bookings[0]] })
      ),
      http.get('*/api/workflow/messages', () =>
        messagesFail ? new HttpResponse(null, { status: 500 }) : HttpResponse.json({ items: [] })
      )
    );

    renderWithQuery(<MessagesPage notify={notify} user={user} />);
    await screen.findByText('Conversations could not be loaded');
    expect(screen.queryByText('ITK-1002')).not.toBeInTheDocument();
    bookingsFail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    await screen.findByText('Message history could not be loaded');
    messagesFail = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('No messages in this thread')).toBeInTheDocument();
  });
});
