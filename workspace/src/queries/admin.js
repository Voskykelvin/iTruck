import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { mergeDocumentIndex } from '../utils/helpers.js';

export const adminQueryKeys = {
  all: ['admin'],
  workspace: () => ['admin', 'workspace']
};

const emptyAdminData = {
  users: [],
  trucks: [],
  bookings: [],
  documents: [],
  payments: [],
  providerOperations: [],
  cases: [],
  notificationDeliveries: [],
  sessions: [],
  logs: []
};

function recordId(record = {}) {
  return String(record.id || record._id || '');
}

function normalizeAdminUser(user = {}) {
  return {
    ...user,
    id: recordId(user),
    verified: Boolean(user.verified ?? user.isVerified),
    active: user.active ?? user.isActive !== false,
    displayName: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Unknown user'
  };
}

function normalizeAdminTruck(truck = {}, users = []) {
  const ownerId = recordId(truck.owner && typeof truck.owner === 'object' ? truck.owner : { _id: truck.owner });
  const owner =
    (truck.owner && typeof truck.owner === 'object' ? truck.owner : null) ||
    users.find((user) => user.id === ownerId) ||
    null;
  const plateNumber = truck.plateNumber || truck.registrationNumber || truck.plate || 'Plate pending';
  return {
    ...truck,
    id: recordId(truck),
    verified: Boolean(truck.verified ?? truck.isVerified),
    available: truck.available ?? truck.isAvailable !== false,
    plateNumber,
    owner,
    ownerName: owner?.displayName || owner?.firstName || 'Owner pending',
    displayName:
      truck.name || [truck.make, truck.model].filter(Boolean).join(' ') || `${truck.type || 'Vehicle'} · ${plateNumber}`
  };
}

function normalizeAdminRecord(record = {}) {
  return { ...record, id: recordId(record) };
}

async function loadResource(label, request, select, previous) {
  try {
    return { value: select(await request()), error: null };
  } catch (error) {
    return { value: previous, error: { label, message: error.message || `${label} could not be loaded` } };
  }
}

async function fetchAdminWorkspace(previous = {}) {
  const prior = previous.data || emptyAdminData;
  const [stats, users, trucks, bookings, documents, payments, providerOperations, cases, deliveries, sessions, logs] =
    await Promise.all([
      loadResource('Statistics', api.adminStats, (data) => data, previous.stats || null),
      loadResource('Profiles', api.adminListUsers, (data) => data.users || [], prior.users),
      loadResource('Vehicles', api.adminListTrucks, (data) => data.trucks || [], prior.trucks),
      loadResource('Bookings', api.adminListBookings, (data) => data.bookings || [], prior.bookings),
      loadResource(
        'Documents',
        () => api.listDocuments({ limit: 100 }),
        (data) => data.documents || [],
        prior.documents
      ),
      loadResource('Payments', api.adminListPayments, (data) => data.transactions || [], prior.payments),
      loadResource(
        'Provider operations',
        api.adminProviderOperations,
        (data) => data.operations || [],
        prior.providerOperations
      ),
      loadResource(
        'Support cases',
        () => api.adminCases({ limit: 100 }),
        (data) => data.cases || [],
        prior.cases
      ),
      loadResource(
        'Notification delivery queue',
        api.adminNotificationDeliveries,
        (data) => data.deliveries || [],
        prior.notificationDeliveries
      ),
      loadResource('Security sessions', api.adminSecuritySessions, (data) => data.sessions || [], prior.sessions),
      loadResource('Audit logs', api.adminAuditLogs, (data) => data.logs || [], prior.logs)
    ]);
  const errors = [
    stats,
    users,
    trucks,
    bookings,
    documents,
    payments,
    providerOperations,
    cases,
    deliveries,
    sessions,
    logs
  ]
    .map((resource) => resource.error)
    .filter(Boolean);

  const normalizedUsers = (users.value || []).map(normalizeAdminUser);
  const normalizedDocuments = (documents.value || []).map(normalizeAdminRecord);
  const usersWithDocuments = mergeDocumentIndex(normalizedUsers, normalizedDocuments, 'user');
  const trucksWithDocuments = mergeDocumentIndex(trucks.value || [], normalizedDocuments, 'truck');

  return {
    stats: {
      users: Number(stats.value?.users ?? stats.value?.totalUsers ?? normalizedUsers.length),
      trucks: Number(stats.value?.trucks ?? stats.value?.totalTrucks ?? trucksWithDocuments.length),
      bookings: Number(stats.value?.bookings ?? stats.value?.totalBookings ?? (bookings.value || []).length),
      volume: Number(stats.value?.volume ?? stats.value?.totalRevenue ?? 0)
    },
    data: {
      users: usersWithDocuments,
      trucks: trucksWithDocuments.map((truck) => normalizeAdminTruck(truck, usersWithDocuments)),
      bookings: mergeDocumentIndex(bookings.value || [], normalizedDocuments, 'booking').map(normalizeAdminRecord),
      documents: normalizedDocuments,
      payments: (payments.value || []).map(normalizeAdminRecord),
      providerOperations: (providerOperations.value || []).map(normalizeAdminRecord),
      cases: (cases.value || []).map(normalizeAdminRecord),
      notificationDeliveries: (deliveries.value || []).map(normalizeAdminRecord),
      sessions: (sessions.value || []).map(normalizeAdminRecord),
      logs: (logs.value || []).map(normalizeAdminRecord)
    },
    errors
  };
}

export function useAdminWorkspace() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: adminQueryKeys.workspace(),
    queryFn: () => fetchAdminWorkspace(queryClient.getQueryData(adminQueryKeys.workspace())),
    refetchInterval: 30000,
    placeholderData: (previous) => previous
  });
}
