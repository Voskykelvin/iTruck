import { http, HttpResponse } from 'msw';
import { demoFleet, demoShipments } from '../../data.js';

export const handlers = [
  http.get('*/api/users/profile', () => {
    const cached = JSON.parse(localStorage.getItem('itruck_user') || '{}');
    if (!cached.email) return HttpResponse.json({ message: 'Authentication required' }, { status: 401 });
    return HttpResponse.json({ user: cached });
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
    const enriched = demoShipments.map((s) => {
      if (s.id === 'ITK-1002') {
        return {
          ...s,
          rawStatus: 'bidding',
          bids: [
            {
              id: 'bid-1',
              bidId: 'bid-1',
              ownerName: 'Carrier One',
              truckName: 'Scania R450',
              message: 'Available immediately',
              amount: 2200,
              status: 'pending'
            }
          ]
        };
      }
      return s;
    });
    return HttpResponse.json({ bookings: enriched });
  }),

  http.get('*/api/bookings/open', () => {
    const openBookings = demoShipments
      .filter((s) => s.status === 'Bids open')
      .map((s) => ({
        ...s,
        rawStatus: 'bidding',
        bids: [
          {
            id: 'bid-1',
            bidId: 'bid-1',
            ownerName: 'Carrier One',
            truckName: 'Scania R450',
            message: 'Available immediately',
            amount: 2200,
            status: 'pending'
          }
        ]
      }));
    return HttpResponse.json({ bookings: openBookings });
  }),

  http.get('*/api/bookings/:bookingId', ({ params }) => {
    const { bookingId } = params;
    const shipment = demoShipments.find((s) => s.id === bookingId) || demoShipments[0];
    const enriched = {
      ...shipment,
      rawStatus: shipment.status === 'Bids open' ? 'bidding' : 'in_transit',
      bids: [
        {
          id: 'bid-1',
          bidId: 'bid-1',
          ownerName: 'Carrier One',
          truckName: 'Scania R450',
          message: 'Available immediately',
          amount: 2200,
          status: 'pending'
        }
      ]
    };
    return HttpResponse.json({ booking: enriched });
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
      balance: 2500,
      transactions: [
        { id: 'tx-001', type: 'Credit', amount: 500, status: 'Completed', createdAt: new Date().toISOString() }
      ]
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
      items: [
        {
          id: 'm1',
          user: { id: 'owner-1', role: 'owner', firstName: 'Carrier' },
          payload: { text: 'On my way to pickup' },
          createdAt: new Date().toISOString()
        }
      ]
    });
  }),

  http.post('*/api/workflow/messages', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      item: {
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

  http.post('*/api/marketplace/estimate', async ({ request }) => {
    const body = await request.json();
    return HttpResponse.json({
      total: 450,
      currency: 'USD',
      confidence: 'high',
      recommendedMode: 'instant-match',
      routeRisk: 'low',
      lineItems: [
        { key: 'basePrice', label: `${body.vehicleType || 'Lorry'} lane estimate`, amount: 410 },
        { key: 'escrowFee', label: 'Escrow and payment handling', amount: 40 }
      ],
      requiredDocuments: ['Waybill', 'Commercial invoice'],
      route: { distance: Number(body.distance || 120) }
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
    return HttpResponse.json({
      matches: [
        {
          score: 95,
          reasons: ['Inside operating zone', 'Equipped with refrigerated box'],
          truck: { id: 'TRK-001', plateNumber: 'KAA 123A' }
        }
      ]
    });
  }),

  http.post('*/api/marketplace/auto-assign/:bookingId', ({ params }) => {
    const { bookingId } = params;
    return HttpResponse.json({
      success: true,
      booking: {
        id: bookingId,
        bookingId,
        status: 'Assigned',
        route: 'Nairobi to Kampala',
        cargo: 'General cargo'
      },
      truck: { plateNumber: 'KAA 123A' }
    });
  }),

  http.get('*/api/marketplace/dispatch/:bookingId', () => {
    return HttpResponse.json({ success: true });
  }),

  // Admin stats / data
  http.get('*/api/admin/stats', () => {
    return HttpResponse.json({
      totalUsers: 10,
      totalBookings: 15,
      totalRevenue: 50000,
      totalTrucks: 8
    });
  }),

  http.get('*/api/admin/users', () => {
    return HttpResponse.json({
      users: [
        {
          id: 'usr-carrier-unverified',
          _id: 'usr-carrier-unverified',
          firstName: 'John',
          lastName: 'Carrier',
          email: 'carrier-unverified@example.com',
          role: 'owner',
          isVerified: false,
          documents: [
            { type: 'business_registration', status: 'pending', url: 'https://example.com/biz.pdf' },
            { type: 'owner_kyc', status: 'approved', url: 'https://example.com/kyc.pdf' },
            { type: 'driver_id', status: 'approved', url: 'https://example.com/id.pdf' },
            { type: 'insurance', status: 'approved', url: 'https://example.com/ins.pdf' }
          ]
        },
        {
          id: 'usr-shipper-verified',
          _id: 'usr-shipper-verified',
          firstName: 'Alice',
          lastName: 'Shipper',
          email: 'shipper-verified@example.com',
          role: 'client',
          isVerified: true,
          documents: []
        }
      ]
    });
  }),

  http.get('*/api/admin/trucks', () => {
    return HttpResponse.json({
      trucks: [
        {
          id: 'TRK-003',
          _id: 'TRK-003',
          type: 'Bus',
          name: 'Yutong ZK6122',
          plate: 'TRK 003',
          owner: 'Carrier Pending',
          company: 'City Logistics',
          pricePerKm: 1.9,
          capacity: 'Mixed cargo',
          verified: false,
          isVerified: false,
          photos: ['https://example.com/truck.jpg'],
          documents: [
            { type: 'road_license', status: 'pending', url: 'https://example.com/road.pdf' },
            { type: 'insurance', status: 'approved', url: 'https://example.com/ins.pdf' },
            { type: 'vehicle_logbook', status: 'approved', url: 'https://example.com/logbook.pdf' },
            { type: 'inspection_report', status: 'approved', url: 'https://example.com/inspection.pdf' }
          ]
        }
      ]
    });
  }),

  http.get('*/api/admin/bookings', () => {
    return HttpResponse.json({
      bookings: [
        {
          id: 'ITK-1001',
          _id: 'ITK-1001',
          bookingId: 'ITK-1001',
          route: 'Nairobi to Kampala',
          pickup: 'Nairobi',
          destination: 'Kampala',
          status: 'in_transit',
          progress: 64,
          documents: [{ type: 'waybill', status: 'pending', url: 'https://example.com/waybill.pdf' }]
        },
        {
          id: 'ITK-1003',
          _id: 'ITK-1003',
          bookingId: 'ITK-1003',
          route: 'Accra to Lagos',
          pickup: 'Accra',
          destination: 'Lagos',
          status: 'delivered',
          paymentStatus: 'escrowed',
          progress: 100,
          documents: [{ type: 'waybill', status: 'approved', url: 'https://example.com/waybill.pdf' }]
        }
      ]
    });
  }),

  http.get('*/api/admin/payments', () => {
    return HttpResponse.json({
      transactions: [
        {
          id: 'TXN-001',
          _id: 'TXN-001',
          type: 'Credit',
          amount: 5000,
          status: 'Completed',
          createdAt: new Date().toISOString()
        }
      ]
    });
  }),

  http.get('*/api/admin/audit-logs', () => {
    return HttpResponse.json({
      logs: [
        {
          id: 'LOG-001',
          _id: 'LOG-001',
          action: 'approve_kyc',
          actor: 'admin@example.com',
          details: 'Approved KYC for John Carrier',
          createdAt: new Date().toISOString()
        }
      ]
    });
  }),

  http.get('*/api/admin/cases', () => {
    return HttpResponse.json({
      cases: [
        {
          id: 'CASE-001',
          _id: 'CASE-001',
          booking: 'ITK-1001',
          title: 'Damaged cargo',
          status: 'open',
          createdAt: new Date().toISOString()
        }
      ]
    });
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
    return HttpResponse.json({
      deliveries: [
        {
          id: 'DEL-001',
          _id: 'DEL-001',
          status: 'failed',
          recipient: 'carrier@example.com',
          title: 'Bid status update',
          message: 'Your bid was accepted',
          channel: 'sms',
          booking: 'ITK-1001',
          error: 'SMS provider timeout',
          createdAt: new Date().toISOString()
        }
      ]
    });
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

  http.delete('*/api/admin/users/:userId', () => {
    return HttpResponse.json({ success: true, removed: { trucks: 0 } });
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
