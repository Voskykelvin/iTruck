import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { commercialQueryKeys, updateBookingCache, updateFleetTruckCache } from './commercial.js';
import { operationsQueryKeys } from './operations.js';

export const documentQueryKeys = {
  all: ['documents'],
  list: (params = {}) => ['documents', 'list', params]
};

export function useDocuments(params = {}, options = {}) {
  return useQuery({
    queryKey: documentQueryKeys.list(params),
    queryFn: async () => {
      const data = await api.listDocuments(params);
      return Array.isArray(data.documents) ? data.documents : [];
    },
    ...options
  });
}

export function useDocumentAction(action) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (data) => {
      if (data?.user) queryClient.setQueryData(operationsQueryKeys.profile(), data.user);
      if (data?.truck) updateFleetTruckCache(queryClient, data.truck);
      if (data?.booking) updateBookingCache(queryClient, data.booking);
      queryClient.invalidateQueries({ queryKey: documentQueryKeys.all });
    }
  });
}

export function useDownloadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, bookingId }) => api.downloadDocument(type, bookingId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: commercialQueryKeys.bookings() }),
        queryClient.invalidateQueries({ queryKey: documentQueryKeys.all })
      ]);
    }
  });
}
