self.addEventListener('push', (event) => {
  const payload = event.data?.json?.() || {};
  const title = payload.title || 'iTruck update';
  const options = {
    body: payload.body || payload.message || 'There is an update waiting for you.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    data: { link: payload.link || '/app/shipper' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data?.link || '/app/shipper'));
});
