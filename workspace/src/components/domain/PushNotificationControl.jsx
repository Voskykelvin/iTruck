import { useEffect, useState } from 'react';
import { BellRing, BellOff } from 'lucide-react';
import { api } from '../../api';
import Button from '../ui/Button';
import { useToast } from '../ui/Toast';

function applicationServerKey(value) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = window.atob(padded);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

export default function PushNotificationControl({ subscribed = false }) {
  const { addToast } = useToast();
  const [isAvailable, setIsAvailable] = useState(false);
  const [isEnabled, setIsEnabled] = useState(Boolean(subscribed));
  const [isLoading, setIsLoading] = useState(true);
  const [isWorking, setIsWorking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const checkAvailability = async () => {
      const browserSupported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
      if (!browserSupported) {
        if (!cancelled) {
          setIsAvailable(false);
          setIsLoading(false);
        }
        return;
      }
      try {
        const config = await api.pushConfig();
        if (!cancelled) {
          setIsAvailable(Boolean(config.configured && config.publicKey));
          setIsLoading(false);
        }
      } catch (_error) {
        if (!cancelled) {
          setIsAvailable(false);
          setIsLoading(false);
        }
      }
    };

    checkAvailability();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = async () => {
    setIsWorking(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Notification permission was not granted');

      const config = await api.pushConfig();
      if (!config.configured || !config.publicKey) throw new Error('Push notifications are not configured yet');

      const registration = await navigator.serviceWorker.register('/push-service-worker.js');
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(config.publicKey)
        }));

      await api.subscribePush(subscription.toJSON());
      setIsEnabled(true);
      addToast({
        title: 'Push notifications enabled',
        message: 'iTruck can now alert this device about important updates.',
        type: 'success'
      });
    } catch (error) {
      addToast({ title: 'Push notifications unavailable', message: error.message, type: 'warning' });
    } finally {
      setIsWorking(false);
    }
  };

  const disable = async () => {
    setIsWorking(true);
    try {
      await api.unsubscribePush();
      const registration = await navigator.serviceWorker.getRegistration('/push-service-worker.js');
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();
      setIsEnabled(false);
      addToast({ title: 'Push notifications disabled', type: 'info' });
    } catch (error) {
      addToast({ title: 'Could not update push notifications', message: error.message, type: 'error' });
    } finally {
      setIsWorking(false);
    }
  };

  if (isLoading) return <div className="text-secondary text-sm">Checking push notification availability…</div>;

  if (!isAvailable) {
    return (
      <p className="text-secondary" style={{ fontSize: 'var(--text-sm)', margin: 0 }}>
        Push alerts are not configured for this environment yet.
      </p>
    );
  }

  return (
    <div className="row-between push-notification-control">
      <div>
        <strong>Device alerts</strong>
        <p className="text-secondary">Receive booking, payment, and delivery updates on this device.</p>
      </div>
      <Button
        variant={isEnabled ? 'ghost' : 'secondary'}
        size="sm"
        icon={isEnabled ? BellOff : BellRing}
        loading={isWorking}
        onClick={isEnabled ? disable : enable}
      >
        {isEnabled ? 'Turn off' : 'Turn on'}
      </Button>
    </div>
  );
}
