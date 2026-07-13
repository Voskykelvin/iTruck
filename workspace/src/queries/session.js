import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';

export const sessionQueryKeys = {
  current: () => ['session', 'current']
};

export function useSessionBootstrap() {
  return useQuery({
    queryKey: sessionQueryKeys.current(),
    queryFn: async () => {
      const data = await api.profile();
      return data.user || null;
    },
    retry: (failureCount, error) => error?.status !== 401 && failureCount < 1,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false
  });
}
