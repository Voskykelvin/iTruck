import { useCallback, useEffect, useRef, useState } from 'react';

export function useServiceWorkerUpdate() {
  const [waitingWorker, setWaitingWorker] = useState(null);
  const [updateReady, setUpdateReady] = useState(false);
  const reloadOnControllerChangeRef = useRef(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return undefined;

    let mounted = true;

    function watchWorker(worker) {
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller && mounted) {
          setWaitingWorker(worker);
          setUpdateReady(true);
        }
      });
    }

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        if (!mounted) return;
        if (registration.waiting) {
          setWaitingWorker(registration.waiting);
          setUpdateReady(true);
        }

        registration.addEventListener('updatefound', () => watchWorker(registration.installing));
        registration.update().catch(() => {});
      })
      .catch(() => {});

    const handleControllerChange = () => {
      if (!reloadOnControllerChangeRef.current) return;
      reloadOnControllerChangeRef.current = false;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    return () => {
      mounted = false;
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
    };
  }, []);

  const applyUpdate = useCallback(() => {
    if (!waitingWorker) return;
    reloadOnControllerChangeRef.current = true;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  }, [waitingWorker]);

  const dismissUpdate = useCallback(() => {
    setUpdateReady(false);
  }, []);

  return { applyUpdate, dismissUpdate, updateReady };
}
