// Service worker do app Cidade IA: deixa o jogo instalável. Não guarda nada em cache (o jogo sempre vem do servidor).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
