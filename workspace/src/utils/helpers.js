import { roleForUser, roleName } from './roles.js';
import { demoDocuments } from '../data.js';

export { roleForUser, roleName, demoDocuments };
export {
  flushTelemetryQueue,
  normalizeBrowserPosition,
  queueTelemetryPoint,
  shouldSendTelemetry
} from './trackingTelemetry.js';

export function documentStatusMeta(status = 'missing', labels = {}) {
  const text = {
    approved: labels.approved || 'Verified',
    pending: labels.pending || 'Under Review',
    rejected: labels.rejected || 'Rejected - Re-upload',
    expired: labels.expired || 'Expired - Re-upload',
    missing: labels.missing || 'Upload'
  };

  if (status === 'approved') return { tone: 'success', text: text.approved };
  if (status === 'pending') return { tone: 'warn', text: text.pending };
  if (status === 'rejected') return { tone: 'danger', text: text.rejected };
  if (status === 'expired') return { tone: 'danger', text: text.expired };
  return { tone: 'default', text: text.missing };
}

/* ============================================================
   CONSTANTS & CONFIGURATION
   ============================================================ */
export const roleNavigation = {
  client: [
    { path: '/app/shipper', label: 'Dashboard', icon: 'LayoutDashboard' },
    { path: '/app/book', label: 'Book', icon: 'Plus' },
    { path: '/app/bids', label: 'Bids', icon: 'BarChart3' },
    { path: '/app/marketplace', label: 'Trucks', icon: 'Search' },
    { path: '/app/tracking', label: 'Orders', icon: 'Map' },
    { path: '/app/documents', label: 'Documents', icon: 'FileText' },
    { path: '/app/payments', label: 'Payments', icon: 'Wallet' },
    { path: '/app/messages', label: 'Messages', icon: 'MessageSquare' },
    { path: '/app/profile', label: 'Settings', icon: 'UserRound' }
  ],
  owner: [
    { path: '/app/owner', label: 'Dashboard', icon: 'LayoutDashboard' },
    { path: '/app/onboarding', label: 'Verification', icon: 'ShieldCheck' },
    { path: '/app/vehicles', label: 'Vehicles', icon: 'Truck' },
    { path: '/app/bids', label: 'Find Work', icon: 'Search' },
    { path: '/app/tracking', label: 'Jobs', icon: 'Map' },
    { path: '/app/documents', label: 'Documents', icon: 'FileText' },
    { path: '/app/payments', label: 'Payments', icon: 'Wallet' },
    { path: '/app/messages', label: 'Messages', icon: 'MessageSquare' },
    { path: '/app/profile', label: 'Settings', icon: 'UserRound' }
  ],
  driver: [
    { path: '/app/tracking', label: 'Assigned Jobs', icon: 'Map' },
    { path: '/app/documents', label: 'Documents', icon: 'FileText' },
    { path: '/app/messages', label: 'Messages', icon: 'MessageSquare' },
    { path: '/app/profile', label: 'Settings', icon: 'UserRound' }
  ],
  admin: [
    { path: '/app/admin', label: 'Console', icon: 'BarChart3' },
    { path: '/app/profile', label: 'Settings', icon: 'UserRound' }
  ]
};

export const registrationCountries = [
  ['Kenya', '+254'],
  ['Nigeria', '+234'],
  ['South Africa', '+27'],
  ['Uganda', '+256'],
  ['Tanzania', '+255'],
  ['Ghana', '+233'],
  ['Egypt', '+20'],
  ['Morocco', '+212'],
  ['Ethiopia', '+251'],
  ['DRC Congo', '+243']
];

export const defaultNotificationPreferences = {
  channels: { inApp: true, push: false, email: false, sms: false },
  categories: {
    bookings: true,
    tracking: true,
    documents: true,
    payments: true,
    security: true,
    marketing: false,
    system: true
  },
  quietHours: {
    enabled: false,
    start: '21:00',
    end: '07:00',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Nairobi',
    allowHighPriority: true
  }
};

