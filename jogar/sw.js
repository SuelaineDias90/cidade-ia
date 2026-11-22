const C = 'cidadeia-v1';
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const leve = e.request.mode === 'navigate' || /\.(html|js|json)(\?|$)/.test(e.request.url) && !e.request.url.includes('/modelos/');
  if (leve) {   // código do jogo: sempre a versão nova (cache só sem internet)
    e.respondWith(fetch(e.request).then(x => { if (x.ok) { const y = x.clone(); caches.open(C).then(c => c.put(e.request, y)); } return x; }).catch(() => caches.match(e.request)));
    return;
  }
  e.respondWith(caches.open(C).then(async c => {
    const r = await c.match(e.request);
    const rede = fetch(e.request).then(x => { if (x.ok) c.put(e.request, x.clone()); return x; }).catch(() => r);
    return r || rede;
  }));
});
