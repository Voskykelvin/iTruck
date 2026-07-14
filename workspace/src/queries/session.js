import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';

export const sessionQueryKeys = {
  current: () => ['session', 'current']
};

export function useSessionBootstrap() {
  return useQuery({
    queryKey: sessionQueryKeys.current(),
    queryFn: async () => {
      try {
        const data = await api.profile();
        return data.user || null;
      } catch (_err) {
        return null;
      }
    },
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials) => api.login(credentials),
    onSuccess: (data) => {
      queryClient.setQueryData(sessionQueryKeys.current(), data.user);
    }
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.logout(),
    onSettled: () => {
      queryClient.setQueryData(sessionQueryKeys.current(), null);
    }
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.revokeSession(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKeys.current() });
    }
  });
}

export function useRevokeOtherSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.revokeOtherSessions(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKeys.current() });
    }
  });
}

export function useUploadProfileDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ documentType, file }) => api.uploadProfileDocument(documentType, file),
    onSuccess: (data) => {
      queryClient.setQueryData(sessionQueryKeys.current(), data.user);
    }
  });
}
