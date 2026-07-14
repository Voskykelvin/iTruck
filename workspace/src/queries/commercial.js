import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { normalizeBookingShipment, normalizeOpenLoad, normalizeTruck } from '../utils/helpers.js';

function normalizedParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

export const commercialQueryKeys = {
  all: ['commercial'],
  trucks: (params = {}) => ['commercial', 'trucks', normalizedParams(params)],
  bookings: () => ['commercial', 'bookings'],
  bookingList: () => ['commercial', 'bookings', 'list'],
  bookingDetail: (bookingId) => ['commercial', 'bookings', 'detail', String(bookingId || '')],
  openBookings: () => ['commercial', 'bookings', 'open'],
  fleet: () => ['commercial', 'fleet'],
  dispatch: (bookingId) => ['commercial', 'dispatch', String(bookingId || '')],
  estimate: (payload) => ['commercial', 'estimate', payload],
  draft: () => ['commercial', 'bookings', 'draft'],
  drivers: () => ['commercial', 'drivers']
};

function bookingIdentity(booking) {
  return String(booking?.bookingId || booking?.id || booking?._id || '');
}

export function updateFleetTruckCache(queryClient, truck) {
  if (!truck) return;
  const normalized = normalizeTruck(truck);
  if (!normalized.id) return;
  queryClient.setQueryData(commercialQueryKeys.fleet(), (current = []) => {
    const exists = current.some((item) => String(item.id) === String(normalized.id));
    return exists
      ? current.map((item) => (String(item.id) === String(normalized.id) ? normalized : item))
      : [normalized, ...current];
  });
}

export function updateBookingCache(queryClient, booking, { removeFromOpen = false } = {}) {
  if (!booking) return;
  const normalized = normalizeBookingShipment(booking);
  const identity = bookingIdentity(normalized);
  if (!identity) return;

  queryClient.setQueryData(commercialQueryKeys.bookingList(), (current = []) => {
    const exists = current.some((item) => bookingIdentity(item) === identity);
    return exists
      ? current.map((item) => (bookingIdentity(item) === identity ? normalized : item))
      : [normalized, ...current];
  });
  queryClient.setQueryData(commercialQueryKeys.bookingDetail(identity), normalized);
  queryClient.setQueryData(commercialQueryKeys.openBookings(), (current = []) => {
    if (removeFromOpen) return current.filter((item) => bookingIdentity(item) !== identity);
    const open = normalizeOpenLoad(booking);
    return current.map((item) => (bookingIdentity(item) === identity ? open : item));
  });
}

export function useTrucks(params = {}, options = {}) {
  return useQuery({
    queryKey: commercialQueryKeys.trucks(params),
    queryFn: () => api.listTrucks(params),
    select: (data) => (Array.isArray(data.trucks) ? data.trucks.map(normalizeTruck) : []),
    placeholderData: keepPreviousData,
    ...options
  });
}

export function useFleetTrucks(options = {}) {
  return useQuery({
    queryKey: commercialQueryKeys.fleet(),
    queryFn: async () => {
      const data = await api.fleetTrucks();
      return Array.isArray(data.trucks) ? data.trucks.map(normalizeTruck) : [];
    },
    ...options
  });
}

export function useCreateFleetTruck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.createTruck(payload),
    onSuccess: (data) => {
      if (!data?.truck) return;
      updateFleetTruckCache(queryClient, data.truck);
    }
  });
}

export function useRemoveFleetTruck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (truckId) => api.removeTruck(truckId),
    onSuccess: (_data, truckId) => {
      queryClient.setQueryData(commercialQueryKeys.fleet(), (current = []) =>
        current.filter((item) => String(item.id) !== String(truckId))
      );
    }
  });
}

export function useDrivers(options = {}) {
  return useQuery({
    queryKey: commercialQueryKeys.drivers(),
    queryFn: () => api.listDrivers(),
    ...options
  });
}

export function useInviteDriver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.inviteDriver(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commercialQueryKeys.drivers() });
    }
  });
}

export function useRevokeDriverInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (invitationId) => api.revokeDriverInvitation(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commercialQueryKeys.drivers() });
    }
  });
}

export function useAssignDriverTruck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ driverId, truckId }) => api.assignDriverTruck(driverId, truckId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commercialQueryKeys.drivers() });
      queryClient.invalidateQueries({ queryKey: commercialQueryKeys.fleet() });
    }
  });
}

export function useUnassignDriverTruck() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (driverId) => api.unassignDriverTruck(driverId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commercialQueryKeys.drivers() });
      queryClient.invalidateQueries({ queryKey: commercialQueryKeys.fleet() });
    }
  });
}

export function useBookings(options = {}) {
  return useQuery({
    queryKey: commercialQueryKeys.bookingList(),
    queryFn: async () => {
      const data = await api.listBookings();
      return Array.isArray(data.bookings) ? data.bookings.map(normalizeBookingShipment) : [];
    },
    ...options
  });
}

export function useOpenBookings(options = {}) {
  return useQuery({
    queryKey: commercialQueryKeys.openBookings(),
    queryFn: async () => {
      const data = await api.listOpenBookings();
      return Array.isArray(data.bookings) ? data.bookings.map(normalizeOpenLoad) : [];
    },
    ...options
  });
}

export function useBookingAction(action) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (data, variables) => {
      if (data?.booking) {
        updateBookingCache(queryClient, data.booking, { removeFromOpen: Boolean(variables?.removeFromOpen) });
      }
    }
  });
}

export function useBookingCache() {
  const queryClient = useQueryClient();
  const fetchBooking = useCallback(
    (bookingId) =>
      queryClient.fetchQuery({
        queryKey: commercialQueryKeys.bookingDetail(bookingId),
        queryFn: async () => {
          const data = await api.getBooking(bookingId);
          return normalizeBookingShipment(data.booking || {});
        }
      }),
    [queryClient]
  );
  const updateBooking = useCallback(
    (booking, options) => updateBookingCache(queryClient, booking, options),
    [queryClient]
  );
  return {
    fetchBooking,
    updateBooking
  };
}

export function useDebouncedValue(value, delay = 450) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debounced;
}

export function useBookingEstimate(payload) {
  const debouncedPayload = useDebouncedValue(payload);
  return useQuery({
    queryKey: commercialQueryKeys.estimate(debouncedPayload),
    queryFn: () => api.estimate(debouncedPayload),
    placeholderData: keepPreviousData
  });
}

export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.createBooking(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: commercialQueryKeys.bookings() });
      queryClient.setQueryData(commercialQueryKeys.draft(), null);
    }
  });
}

export function useBookingDraft(options = {}) {
  return useQuery({
    queryKey: commercialQueryKeys.draft(),
    queryFn: async () => {
      const data = await api.getBookingDraft();
      return data.draft || null;
    },
    ...options
  });
}

export function useSaveBookingDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.saveBookingDraft(payload),
    onSuccess: (data) => {
      if (data?.draft) {
        queryClient.setQueryData(commercialQueryKeys.draft(), data.draft);
      }
    }
  });
}

export function useDeleteBookingDraft() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.deleteBookingDraft(),
    onSuccess: () => {
      queryClient.setQueryData(commercialQueryKeys.draft(), null);
    }
  });
}

export function useBookingDispatch(bookingId, options = {}) {
  return useQuery({
    queryKey: commercialQueryKeys.dispatch(bookingId),
    queryFn: async () => {
      if (!bookingId) return null;
      const data = await api.bookingDispatch(bookingId);
      return data.dispatchPlan || null;
    },
    enabled: Boolean(bookingId),
    ...options
  });
}
