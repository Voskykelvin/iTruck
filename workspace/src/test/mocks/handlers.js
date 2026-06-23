import { http, HttpResponse } from 'msw';
import { demoFleet, demoShipments } from '../../data.js';

export const handlers = [
  http.get('*/api/users/profile', () => {
    return HttpResponse.json({
      user: {
        id: 'usr-shipper',
        email: 'shipper@example.com',
        role: 'shipper',
        isVerified: true,
        displayName: 'Test Shipper',
        phone: '+254700000000',
        onboardingState: 'completed'
      }
    });
  }),

  http.patch('*/api/users/profile', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      user: {
        id: 'usr-shipper',
        email: 'shipper@example.com',
        role: 'shipper',
        isVerified: true,
        displayName: 'Test Shipper',
        phone: '+254700000000',
        onboardingState: 'completed',
        ...body
      }
    });
  }),

  http.get('*/api/notifications', () => {
    return HttpResponse.json({
      notifications: [
        {
          id: 'n1',
          type: 'bid.received',
          title: 'New carrier bid on ITK-1002',
          message: 'Carrier proposed $2,300 for Mombasa to Dar es Salaam.',
          read: false,
          createdAt: new Date().toISOString(),
          link: '/app/bids'
        }
      ]
    });
  }),

  http.patch('*/api/notifications/read-all', () => {
    return HttpResponse.json({ success: true });
  }),

  http.patch('*/api/notifications/:id/read', () => {
    return HttpResponse.json({ success: true });
  }),

  http.get('*/api/bookings', () => {
    return HttpResponse.json({ bookings: demoShipments });
  }),

  http.get('*/api/bookings/open', () => {
    return HttpResponse.json({ bookings: demoShipments.filter((s) => s.status === 'Bids open') });
  }),

  http.get('*/api/bookings/:bookingId', ({ params }) => {
    const { bookingId } = params;
    const shipment = demoShipments.find((s) => s.id === bookingId) || demoShipments[0];
    return HttpResponse.json({ booking: shipment });
  }),

  http.post('*/api/bookings', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      booking: {
        id: `ITK-${Math.floor(1000 + Math.random() * 9000)}`,
        status: 'Bids open',
        progress: 0,
        ...body
      }
    });
  }),

  http.patch('*/api/bookings/:bookingId/status', async ({ params, request }) => {
    const { bookingId } = params;
    const body = await request.json();
    return HttpResponse.json({
      booking: {
        id: bookingId,
        ...body
      }
    });
  }),

  http.get('*/api/trucks', () => {
    return HttpResponse.json({ trucks: demoFleet });
  }),

  http.get('*/api/trucks/fleet', () => {
    return HttpResponse.json({ trucks: demoFleet });
  }),

  http.post('*/api/trucks', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      truck: {
        id: `TRK-${Math.floor(100 + Math.random() * 900)}`,
        ...body
      }
    });
  }),

  http.delete('*/api/trucks/:truckId', () => {
    return HttpResponse.json({ success: true });
  }),

  http.get('*/api/payments/wallet', () => {
    return HttpResponse.json({
      wallet: {
        balance: 2500,
        escrowBalance: 1200,
        currency: 'USD',
        transactions: [
          { id: 'tx-001', type: 'Credit', amount: 500, status: 'Completed', createdAt: new Date().toISOString() }
        ]
      }
    });
  }),

  http.post('*/api/payments/wallet/credit', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      success: true,
      amount: body.amount
    });
  }),

  http.post('*/api/payments/bookings/:bookingId/escrow', () => {
    return HttpResponse.json({ success: true });
  }),

  http.post('*/api/payments/bookings/:bookingId/mobile-money', () => {
    return HttpResponse.json({ success: true });
  }),

  http.post('*/api/payments/bookings/:bookingId/release', () => {
    return HttpResponse.json({ success: true });
  }),

  http.post('*/api/payments/withdraw', () => {
    return HttpResponse.json({ success: true });
  }),

  http.get('*/api/workflow/messages', () => {
    return HttpResponse.json({
      messages: [{ id: 'm1', sender: 'Carrier', content: 'On my way to pickup', createdAt: new Date().toISOString() }]
    });
  }),

  http.post('*/api/workflow/messages', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      message: {
        id: `msg-${Math.random()}`,
        ...body,
        createdAt: new Date().toISOString()
      }
    });
  }),

  http.get('*/api/cases', () => {
    return HttpResponse.json({ cases: [] });
  }),

  http.post('*/api/cases', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      case: {
        id: 'case-001',
        ...body,
        status: 'Open',
        createdAt: new Date().toISOString()
      }
    });
  }),

  http.get('*/api/documents', () => {
    return HttpResponse.json({ documents: [] });
  }),

  http.get('*/api/drivers', () => {
    return HttpResponse.json({ drivers: [] });
  }),

  http.post('*/api/drivers/invitations', () => {
    return HttpResponse.json({ success: true, invitation: { id: 'inv-123', email: 'driver@example.com' } });
  }),

  http.delete('*/api/drivers/invitations/:invitationId', () => {
    return HttpResponse.json({ success: true });
  }),

  http.post('*/api/auth/login', () => {
    return HttpResponse.json({
      user: {
        id: 'usr-shipper',
        email: 'shipper@example.com',
        role: 'shipper',
        isVerified: true
      }
    });
  }),

  http.post('*/api/auth/logout', () => {
    return HttpResponse.json({ success: true });
  }),

  http.get('*/api/auth/sessions', () => {
    return HttpResponse.json({ sessions: [] });
  }),

  http.delete('*/api/auth/sessions/:id', () => {
    return HttpResponse.json({ success: true });
  }),

  http.delete('*/api/auth/sessions', () => {
    return HttpResponse.json({ success: true });
  }),

  http.post('*/api/auth/register/:role', ({ params }) => {
    const { role } = params;
    return HttpResponse.json({
      user: {
        id: 'usr-registered',
        email: 'registered@example.com',
        role,
        isVerified: false
      }
    });
  }),

  // Maps / Marketplace Config
  http.get('*/api/maps/config', () => {
    return HttpResponse.json({ googleMapsApiKey: 'mock-key' });
  }),

  http.post('*/api/marketplace/estimate', () => {
    return HttpResponse.json({
      estimatedPrice: 450,
      distanceKm: 120,
      durationHrs: 2.5
    });
  }),

  http.post('*/api/maps/geocode', () => {
    return HttpResponse.json({
      lat: -1.2921,
      lng: 36.8219,
      formattedAddress: 'Nairobi, Kenya'
    });
  }),

  http.post('*/api/maps/route', () => {
    return HttpResponse.json({
      distance: { text: '120 km', value: 120000 },
      duration: { text: '2 hours 30 mins', value: 9000 },
      overviewPolyline: 'mock_polyline'
    });
  }),

  http.get('*/api/marketplace/matches/:bookingId', () => {
    return HttpResponse.json({ matches: [] });
  }),

  http.post('*/api/marketplace/auto-assign/:bookingId', () => {
    return HttpResponse.json({ success: true });
  }),

  http.get('*/api/marketplace/dispatch/:bookingId', () => {
    return HttpResponse.json({ success: true });
  }),

  // Admin stats / data
  http.get('*/api/admin/stats', () => {
    return HttpResponse.json({
      stats: {
        totalUsers: 10,
        totalBookings: 15,
        totalRevenue: 50000,
        activeTrucks: 8
      }
    });
  }),

  http.get('*/api/admin/users', () => {
    return HttpResponse.json({ users: [] });
  }),

  http.get('*/api/admin/trucks', () => {
    return HttpResponse.json({ trucks: [] });
  }),

  http.get('*/api/admin/bookings', () => {
    return HttpResponse.json({ bookings: [] });
  }),

  http.get('*/api/admin/payments', () => {
    return HttpResponse.json({ payments: [] });
  }),

  http.get('*/api/admin/audit-logs', () => {
    return HttpResponse.json({ logs: [] });
  }),

  http.get('*/api/admin/cases', () => {
    return HttpResponse.json({ cases: [] });
  }),

  // Booking bids
  http.patch('*/api/bookings/:bookingId/bids/:bidId/accept', () => {
    return HttpResponse.json({ success: true });
  }),

  http.patch('*/api/bookings/:bookingId/bids/:bidId/reject', () => {
    return HttpResponse.json({ success: true });
  }),

  http.patch('*/api/bookings/:bookingId/bids/:bidId/counter', () => {
    return HttpResponse.json({ success: true });
  }),

  http.patch('*/api/bookings/:bookingId/bids/:bidId/respond-counter', () => {
    return HttpResponse.json({ success: true });
  }),

  http.patch('*/api/bookings/:bookingId/bids/:bidId/withdraw', () => {
    return HttpResponse.json({ success: true });
  }),

  http.patch('*/api/bookings/:bookingId/bids/:bidId/acknowledge', () => {
    return HttpResponse.json({ success: true });
  }),

  http.post('*/api/bookings/:bookingId/bids', () => {
    return HttpResponse.json({ success: true });
  }),

  // Driver assign
  http.patch('*/api/drivers/:driverId/truck', () => {
    return HttpResponse.json({ success: true });
  }),

  http.delete('*/api/drivers/:driverId/truck', () => {
    return HttpResponse.json({ success: true });
  }),

  http.patch('*/api/drivers/bookings/:bookingId/driver', () => {
    return HttpResponse.json({ success: true });
  }),

  // Admin Actions
  http.get('*/api/admin/notification-deliveries', () => {
    return HttpResponse.json({ deliveries: [] });
  }),

  http.post('*/api/admin/notification-deliveries/:id/retry', () => {
    return HttpResponse.json({ success: true });
  }),

  http.patch('*/api/admin/users/:userId/documents/:documentType', () => {
    return HttpResponse.json({ success: true, user: { id: 'usr-shipper', isVerified: true } });
  }),

  http.patch('*/api/admin/trucks/:truckId/documents/:documentType', () => {
    return HttpResponse.json({ success: true, truck: { id: 'trk-1', verified: true } });
  }),

  http.patch('*/api/admin/bookings/:bookingId/documents/:documentType', () => {
    return HttpResponse.json({ success: true, booking: { id: 'bk-1' } });
  }),

  http.patch('*/api/admin/users/:userId/verification', () => {
    return HttpResponse.json({ success: true });
  }),

  http.patch('*/api/admin/trucks/:truckId/verification', () => {
    return HttpResponse.json({ success: true });
  }),

  http.patch('*/api/admin/cases/:id/assign', () => {
    return HttpResponse.json({ success: true });
  }),

  http.patch('*/api/admin/cases/:id/status', () => {
    return HttpResponse.json({ success: true });
  }),

  http.post('*/api/admin/cases/:id/comments', () => {
    return HttpResponse.json({ success: true });
  }),

  http.post('*/api/admin/cases/:id/resolve', () => {
    return HttpResponse.json({ success: true });
  }),

  http.post('*/api/admin/cases/:id/reopen', () => {
    return HttpResponse.json({ success: true });
  }),

  // Notification Preferences
  http.get('*/api/notifications/preferences', () => {
    return HttpResponse.json({
      preferences: {
        channels: { inApp: true, email: true, sms: false, push: false },
        categories: {
          bookings: true,
          tracking: true,
          documents: true,
          payments: true,
          security: true,
          system: true,
          marketing: false
        },
        quietHours: { enabled: false, start: '22:00', end: '07:00', timezone: 'UTC', allowHighPriority: true }
      }
    });
  }),

  http.patch('*/api/notifications/preferences', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      preferences: body
    });
  }),

  http.post('*/api/notifications/test', () => {
    return HttpResponse.json({ success: true });
  }),

  http.post('*/api/bookings/:bookingId/tracking', () => {
    return HttpResponse.json({
      booking: demoShipments[0]
    });
  }),

  http.post('*/api/bookings/:bookingId/tracking/batch', () => {
    return HttpResponse.json({
      booking: demoShipments[0]
    });
  }),

  http.get('*/api/documents/:type/:bookingId', () => {
    return new HttpResponse('dummy pdf content', {
      headers: {
        'Content-Type': 'application/pdf'
      }
    });
  }),

  http.post('*/api/documents/draft/:type', () => {
    return new HttpResponse('dummy pdf draft content', {
      headers: {
        'Content-Type': 'application/pdf'
      }
    });
  })
];
