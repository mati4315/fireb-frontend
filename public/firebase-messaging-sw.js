self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    return;
  }

  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || 'Nueva notificacion';
  const options = {
    body: notification.body || '',
    icon: '/favicon.ico',
    data: {
      targetPath: typeof data.targetPath === 'string' ? data.targetPath : '/notificaciones',
      notificationId: typeof data.notificationId === 'string' ? data.notificationId : ''
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetPath = event.notification?.data?.targetPath || '/notificaciones';
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      return clients.openWindow(targetUrl);
    })
  );
});
