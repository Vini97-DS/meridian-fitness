const SHELL_CACHE = 'meridian-aluno-shell-v1';
const SHELL_URLS = ['/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_URLS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  // Dados do aluno nunca passam pelo cache: sempre rede
  if (url.pathname.startsWith('/api/')) return;
  if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((r) => r || fetch(event.request)));
    return;
  }
  if (url.pathname.startsWith('/aluno/')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
  }
});
