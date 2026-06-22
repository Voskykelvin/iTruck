import { useEffect, useState } from 'react';
import { api } from '../api.js';

function decodeKey(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replaceAll('-', '+').replaceAll('_', '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export default function PushNotificationControl({ notify, onChange }) {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => setSubscribed(Boolean(subscription)))
      .catch(() => {});
  }, [supported]);

  async function enable() {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Browser notification permission was not granted');
      const config = await api.pushConfig();
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeKey(config.publicKey)
        }));
      await api.subscribePush(subscription.toJSON());
      setSubscribed(true);
      onChange?.(true);
      notify('Browser push notifications enabled');
    } catch (err) {
      notify(err.message || 'Could not enable browser notifications');
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      await subscription?.unsubscribe();
      await api.unsubscribePush();
      setSubscribed(false);
      onChange?.(false);
      notify('Browser push notifications disabled');
    } catch (err) {
      notify(err.message || 'Could not disable browser notifications');
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return <span className="muted-note">This browser does not support web push.</span>;
  return (
    <div className="push-notification-control">
      <span>{subscribed ? 'This browser is subscribed.' : 'Enable alerts even when iTruck is not open.'}</span>
      <button className="ghost" type="button" disabled={busy} onClick={subscribed ? disable : enable}>
        {busy ? 'Updating...' : subscribed ? 'Disable browser push' : 'Enable browser push'}
      </button>
    </div>
  );
}
