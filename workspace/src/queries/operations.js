import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { commercialQueryKeys } from './commercial.js';

export const operationsQueryKeys = {
  all: ['operations'],
  drivers: () => ['operations', 'drivers'],
  profile: () => ['operations', 'profile'],
  deliveryProofPolicy: () => ['operations', 'delivery-proof-policy'],
  wallet: () => ['operations', 'wallet']
};

export function useDeliveryProofPolicy(options = {}) {
  return useQuery({
    queryKey: operationsQueryKeys.deliveryProofPolicy(),
    queryFn: () => api.getDeliveryProofPolicy(),
    staleTime: 5 * 60 * 1000,
    ...options
  });
}

export function useProfile(user, options = {}) {
  return useQuery({
    queryKey: operationsQueryKeys.profile(),
    queryFn: async () => {
      const data = await api.profile();
      return data.user || null;
    },
    initialData: user || undefined,
    ...options
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.updateProfile(payload),
    onSuccess: (data) => {
      if (data.user) queryClient.setQueryData(operationsQueryKeys.profile(), data.user);
    }
  });
}

export function useWallet(options = {}) {
  return useQuery({
    queryKey: operationsQueryKeys.wallet(),
    queryFn: async () => {
      const data = await api.wallet();
      return {
        balance: Number.isFinite(Number(data.balance)) ? Number(data.balance) : 0,
        transactions: Array.isArray(data.transactions) ? data.transactions : []
      };
    },
    select: (wallet) => wallet.balance,
    ...options
  });
}

export function useDriverOperations(options = {}) {
  return useQuery({
    queryKey: operationsQueryKeys.drivers(),
    queryFn: async () => {
      const data = await api.listDrivers();
      return {
        drivers: Array.isArray(data.drivers) ? data.drivers : [],
        invitations: Array.isArray(data.invitations) ? data.invitations : [],
        assignments: Array.isArray(data.assignments) ? data.assignments : []
      };
    },
    ...options
  });
}

export function useDriverAction(action) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: operationsQueryKeys.drivers() }),
        queryClient.invalidateQueries({ queryKey: commercialQueryKeys.fleet() })
      ]);
    }
  });
}

export function useUploadDeliveryProofPhotos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, files, metadata }) => api.uploadDeliveryProofPhotos(bookingId, files, metadata),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: operationsQueryKeys.all });
    }
  });
}

export function useFinalizeDeliveryProof() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, data }) => api.finalizeDeliveryProof(bookingId, data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: operationsQueryKeys.all });
    }
  });
}
