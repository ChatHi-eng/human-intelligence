// Palam's service worker. It does one job: show a notification when Palam
// sends one, and open the right page when it is tapped. It does not cache
// anything, so it can never serve an old copy of the app.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { body: event.data ? event.data.text() : '' };
  }
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    data: { path: typeof data.path === 'string' ? data.path : '/' },
  };
  // A later message about the same booking replaces the earlier one.
  if (data.tag) {
    options.tag = data.tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(data.title || 'Palam', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.path) || '/';
  // Only ever open Palam's own pages, whatever the message said.
  const url = new URL(path.charAt(0) === '/' ? path : '/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(url);
            } catch (err) {
              // The open page could not be redirected; it is at least in front.
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
