const C = 'cidadeia-v1';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(C).then(async c => {
    const r = await c.match(e.request);
    const rede = fetch(e.request).then(x => { if (x.ok) c.put(e.request, x.clone()); return x; }).catch(() => r);
    return r || rede;
  }));
});
