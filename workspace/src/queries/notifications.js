import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { defaultNotificationPreferences, normalizeNotificationRecord, userIdFor } from '../utils/helpers.js';

const identityFor = (user) => userIdFor(user) || user?.email || 'anonymous';

export const notificationQueryKeys = {
  all: ['notifications'],
  list: (identity) => ['notifications', 'list', identity],
  preferences: (identity) => ['notifications', 'preferences', identity]
};

export function useNotifications(user, options = {}) {
  const identity = identityFor(user);
  return useQuery({
    queryKey: notificationQueryKeys.list(identity),
    queryFn: async () => {
      const data = await api.listNotifications({ limit: 30 });
      return Array.isArray(data.notifications) ? data.notifications.map(normalizeNotificationRecord) : [];
    },
    ...options
  });
}

export function useNotificationCache(user) {
  const queryClient = useQueryClient();
  const identity = identityFor(user);
  return useCallback(
    (record) => {
      const note = normalizeNotificationRecord({ ...record, read: record?.read ?? false });
      queryClient.setQueryData(notificationQueryKeys.list(identity), (current = []) => {
        const existing = current.find((item) => item.id === note.id);
        if (existing) return current.map((item) => (item.id === note.id ? { ...item, ...note } : item));
        return [note, ...current].slice(0, 30);
      });
    },
    [identity, queryClient]
  );
}

export function useMarkAllNotificationsRead(user) {
  const queryClient = useQueryClient();
  const identity = identityFor(user);
  return useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.setQueryData(notificationQueryKeys.list(identity), (current = []) =>
        current.map((notification) => ({ ...notification, read: true }))
      );
    }
  });
}

export function useNotificationPreferences(user, options = {}) {
  const identity = identityFor(user);
  return useQuery({
    queryKey: notificationQueryKeys.preferences(identity),
    queryFn: async () => {
      const data = await api.notificationPreferences();
      return data.preferences || defaultNotificationPreferences;
    },
    ...options
  });
}

export function useUpdateNotificationPreferences(user) {
  const queryClient = useQueryClient();
  const identity = identityFor(user);
  return useMutation({
    mutationFn: (preferences) => api.updateNotificationPreferences(preferences),
    onSuccess: (data) => {
      if (data.preferences) queryClient.setQueryData(notificationQueryKeys.preferences(identity), data.preferences);
    }
  });
}

export function useSendTestNotification() {
  return useMutation({ mutationFn: () => api.sendTestNotification() });
}