export const vehicleTypes = ['Matatu', 'Pickup', 'Lorry', 'Large Truck', 'Trailer', 'Bus', 'Specialised'];
export const ownerProfileDocuments = ['Owner KYC', 'Driver ID', 'Business registration', 'Insurance'];
export const shipperProfileDocuments = ['Shipper KYC', 'Business registration', 'Tax certificate'];
export const ownerVehicleDocuments = [
  'Vehicle photos',
  'Insurance',
  'Vehicle logbook',
  'Road license',
  'Inspection report'
];
export const documentUploadAccept = 'image/jpeg,image/png,image/webp,application/pdf';
export const imageUploadAccept = 'image/jpeg,image/png,image/webp';
export const documentUploadLimitText = 'PDF, JPG, PNG, or WebP up to 10 MB';

export const documentStages = {
  owner: [
    'Submit owner identity and business documents',
    'Register each vehicle with plate, capacity, routes, and photos',
    'Upload insurance, logbook, road license, and inspection proof',
    'Admin approves the profile before bidding on work'
  ],
  client: [
    'Submit shipper identity and business documents',
    'Create shipment request and confirm required route documents',
    'Upload cargo photos and receiver proof during the shipment',
    'Admin keeps verification, disputes, and payment release auditable'
  ]
};

export const defaultBooking = {
  pickup: '',
  destination: '',
  distance: '',
  border: 'Domestic',
  pickupWindow: 'Flexible pickup window',
  vehicleType: 'Lorry',
  cargo: '',
  weight: '',
  requirements: 'Standard',
  cargoValue: '',
  receiverName: '',
  receiverPhone: '',
  communicationPreference: 'WhatsApp + SMS updates',
  paymentMethod: 'Wallet',
  optionalServices: []
};

export const documentActions = [
  { label: 'Waybill', type: 'waybill', mode: 'download' },
  { label: 'Cargo photos', type: 'cargo-photos', mode: 'upload' },
  { label: 'Receiver confirmation', type: 'receiver-confirmation', mode: 'download' },
  { label: 'Commercial invoice', type: 'invoice', mode: 'download' },
  { label: 'Packing list', type: 'packing-list', mode: 'download' },
  { label: 'Customs declaration', type: 'customs', mode: 'download' },
  { label: 'Cargo value declaration', type: 'cargo-value-declaration', mode: 'download' }
];

export const deliveryProofTypes = ['pod', 'receiver-confirmation'];
export const deliveryEvidenceActions = [
  {
    label: 'Cargo photos',
    type: 'cargo-photos',
    detail: 'Pickup, loading, seal, and arrival condition photos.'
  },
  {
    label: 'Proof of delivery',
    type: 'pod',
    detail: 'Signed POD, delivery note, or receiver dock stamp.'
  },
  {
    label: 'Receiver confirmation',
    type: 'receiver-confirmation',
    detail: 'Receiver signature, name, or acceptance confirmation.'
  }
];

/* ============================================================
   HELPER FUNCTIONS
   ============================================================ */

export function documentActionFor(label) {
  const normalized = String(label || '').toLowerCase();
  return (
    documentActions.find((item) => item.label.toLowerCase() === normalized) || {
      label,
      type: normalized.replaceAll(' ', '-'),
      mode: 'download'
    }
  );
}

export function liveDocumentActionFor(label) {
  const definition = documentActionFor(label);
  if (['cargo-photos', 'pod', 'receiver-confirmation'].includes(definition.type)) {
    return { ...definition, mode: 'upload' };
  }
  return definition;
}

export function handoverDocumentActionsFor(shipment = {}) {
  return [
    ...(shipment.documents || []).map(liveDocumentActionFor),
    ...deliveryEvidenceActions.map((item) => ({ ...item, mode: 'upload' }))
  ].filter((definition, index, list) => list.findIndex((item) => item.type === definition.type) === index);
}

export function routeFromLocation() {
  const path = window.location.pathname;
  if (path === '/app' || path === '/app/') return '/app/shipper';
  return `${path}${window.location.search}`;
}

export function navForUser(user) {
  return roleNavigation[roleForUser(user)] || roleNavigation.client;
}

let registeredNavigator = null;

export function registerNavigator(navigator) {
  registeredNavigator = typeof navigator === 'function' ? navigator : null;
  return () => {
    if (registeredNavigator === navigator) registeredNavigator = null;
  };
}

