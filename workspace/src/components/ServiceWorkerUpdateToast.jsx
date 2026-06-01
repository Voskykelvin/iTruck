import { RefreshCw, X } from 'lucide-react';
import { useServiceWorkerUpdate } from '../hooks/useServiceWorkerUpdate.js';

export default function ServiceWorkerUpdateToast() {
  const { applyUpdate, dismissUpdate, updateReady } = useServiceWorkerUpdate();

  if (!updateReady) return null;

  return (
    <div className="update-toast" role="alert" aria-live="polite">
      <RefreshCw size={20} />
      <div>
        <strong>Update ready</strong>
        <span>Reload to use the latest iTruck workspace.</span>
      </div>
      <button className="secondary" type="button" onClick={applyUpdate}>
        Reload
      </button>
      <button className="ghost icon-button" type="button" onClick={dismissUpdate} aria-label="Dismiss update">
        <X size={16} />
      </button>
    </div>
  );
}
