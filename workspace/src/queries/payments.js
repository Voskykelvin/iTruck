import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api.js';
import { updateBookingCache } from './commercial.js';
import { operationsQueryKeys } from './operations.js';

function normalizeWallet(data = {}) {
  return {
    balance: Number.isFinite(Number(data.balance)) ? Number(data.balance) : 0,
    transactions: Array.isArray(data.transactions) ? data.transactions : []
  };
}

function transactionIdentity(transaction) {
  return String(transaction?._id || transaction?.id || transaction?.reference || '');
}

function transactionFrom(data) {
  if (data?.transaction) return data.transaction;
  if (data?.type && data?.amount !== undefined) return data;
  return null;
}

function returnedBalance(data, transaction) {
  const value = data?.balance ?? transaction?.metadata?.walletBalance;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export function updateWalletCache(queryClient, data) {
  const transaction = transactionFrom(data);
  const balance = returnedBalance(data, transaction);
  if (!transaction && balance === null) return;

  queryClient.setQueryData(operationsQueryKeys.wallet(), (current = { balance: 0, transactions: [] }) => {
    const identity = transactionIdentity(transaction);
    const transactions = transaction
      ? [
          transaction,
          ...(current.transactions || []).filter((item) => !identity || transactionIdentity(item) !== identity)
        ].slice(0, 50)
      : current.transactions || [];
    return { balance: balance === null ? current.balance : balance, transactions };
  });
}

export function useWalletAccount(options = {}) {
  return useQuery({
    queryKey: operationsQueryKeys.wallet(),
    queryFn: async () => normalizeWallet(await api.wallet()),
    ...options
  });
}

export function usePaymentAction(action) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: async (data) => {
      if (data?.booking) updateBookingCache(queryClient, data.booking);
      updateWalletCache(queryClient, data);
      await queryClient.invalidateQueries({ queryKey: operationsQueryKeys.wallet() });
    }
  });
}