export function navigate(path, options = {}) {
  if (registeredNavigator) {
    try {
      registeredNavigator(path, options);
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (current === path) return;
    } catch (_err) {
      // Fall through to browser history if the mounted router can no longer navigate.
    }
  }
  const method = options.replace ? 'replaceState' : 'pushState';
  window.history[method]({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export async function copyToClipboard(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
}

export function activateOnEnter(event, action) {
  if (!['Enter', ' '].includes(event.key)) return;
  event.preventDefault();
  action();
}

export function money(value, currency = 'USD') {
  return `${currency} ${Number(value || 0).toLocaleString()}`;
}

export function saveLocal(type, data) {
  const key = `itruck_${type}`;
  const list = JSON.parse(localStorage.getItem(key) || '[]');
  const record = { id: `${type}-${Date.now()}`, ...data, createdAt: new Date().toISOString(), mode: 'local' };
  list.unshift(record);
  localStorage.setItem(key, JSON.stringify(list));
  return record;
}

export function readLocal(type) {
  return JSON.parse(localStorage.getItem(`itruck_${type}`) || '[]');
}

export function slugDocumentType(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function normalizeProfileDocumentType(value, role = 'client') {
  const slug = slugDocumentType(value);
  if (slug === 'kyc') return role === 'owner' ? 'owner-kyc' : 'shipper-kyc';
  return slug;
}

export function normalizeTruckDocumentType(value) {
  const slug = slugDocumentType(value);
  const aliases = {
    license: 'road-license',
    logbook: 'vehicle-logbook',
    'vehicle-photo': 'vehicle-photos'
  };

  return aliases[slug] || slug;
}

export function normalizeBookingDocumentType(value) {
  const slug = slugDocumentType(value);
  const aliases = {
    'cargo-photo': 'cargo-photos',
    'commercial-invoice': 'invoice',
    'customs-declaration': 'customs',
    'proof-of-delivery': 'pod'
  };

  return aliases[slug] || slug;
}

export function recordIdentity(record) {
  return String(record?._id || record?.id || record?.bookingId || '');
}

export function documentTargetIdentity(doc) {
  if (doc?.target && typeof doc.target === 'object') return recordIdentity(doc.target);
  return String(doc?.target || doc?.targetId || doc?.booking || doc?.truck || '');
}

export function normalizeIndexedDocumentType(targetType, type, record) {
  if (targetType === 'user') return normalizeProfileDocumentType(type, record?.role);
  if (targetType === 'truck') return normalizeTruckDocumentType(type);
  return normalizeBookingDocumentType(type);
}

export function mergeDocumentLists(baseDocuments = [], indexedDocuments = [], targetType, record) {
  const byType = new Map();
  const addDocument = (doc) => {
    const type = normalizeIndexedDocumentType(targetType, doc.type, record);
    if (!type) return;
    byType.set(type, {
      ...doc,
      type,
      url: doc.url || doc.urls?.[0],
      fileName: doc.fileName || doc.fileNames?.[0],
      notes: doc.notes || doc.reviewNotes
    });
  };

  baseDocuments.forEach(addDocument);
  indexedDocuments.forEach(addDocument);
  return Array.from(byType.values());
}

export function bookingDocumentsFrom(record = {}) {
  return mergeDocumentLists(Array.isArray(record.documents) ? record.documents : [], [], 'booking', record);
}

export function bookingDocumentFor(shipment, type) {
  const expectedType = normalizeBookingDocumentType(type);
  return (shipment?.bookingDocuments || []).find((doc) => normalizeBookingDocumentType(doc.type) === expectedType);
}

export function documentHasFile(doc) {
  return Boolean(doc?.url || (Array.isArray(doc?.urls) && doc.urls.length));
}

export function documentIsAvailable(doc) {
  return Boolean(documentHasFile(doc) || doc?.generatedAt);
}

export function shipmentDocumentStatus(shipment, type) {
  const doc = bookingDocumentFor(shipment, type);
  if (!documentIsAvailable(doc)) return 'missing';
  return doc.status || 'pending';
}

export function deliveryProofDocument(shipment, options = {}) {
  const approvedOnly = options.approvedOnly === true;
  return deliveryProofTypes
    .map((type) => bookingDocumentFor(shipment, type))
    .find((doc) => {
      if (!documentIsAvailable(doc)) return false;
      if (approvedOnly) return doc.status === 'approved';
      return !['rejected', 'expired'].includes(doc.status);
    });
}

export function hasReceiverGradeProof(shipment) {
  const proof = shipment?.deliveryProof || {};
  return Boolean(
    proof.proof &&
    /^[a-f0-9]{64}$/.test(String(proof.recordHash || '')) &&
    proof.verificationMethod === 'sms_otp' &&
    proof.verifiedAt &&
    Number(proof.photoCount) >= 1
  );
}

export function upsertGeneratedBookingDocument(shipment, type) {
  const documentType = normalizeBookingDocumentType(type);
  const documents = Array.isArray(shipment?.bookingDocuments) ? shipment.bookingDocuments : [];
  const generated = {
    type: documentType,
    status: 'approved',
    generatedAt: new Date().toISOString()
  };
  const existingIndex = documents.findIndex((doc) => normalizeBookingDocumentType(doc.type) === documentType);

  if (existingIndex < 0) return { ...shipment, bookingDocuments: [...documents, generated] };

  return {
    ...shipment,
    bookingDocuments: documents.map((doc, index) => (index === existingIndex ? { ...doc, ...generated } : doc))
  };
}

export function hasDestinationCoordinates(shipment) {
  return [shipment?.destinationCoordinates?.lat, shipment?.destinationCoordinates?.lng].every((value) =>
    Number.isFinite(Number(value))
  );
}

export function mergeDocumentIndex(records = [], indexedDocuments = [], targetType) {
  const grouped = indexedDocuments
    .filter((doc) => doc.targetType === targetType)
    .reduce((map, doc) => {
      const key = documentTargetIdentity(doc);
      if (!key) return map;
      map.set(key, [...(map.get(key) || []), doc]);
      return map;
    }, new Map());

  return records.map((record) => {
    const key = recordIdentity(record);
    const indexed = grouped.get(key) || [];
    if (!indexed.length) return record;
    return {
      ...record,
      documents: mergeDocumentLists(
        Array.isArray(record.documents) ? record.documents : [],
        indexed,
        targetType,
        record
      )
    };
  });
}

export function profileDocumentsForRole(role) {
  if (role === 'owner') return ownerProfileDocuments;
  if (role === 'admin' || role === 'driver') return [];
  return shipperProfileDocuments;
}

export function reviewReadyDocument(doc) {
  return doc?.status === 'approved' || doc?.status === 'pending';
}

export function findProfileDocument(documents = [], label, role) {
  const expectedType = normalizeProfileDocumentType(label, role);
  return documents.find((doc) => normalizeProfileDocumentType(doc.type, role) === expectedType);
}

export function findTruckDocument(documents = [], label) {
  const expectedType = normalizeTruckDocumentType(label);
  return documents.find((doc) => normalizeTruckDocumentType(doc.type) === expectedType);
}

export function missingRequiredProfileDocuments(user, role) {
  return profileDocumentsForRole(role).filter(
    (label) => !reviewReadyDocument(findProfileDocument(user?.documents, label, role))
  );
}

export function profileDocumentsReady(user, role) {
  return missingRequiredProfileDocuments(user, role).length === 0;
}

export function chatKey(shipmentId) {
  return `itruck_chat_${shipmentId || 'draft'}`;
}

export function formatMessageTime(value = new Date().toISOString()) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function defaultChatMessages(shipment) {
  return [
    {
      id: `${shipment.id}-driver-start`,
      author: 'driver',
      name: shipment.driver || 'Driver',
      text: `Loading confirmed for ${shipment.route}. I will share checkpoint updates here.`,
      createdAt: new Date(Date.now() - 1000 * 60 * 55).toISOString()
    },
    {
      id: `${shipment.id}-ops-check`,
      author: 'ops',
      name: 'iTruck Ops',
      text: 'Waybill, cargo photos, and route status are attached to this shipment thread.',
      createdAt: new Date(Date.now() - 1000 * 60 * 38).toISOString()
    }
  ];
}

export function readLocalChat(shipment) {
  const saved = JSON.parse(localStorage.getItem(chatKey(shipment.id)) || '[]');
  return saved.length ? saved : defaultChatMessages(shipment);
}

export function persistLocalChat(shipmentId, messages) {
  localStorage.setItem(chatKey(shipmentId), JSON.stringify(messages.slice(-80)));
}

export function userIdFor(user) {
  if (typeof user === 'string') return user;
  return String(user?._id || user?.id || user?.userId || '');
}

export function userDisplayName(user, fallback = 'You') {
  return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || user?.company || user?.email || fallback;
}

export function mongoObjectId(value) {
  return /^[a-f0-9]{24}$/i.test(String(value || ''));
}

export function bidDraftForLoad(load, fleet = []) {
  const preferredTruck = fleet.find((truck) => truck.verified) || fleet[0] || null;
  const amount = Number(load?.price || 0);

  return {
    amount: amount ? Math.round(amount) : '',
    truck: preferredTruck?.id || '',
    message: `Available for ${load?.window || 'the pickup window'}. Documents ready for shipper review.`
  };
}

export function bidPayloadForDraft(draft, fleet = []) {
  const amount = Number(draft.amount || 0);
  const selectedTruck = fleet.find((truck) => String(truck.id) === String(draft.truck));
  const truckLine = selectedTruck ? `Vehicle: ${selectedTruck.plate} ${selectedTruck.name}.` : '';
  const note = String(draft.message || '').trim() || 'Available for pickup. Documents ready.';
  const payload = {
    amount,
    message: [truckLine, note].filter(Boolean).join(' ').slice(0, 1000)
  };

  if (mongoObjectId(draft.truck)) payload.truck = draft.truck;
  return payload;
}

export function normalizeWorkflowMessage(item, currentUser) {
  const payload = item.payload || {};
  const user = item.user || {};
  const currentUserId = userIdFor(currentUser);
  const authorId = String(user._id || user.id || item.user || payload.user || payload.senderId || '');
  const mine = Boolean(authorId && currentUserId && authorId === currentUserId);
  const payloadOnlyMine = !authorId && payload.sender === 'me';
  const senderRole = user.role || payload.senderRole;
  const fallbackName = senderRole === 'owner' ? 'Fleet owner' : senderRole === 'client' ? 'Shipper' : 'Counterparty';
  const senderName = [user.firstName, user.lastName].filter(Boolean).join(' ') || payload.senderName || fallbackName;

  return {
    id: item._id || item.id || `message-${Date.now()}`,
    author: mine || payloadOnlyMine ? 'me' : 'them',
    name: mine || payloadOnlyMine ? 'You' : senderName,
    text: payload.text || payload.message || '',
    createdAt: item.createdAt || payload.createdAt || new Date().toISOString()
  };
}

export function normalizeTruck(truck) {
  const price = truck.price || (truck.pricePerKm ? `$${Number(truck.pricePerKm).toFixed(2)}/km` : 'Quote');
  const routes = truck.routes || [];
  const photos = truck.photos || (truck.photo ? [truck.photo] : []);
  const verified = truck.verified ?? truck.isVerified ?? false;
  const ratingCount = Number(truck.ratingCount || 0);
  return {
    id: truck._id || truck.id || truck.plate || truck.plateNumber,
    type: truck.type || 'Lorry',
    name: truck.name || [truck.make, truck.model].filter(Boolean).join(' ') || 'Listed truck',
    plate: truck.plate || truck.plateNumber || 'Plate pending',
    owner: truck.ownerName || truck.owner || 'Verified carrier',
    company: truck.company || 'Carrier partner',
    price,
    pricePerKm: Number(truck.pricePerKm || String(price).replace(/[^0-9.]/g, '')) || 0,
    capacity: truck.capacity || (truck.capacityTonnes ? `${truck.capacityTonnes} tonnes` : 'Capacity on request'),
    rating: Number(truck.ratingAverage || truck.rating || 0),
    ratingCount,
    trips: Number(truck.completedTrips || truck.trips || truck.totalTrips || 0),
    photos,
    photo: photos[0] || '',
    routeFit: Number(truck.routeFit || Math.min(98, 64 + (verified ? 16 : 0) + Math.min(12, routes.length * 4))),
    availability: truck.availability || (truck.isAvailable === false ? 'Offline' : 'Available now'),
    documentStatus: truck.documentStatus || (verified ? 'Docs verified' : 'Docs pending'),
    responseTime: truck.responseTime || (verified ? '< 20 min' : 'Manual review'),
    routes,
    features: truck.features || [],
    verified,
    documents: truck.documents || []
  };
}

export function ratingSummary(entity) {
  const count = Number(entity?.ratingCount || 0);
  const rating = Number(entity?.rating || entity?.ratingAverage || 0);
  return count
    ? `${rating.toFixed(1)} from ${count} completed job${count === 1 ? '' : 's'}`
    : 'New after first delivery';
}

export function normalizeBid(bid = {}) {
  const owner = bid.owner && typeof bid.owner === 'object' ? bid.owner : {};
  const truck = bid.truck && typeof bid.truck === 'object' ? bid.truck : {};
  const ownerId = userIdFor(owner) || String(bid.owner || bid.ownerId || '');
  const truckId = truck._id || truck.id || bid.truck || bid.truckId || '';
  const ownerName =
    [owner.firstName, owner.lastName].filter(Boolean).join(' ') ||
    owner.company ||
    bid.ownerName ||
    bid.carrier ||
    'Carrier';
  const id = bid._id || bid.id || bid.bidId || owner._id || bid.owner || truck._id || bid.truck;

  return {
    id: id || `${bid.amount || 'bid'}-${bid.createdAt || Date.now()}`,
    ownerId,
    truckId,
    ownerName,
    truckName: truck.name || [truck.make, truck.model].filter(Boolean).join(' ') || bid.truckName || 'Truck pending',
    amount: Number(bid.amount || bid.price || 0),
    message: bid.message || 'Carrier has not added a note yet.',
    status: bid.status || 'pending',
    createdAt: bid.createdAt,
    expiresAt: bid.expiresAt,
    counteroffer: bid.counteroffer,
    rejectionReason: bid.rejectionReason,
    withdrawalReason: bid.withdrawalReason,
    carrierAcknowledgedAt: bid.carrierAcknowledgedAt,
    history: bid.history || []
  };
}

export function bookingRef(booking) {
  return booking._id || booking.id || booking.bookingId || 'ITK-PENDING';
}

export function bookingRoute(booking) {
  return booking.route || [booking.pickup, booking.destination].filter(Boolean).join(' to ') || 'Route pending';
}

export function bookingPaymentAmount(booking = {}) {
  const acceptedBid = (booking.bids || []).find((bid) => bid.status === 'accepted');
  return (
    [acceptedBid?.amount, booking.paymentAmount, booking.budget, booking.estimate?.total, booking.cargoValue]
      .map(Number)
      .find((value) => Number.isFinite(value) && value > 0) || 0
  );
}

export function statusLabel(status = 'pending') {
  return status.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function paymentTone(status = 'unpaid') {
  if (['escrowed', 'released', 'completed', 'paid'].includes(status)) return 'success';
  if (['failed', 'refunded', 'cancelled', 'disputed'].includes(status)) return 'danger';
  if (['pending', 'release_pending', 'refund_pending', 'withdrawal'].includes(status)) return 'warn';
  return 'default';
}

export function isDebitTransaction(transaction = {}) {
  return ['debit', 'payment', 'withdrawal'].includes(transaction.type);
}

export function titleFromSlug(value = 'Document') {
  return String(value || 'Document')
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function notificationId(prefix = 'note') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function notificationLinkForType(type, data = {}) {
  if (data.link) return data.link;
  if (type?.startsWith('bid')) return '/app/bids';
  if (type?.startsWith('document')) return '/app/documents';
  if (type?.startsWith('profile')) return '/app/profile';
  if (type?.startsWith('truck')) return '/app/vehicles';
  if (type?.startsWith('booking') || type?.startsWith('shipment')) return '/app/tracking';
  return '/app/shipper';
}

export function normalizeNotificationRecord(record = {}) {
  const data = record.data || {};
  const type = record.type || data.type || 'workspace:update';
  return {
    id: String(record._id || record.id || notificationId(type)),
    title: record.title || data.title || titleFromSlug(type),
    message: record.message || data.message || '',
    read: Boolean(record.read),
    createdAt: record.createdAt || data.createdAt || new Date().toISOString(),
    link: notificationLinkForType(type, data),
    type
  };
}

export function progressForStatus(status = 'pending') {
  if (status === 'delivered') return 100;
  if (status === 'delivery_pending') return 88;
  if (status === 'in_transit') return 64;
  if (status === 'confirmed') return 38;
  if (status === 'bidding') return 18;
  return 8;
}

export function normalizeBookingShipment(booking) {
  const tracking = booking.tracking || [];
  const latest = tracking[tracking.length - 1] || {};
  const normStatus = (booking.status || 'pending').toLowerCase().replaceAll(' ', '_');
  const progress = Number(booking.progress || progressForStatus(normStatus));
  const hasLatestCoordinates = [latest.lat, latest.lng].every((value) => Number.isFinite(Number(value)));
  const latestSpeed = Number(latest.speed);
  const bookingDocuments = bookingDocumentsFrom(booking);
  const etaDate = booking.eta?.estimatedArrivalAt ? new Date(booking.eta.estimatedArrivalAt) : null;
  const etaText =
    etaDate && !Number.isNaN(etaDate.getTime())
      ? etaDate.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
      : booking.status === 'delivered'
        ? 'POD ready'
        : 'Awaiting update';

  return {
    id: bookingRef(booking),
    bookingId: booking._id || booking.id || booking.bookingId,
    truckId: booking.truck?._id || booking.truckId || booking.truck,
    route: bookingRoute(booking),
    origin: booking.pickup || 'Pickup pending',
    destination: booking.destination || 'Destination pending',
    cargo: booking.cargo || 'Cargo pending',
    loadMode: booking.loadMode || 'full-truck',
    vehicle: booking.vehicleType || booking.truck?.type || 'Vehicle pending',
    plate: booking.truck?.plateNumber || booking.plate || 'Unassigned',
    driver: booking.driver
      ? `${booking.driver.firstName || ''} ${booking.driver.lastName || ''}`.trim()
      : booking.owner
        ? `${booking.owner.firstName || ''} ${booking.owner.lastName || ''}`.trim()
        : 'Driver pending',
    status: statusLabel(normStatus),
    rawStatus: normStatus,
    progress,
    eta: etaText,
    etaDetails: booking.eta || null,
    position: latest.city || (hasLatestCoordinates ? formatCoordinatePair(latest) : 'Awaiting GPS update'),
    speed: Number.isFinite(latestSpeed) ? `${Number(latestSpeed.toFixed(1))} km/h` : 'Speed pending',
    payment: booking.paymentMethod || 'Payment pending',
    paymentStatus: booking.paymentStatus || 'unpaid',
    amount: bookingPaymentAmount(booking),
    paymentReference: booking.paymentReference || '',
    documents: booking.estimate?.requiredDocuments || demoDocuments.slice(0, 3),
    bookingDocuments,
    destinationCoordinates: booking.destinationCoordinates,
    pickupCoordinates: booking.pickupCoordinates,
    routePlan: booking.routePlan || null,
    routeDeviation: booking.routeDeviation || null,
    dispatchPlanId: booking.dispatchPlan?._id || booking.dispatchPlan || '',
    dispatch: booking.dispatch || null,
    deliveryGeofenceMeters: booking.deliveryGeofenceMeters,
    deliveredAt: booking.deliveredAt,
    receiverName: booking.receiverName || '',
    receiverPhone: booking.receiverPhone || '',
    deliveryProof: booking.deliveryProof || null,
    bids: Array.isArray(booking.bids) ? booking.bids.map(normalizeBid) : [],
    tracking
  };
}

export function latestTrackingPoint(shipment) {
  const list = shipment?.tracking || [];
  for (let index = list.length - 1; index >= 0; index -= 1) {
    const point = list[index];
    if ([point?.lat, point?.lng].every((value) => Number.isFinite(Number(value)))) return point;
  }
  return null;
}

export function formatCoordinatePair(point, precision = 5) {
  if (!point || ![point.lat, point.lng].every((value) => Number.isFinite(Number(value)))) return 'Awaiting GPS update';
  return `${Number(point.lat).toFixed(precision)}, ${Number(point.lng).toFixed(precision)}`;
}

export function formatTrackingTime(point) {
  const value = point?.timestamp || point?.createdAt || point?.queuedAt;
  if (!value) return 'No timestamp yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'No timestamp yet';
  return date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

export function normalizeOpenLoad(booking) {
  const estimate = booking.estimate || {};
  const amount = Number(booking.budget || estimate.total || 0);
  const client = booking.client && typeof booking.client === 'object' ? booking.client : {};
  return {
    id: bookingRef(booking),
    bookingId: booking._id || booking.id || booking.bookingId,
    cargo: booking.cargo || 'Cargo pending',
    route: bookingRoute(booking),
    pickup: booking.pickup || 'Pickup pending',
    destination: booking.destination || 'Destination pending',
    vehicle: booking.vehicleType || 'Vehicle pending',
    shipper: userDisplayName(client, 'Shipper'),
    price: amount,
    distance: booking.distance ? `${Number(booking.distance).toLocaleString()} km` : 'Distance pending',
    window: booking.pickupWindow || 'Pickup window pending',
    requirements: booking.requirements || 'Standard handling',
    payment: booking.paymentMethod || 'Payment pending',
    fit: `${booking.routeFit || 82}% fit`,
    risk: estimate.routeRisk || 'Medium',
    bidCount: Array.isArray(booking.bids) ? booking.bids.length : 0
  };
}

export function normalizeOwnerBidRecord(record = {}) {
  return {
    id: record.id || `${record.bookingId || record.route || 'bid'}-${record.createdAt || Date.now()}`,
    bidId: record.bidId || record.id || '',
    bookingId: record.bookingId || record.id || '',
    route: record.route || 'Route pending',
    cargo: record.cargo || 'Cargo pending',
    amount: Number(record.amount || 0),
    message: record.message || 'Bid note pending',
    status: record.status || 'pending',
    expiresAt: record.expiresAt,
    counteroffer: record.counteroffer,
    rejectionReason: record.rejectionReason,
    withdrawalReason: record.withdrawalReason,
    carrierAcknowledgedAt: record.carrierAcknowledgedAt,
    truckName: record.truckName || record.truck || 'Selected vehicle',
    createdAt: record.createdAt
  };
}

export function ownerBidRecordsFromShipments(shipments, user) {
  const currentUserId = userIdFor(user);
  return shipments.flatMap((shipment) =>
    (shipment.bids || [])
      .filter((bid) => !currentUserId || [bid.ownerId, bid.id].some((value) => String(value) === currentUserId))
      .map((bid) =>
        normalizeOwnerBidRecord({
          id: `${shipment.bookingId || shipment.id}-${bid.id}`,
          bidId: bid.id,
          bookingId: shipment.bookingId || shipment.id,
          route: shipment.route,
          cargo: shipment.cargo,
          amount: bid.amount,
          message: bid.message,
          status: bid.status,
          expiresAt: bid.expiresAt,
          counteroffer: bid.counteroffer,
          rejectionReason: bid.rejectionReason,
          withdrawalReason: bid.withdrawalReason,
          carrierAcknowledgedAt: bid.carrierAcknowledgedAt,
          truckName: bid.truckName,
          createdAt: bid.createdAt
        })
      )
  );
}

export function uniqueBidRecords(records) {
  const seen = new Set();
  return records.filter((record) => {
    const key = record.bookingId || record.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function fallbackEstimate(payload) {
  const distance = Number(payload.distance || 420);
  const basePrice = Math.round(distance * 1.8);
  const crossBorderFee = payload.border === 'Cross-border' ? Math.round(basePrice * 0.12) : 0;
  const insurance = Math.max(25, Math.round(basePrice * 0.035));
  const escrowFee = Math.round(basePrice * 0.025);
  const lineItems = [
    { key: 'basePrice', label: `${payload.vehicleType} lane estimate`, amount: basePrice },
    ...(crossBorderFee ? [{ key: 'crossBorderFee', label: 'Cross-border handling', amount: crossBorderFee }] : []),
    { key: 'insurance', label: 'Standard cargo protection', amount: insurance },
    { key: 'escrowFee', label: 'Escrow and payment handling', amount: escrowFee }
  ];

  return {
    currency: 'USD',
    lineItems,
    total: lineItems.reduce((sum, item) => sum + item.amount, 0),
    routeRisk: payload.border === 'Cross-border' ? 'medium' : 'low',
    recommendedMode: distance > 900 || payload.border === 'Cross-border' ? 'open-bids' : 'instant-match',
    confidence: 'medium',
    requiredDocuments: payload.border === 'Cross-border' ? demoDocuments : demoDocuments.slice(0, 3),
    quoteProtection:
      'Estimate includes visible platform, insurance, escrow, and selected service fees before carrier bids.'
  };
}

export function pageTitle(route) {
  if (route.includes('/privacy')) return 'Privacy Notice';
  if (route.includes('/terms')) return 'Terms of Service';
  if (route.includes('/onboarding')) return 'Verification';
  if (route.includes('/bids')) return 'Bids & Work';
  if (route.includes('/documents')) return 'Documents';
  if (route.includes('/payments')) return 'Payments';
  if (route.includes('/messages')) return 'Messages';
  if (route.includes('/book')) return 'Book a Truck';
  if (route.includes('/marketplace')) return 'Truck Marketplace';
  if (route.includes('/tracking')) return 'Live Tracking';
  if (route.includes('/owner') || route.includes('/vehicles')) return 'Fleet Owner';
  if (route.includes('/admin')) return 'Operations Admin';
  if (route.includes('/profile')) return 'Account & Verification';
  return 'Shipper Dashboard';
}
