// ════════════════════════════════════════════════
// sw.js — Service Worker · Projetos LM
// Cache dos assets estáticos para instalação PWA
// ════════════════════════════════════════════════

const CACHE = 'projetos-lm-v2'; // incrementar a cada deploy significativo

const ASSETS = [
  '/projetos-lm/',
  '/projetos-lm/index.html',
  '/projetos-lm/style.css',
  '/projetos-lm/main.js',
  '/projetos-lm/firebase.js',
  '/projetos-lm/painel.js',
  '/projetos-lm/cliente.js',
  '/projetos-lm/reclamacoes.js',
  '/projetos-lm/ocorrencias.js',
  '/projetos-lm/resumo-ia.js',
  '/projetos-lm/modo-apresentacao.js',
  '/projetos-lm/state.js',
  '/projetos-lm/ui.js',
  '/projetos-lm/i18n.js',
  '/projetos-lm/sanitize.js',
  '/projetos-lm/icon-192.png',
  '/projetos-lm/icon-512.png',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
];

// Instalar — cache dos assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      // addAll falha tudo-ou-nada; usamos Promise.allSettled por asset
      // para que uma fonte externa em baixo (ex: Google Fonts) não bloqueie a instalação
      Promise.allSettled(ASSETS.map(url => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

// Ativar — limpar caches antigas
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — network first para Firebase/API, cache first para assets estáticos
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Firebase, Groq e APIs externas — sempre network, nunca cache
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('groq.com') ||
    url.hostname.includes('gstatic.com')
  ) {
    return; // deixa o browser tratar normalmente
  }

  // Assets estáticos — cache first, fallback network
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(response => {
        // Cache respostas válidas de assets próprios
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      });
    }).catch(() => caches.match('/projetos-lm/index.html'))
  );
});
