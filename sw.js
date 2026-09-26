self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {} } catch {}
  event.waitUntil(self.registration.showNotification('AVISO DE LA JEFA CHICA', {
    body: 'Tienes un nuevo aviso en EndoTurnos.',
    icon: '/ENDOTURNOS-WEB/mascots/apple.png',
    badge: '/ENDOTURNOS-WEB/mascots/apple.png',
    tag: data.id || 'endoturnos-aviso',
    data: { url: '/ENDOTURNOS-WEB/?avisos=1' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/ENDOTURNOS-WEB/?avisos=1', self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
    const existing = windows.find(window => window.url.startsWith(self.location.origin + '/ENDOTURNOS-WEB/'));
    if (existing) { await existing.navigate(target); return existing.focus() }
    return clients.openWindow(target)
  }));
});
