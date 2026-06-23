export const demoFleet = [
  {
    id: 'TRK-001',
    type: 'Lorry',
    name: 'Isuzu FVZ 34',
    plate: 'TRK 001',
    owner: 'Verified Carrier',
    company: 'Verified Haulage',
    price: '$2.10/km',
    pricePerKm: 2.1,
    capacity: '12 tonnes',
    rating: 0,
    ratingCount: 0,
    trips: 0,
    photos: ['https://www.kentrucksisuzu.com/uploads/img/pages/isuzu-fvz34t-truck.webp'],
    routeFit: 94,
    availability: 'Available today',
    documentStatus: 'Docs verified',
    responseTime: '< 10 min',
    routes: ['Nairobi-Kampala', 'Mombasa-Nairobi'],
    features: ['GPS', 'Insured', 'Cross-border'],
    verified: true
  },
  {
    id: 'TRK-002',
    type: 'Trailer',
    name: 'Scania R450',
    plate: 'TRK 002',
    owner: 'Verified Carrier',
    company: 'Regional Logistics',
    price: '$3.80/km',
    pricePerKm: 3.8,
    capacity: '28 tonnes',
    rating: 0,
    ratingCount: 0,
    trips: 0,
    photos: ['https://commons.wikimedia.org/wiki/Special:FilePath/Scania_truck_R_450,_FreshLinc.JPG'],
    routeFit: 91,
    availability: 'Available tomorrow',
    documentStatus: 'Docs verified',
    responseTime: '< 15 min',
    routes: ['Nairobi-Lagos', 'Mombasa-Kigali'],
    features: ['GPS', 'Container locks', 'Long haul'],
    verified: true
  },
  {
    id: 'TRK-003',
    type: 'Bus',
    name: 'Yutong ZK6122',
    plate: 'TRK 003',
    owner: 'Carrier Pending',
    company: 'City Logistics',
    price: '$1.90/km',
    pricePerKm: 1.9,
    capacity: 'Mixed cargo / passenger',
    rating: 0,
    ratingCount: 0,
    trips: 0,
    photos: ['https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?auto=format&fit=crop&w=900&q=80'],
    routeFit: 72,
    availability: 'Manual confirmation',
    documentStatus: 'Docs pending',
    responseTime: 'Manual review',
    routes: ['Lagos-Abuja', 'Lagos-Accra'],
    features: ['Passenger permits', 'Parcel hold'],
    verified: false
  },
  {
    id: 'TRK-004',
    type: 'Pickup',
    name: 'Toyota Hilux',
    plate: 'TRK 004',
    owner: 'Verified Carrier',
    company: 'Express Freight',
    price: '$1.25/km',
    pricePerKm: 1.25,
    capacity: '1.2 tonnes',
    rating: 0,
    ratingCount: 0,
    trips: 0,
    photos: ['https://images.unsplash.com/photo-1533473359331-0135ef1b58bf?auto=format&fit=crop&w=900&q=80'],
    routeFit: 88,
    availability: 'Available now',
    documentStatus: 'Docs verified',
    responseTime: '< 20 min',
    routes: ['Accra-Kumasi', 'Tema-Accra'],
    features: ['Rural roads', 'Express', 'Small cargo'],
    verified: true
  }
];

export const demoShipments = [
  {
    id: 'ITK-1001',
    route: 'Nairobi to Kampala',
    origin: 'Nairobi',
    destination: 'Kampala',
    cargo: 'Retail stock',
    vehicle: 'Isuzu FVZ 34',
    plate: 'TRK 001',
    driver: 'Assigned Driver',
    status: 'In transit',
    progress: 64,
    eta: 'Today 18:40',
    position: 'Near Nakuru',
    speed: '72 km/h',
    payment: 'Escrow held',
    documents: ['Waybill ready', 'Cargo photos shared', 'POD pending']
  },
  {
    id: 'ITK-1002',
    route: 'Mombasa to Dar es Salaam',
    origin: 'Mombasa',
    destination: 'Dar es Salaam',
    cargo: 'Machine parts',
    vehicle: 'Scania R450',
    plate: 'TRK 002',
    driver: 'Driver pending',
    status: 'Bids open',
    progress: 18,
    eta: '3 bids received',
    position: 'Awaiting award',
    speed: 'Pending dispatch',
    payment: 'Budget pending',
    documents: ['Commercial invoice needed', 'Packing list needed']
  },
  {
    id: 'ITK-1003',
    route: 'Accra to Lagos',
    origin: 'Accra',
    destination: 'Lagos',
    cargo: 'Packaged food',
    vehicle: 'Toyota Hilux',
    plate: 'TRK 004',
    driver: 'Assigned Driver',
    status: 'Delivered',
    progress: 100,
    eta: 'POD ready',
    position: 'Lagos warehouse',
    speed: 'Complete',
    payment: 'Release ready',
    documents: ['POD ready', 'Invoice ready']
  }
];

export const demoLoads = [
  {
    cargo: 'Maize bags',
    route: 'Kampala to Mombasa',
    price: 1850,
    distance: '1,140 km',
    window: 'Pickup tomorrow',
    fit: '92% fit',
    risk: 'Medium'
  },
  {
    cargo: 'Construction steel',
    route: 'Nairobi to Kigali',
    price: 2400,
    distance: '1,170 km',
    window: 'Bids close in 2h',
    fit: '88% fit',
    risk: 'Medium'
  },
  {
    cargo: 'Cold chain produce',
    route: 'Arusha to Dar es Salaam',
    price: 980,
    distance: '630 km',
    window: 'Needs refrigerated truck',
    fit: '76% fit',
    risk: 'High'
  }
];

export const demoDocuments = [
  'Waybill',
  'Cargo photos',
  'Receiver confirmation',
  'Commercial invoice',
  'Packing list',
  'Customs declaration'
];

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';
export const workspaceFleet = DEMO_MODE ? demoFleet : [];
export const workspaceShipments = DEMO_MODE ? demoShipments : [];
export const workspaceLoads = DEMO_MODE ? demoLoads : [];
export const workspaceDocuments = DEMO_MODE ? demoDocuments : [];
