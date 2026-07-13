import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { api } from '../api.js';
import { normalizeWorkflowMessage, userIdFor } from '../utils/helpers.js';

export const conversationQueryKeys = {
  all: ['conversations'],
  messages: (bookingId, userId = '') => ['conversations', 'messages', String(bookingId || ''), String(userId || '')],
  cases: (bookingId) => ['conversations', 'cases', String(bookingId || '')]
};

function messageIdentity(message) {
  return String(message?.id || message?._id || message?.reference || '');
}

function caseIdentity(record) {
  return String(record?._id || record?.id || record?.caseNumber || '');
}

export function updateMessageCache(queryClient, bookingId, item, user) {
  if (!bookingId || !item) return;
  const normalized = normalizeWorkflowMessage(item, user);
  const identity = messageIdentity(normalized);
  queryClient.setQueryData(conversationQueryKeys.messages(bookingId, userIdFor(user)), (current = []) => {
    const exists = identity && current.some((message) => messageIdentity(message) === identity);
    return exists
      ? current.map((message) => (messageIdentity(message) === identity ? normalized : message))
      : [...current, normalized];
  });
}

export function updateCaseCache(queryClient, bookingId, record) {
  if (!bookingId || !record) return;
  const identity = caseIdentity(record);
  queryClient.setQueryData(conversationQueryKeys.cases(bookingId), (current = []) => {
    const exists = identity && current.some((item) => caseIdentity(item) === identity);
    return exists ? current.map((item) => (caseIdentity(item) === identity ? record : item)) : [record, ...current];
  });
}

export function useMessages(bookingId, user, options = {}) {
  return useQuery({
    queryKey: conversationQueryKeys.messages(bookingId, userIdFor(user)),
    queryFn: async () => {
      const data = await api.listMessages(bookingId);
      return Array.isArray(data.items) ? data.items.map((item) => normalizeWorkflowMessage(item, user)) : [];
    },
    enabled: Boolean(bookingId),
    ...options
  });
}

export function useSendMessage(user) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload) => api.sendMessage(payload),
    onSuccess: (data, variables) => updateMessageCache(queryClient, variables.booking, data?.item, user)
  });
}

export function useConversationCache(user) {
  const queryClient = useQueryClient();
  return useCallback((bookingId, item) => updateMessageCache(queryClient, bookingId, item, user), [queryClient, user]);
}

export function useShipmentCases(bookingId, options = {}) {
  return useQuery({
    queryKey: conversationQueryKeys.cases(bookingId),
    queryFn: async () => {
      const data = await api.listCases({ booking: bookingId, limit: 20 });
      return Array.isArray(data.cases) ? data.cases : [];
    },
    enabled: Boolean(bookingId),
    ...options
  });
}

export function useCaseAction(action) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (data, variables) => {
      if (data?.case) updateCaseCache(queryClient, variables.bookingId, data.case);
      else queryClient.invalidateQueries({ queryKey: conversationQueryKeys.cases(variables.bookingId) });
    }
  });
}
