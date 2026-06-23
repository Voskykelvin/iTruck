import { useCallback, useEffect } from 'react';
import { api, setSession } from '../api.js';

export function usePollingEffect(active, callback, intervalMs = 30000) {
  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    const run = () => {
      if (!cancelled) callback();
    };
    const interval = window.setInterval(run, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [active, callback, intervalMs]);
}

export function useCurrentUserPolling(active, setUser, intervalMs = 30000) {
  const refreshUser = useCallback(async () => {
    if (!active) return;
    try {
      const data = await api.profile();
      if (data.user) {
        setSession({ user: data.user });
        setUser(data.user);
      }
    } catch (_err) {
      // Polling is a fallback; visible upload actions still report errors directly.
    }
  }, [active, setUser]);

  usePollingEffect(active, refreshUser, intervalMs);
}
