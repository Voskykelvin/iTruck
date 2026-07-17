import { useEffect, useState } from 'react';
import { CloudOff, Wifi } from 'lucide-react';

export default function NetworkStatus({ className = '' }) {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));

  useEffect(() => {
    const markOnline = () => setOnline(true);
    const markOffline = () => setOnline(false);
    window.addEventListener('online', markOnline);
    window.addEventListener('offline', markOffline);
    return () => {
      window.removeEventListener('online', markOnline);
      window.removeEventListener('offline', markOffline);
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
