const memoryBookings = [
  {
    _id: 'ITK-2044',
    client: 'demo-client-primary',
    owner: 'demo-owner-primary',
    truck: 'demo-truck-isuzu',
    pickup: 'Nairobi',
    destination: 'Kampala',
    pickupDate: new Date().toISOString(),
    vehicleType: 'Lorry',
    cargo: 'Retail stock',
    weight: '8 tonnes',
    budget: 1260,
    paymentMethod: 'M-Pesa',
    paymentStatus: 'escrowed',
    paymentAmount: 1291.5,
    paymentBreakdown: {
      carrierAmount: 1260,
      platformFeeRate: 0.025,
      platformFee: 31.5,
      providerFee: 0,
      shipperTotal: 1291.5,
      carrierPayout: 1260,
      currency: 'KES'
    },
    status: 'in_transit',
    bids: [],
    tracking: [{ lat: -0.3031, lng: 36.08, speed: 72, heading: 291, timestamp: new Date().toISOString() }],
    createdAt: new Date().toISOString()
  },
  {
    _id: 'ITK-2031',
    client: 'demo-client-secondary',
    pickup: 'Mombasa',
    destination: 'Dar es Salaam',
    vehicleType: 'Trailer',
    cargo: 'Machine parts',
    weight: '18 tonnes',
    budget: 2860,
    paymentMethod: 'Card escrow',
    status: 'bidding',
    bids: [
      {
        owner: 'demo-owner-secondary',
        amount: 3040,
        message: 'Fleet is available for the requested pickup window.',
        status: 'pending',
        createdAt: new Date().toISOString()
      }
    ],
    tracking: [],
    createdAt: new Date().toISOString()
  }
];

module.exports = { memoryBookings };
