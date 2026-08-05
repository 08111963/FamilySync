/* Service worker FamilySync: riceve le notifiche web push. */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = { title: 'FamilySync', body: '', data: {} };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (e) {
    if (event.data) payload.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || 'FamilySync', {
      body: payload.body || '',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      data: payload.data || {},
      // Tag univoco per elemento: due promemoria dello stesso tipo (es. due
      // eventi di oggi) NON devono sostituirsi a vicenda nella tendina.
      tag: payload.data && payload.data.type
        ? [payload.data.type, payload.data.eventId, payload.data.billId, payload.data.choreId]
            .filter(Boolean)
            .join(':')
        : undefined,
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })
  );
});
