/* Service worker FamilySync: riceve le notifiche web push. */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

/**
 * Tag della notifica: deve essere UNIVOCO per elemento (eventId/billId/choreId).
 * Due promemoria dello stesso tipo (es. due eventi di oggi, inviati a pochi
 * secondi di distanza) NON devono condividere il tag, altrimenti il browser
 * sostituisce la prima notifica con la seconda e l'utente ne vede una sola.
 * Stesso elemento => stesso tag (aggiornamento voluto della stessa notifica).
 * Regressione reale in produzione il 5 ago 2026: non rimuovere gli id dal tag.
 */
function computeNotificationTag(data) {
  if (!data || !data.type) return undefined;
  return [data.type, data.eventId, data.billId, data.choreId]
    .filter(Boolean)
    .join(':');
}
// Esposta per i test automatici (in un service worker reale è innocua).
self.__computeNotificationTag = computeNotificationTag;

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
      tag: computeNotificationTag(payload.data),
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
