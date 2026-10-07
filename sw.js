// Service worker do app do aluno (Performance Hub). Versionamento: muda
// SW_VERSION a cada deploy que mexe no shell/cache — isso cria um cache
// novo e o browser detecta o arquivo sw.js como "diferente" (comparação
// byte a byte), instalando a versão nova em segundo plano (fica em
// "waiting" até o próprio app mandar SKIP_WAITING, nunca sozinho, pra não
// trocar no meio de um treino em andamento sem avisar).
const SW_VERSION = 'v3';
// IMPORTANTE: esse nome é o mesmo hardcoded em SHELL_CACHE_NAME no
// aluno.html (a própria página se cacheia sozinha lá, porque o SW só
// controla a partir da navegação seguinte à que o registrou) — mudar
// SW_VERSION aqui exige atualizar o valor lá também.
const SHELL_CACHE = 'meridian-aluno-shell-' + SW_VERSION;

// Ícones fixos da Meridian (Entrega 2) — os mesmos em todo o app,
// independente do profissional. Ver icons/LEIA-ME.md.
const SHELL_URLS = [
  '/icons/favicon.svg', '/icons/favicon.ico',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png', '/icons/icon-512.png',
  '/icons/icon-maskable-192.png', '/icons/icon-maskable-512.png',
  '/icons/icon-mono-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_URLS)));
  // Sem skipWaiting automático aqui — ver comentário no topo do arquivo.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

// O app manda essa mensagem só quando o aluno clica em "Atualizar" no
// banner de nova versão — nunca automaticamente.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  // Dados do aluno NUNCA passam pelo cache do service worker: sempre rede
  // direto (o cache de dados — ficha ativa, fila de sincronização — é
  // feito à parte, em IndexedDB, pelo próprio app, escopado por aluno).
  if (url.pathname.startsWith('/api/')) return;

  if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith(caches.match(event.request).then((r) => r || fetch(event.request)));
    return;
  }

  if (url.pathname.startsWith('/aluno/')) {
    // A própria página do app: tenta rede e atualiza o cache a cada acesso
    // (cache sempre fresco quando há internet); se a rede falhar (offline
    // ou app recém-aberto sem sinal), serve a última versão cacheada —
    // é isso que permite abrir o app instalado com o aparelho em modo avião.
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
