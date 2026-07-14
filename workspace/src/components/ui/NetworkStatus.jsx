import { useEffect, useState } from 'react';
import { CloudOff, Wifi } from 'lucide-react';

export default function NetworkStatus({ className = '' }) {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const updateStatus = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }, []);

  return (
    <span
      className={`network-status ${online ? 'is-online' : 'is-offline'} ${className}`.trim()}
      role="status"
      aria-live="polite"
      title={online ? 'You are online' : 'You are offline; reconnect before retrying actions'}
    >
      {online ? <Wifi size={15} /> : <CloudOff size={15} />}
      <span>{online ? 'Online' : 'Offline'}</span>
    </span>
  );
}
