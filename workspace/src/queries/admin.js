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
  cases: [],
  notificationDeliveries: [],
  logs: []
};

async function loadResource(label, request, select, previous) {
  try {
    return { value: select(await request()), error: null };
  } catch (error) {
    return { value: previous, error: { label, message: error.message || `${label} could not be loaded` } };
  }
}

async function fetchAdminWorkspace(previous = {}) {
  const prior = previous.data || emptyAdminData;
  const [stats, users, trucks, bookings, documents, payments, cases, deliveries, logs] = await Promise.all([
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
    loadResource('Audit logs', api.adminAuditLogs, (data) => data.logs || [], prior.logs)
  ]);
  const errors = [stats, users, trucks, bookings, documents, payments, cases, deliveries, logs]
    .map((resource) => resource.error)
    .filter(Boolean);

  return {
    stats: stats.value,
    data: {
      users: mergeDocumentIndex(users.value, documents.value, 'user'),
      trucks: mergeDocumentIndex(trucks.value, documents.value, 'truck'),
      bookings: mergeDocumentIndex(bookings.value, documents.value, 'booking'),
      documents: documents.value,
      payments: payments.value,
      cases: cases.value,
      notificationDeliveries: deliveries.value,
      logs: logs.value
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
