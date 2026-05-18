// ════════════════════════════════════════════════
// sw.js — Service Worker · Projetos LM
// Cache dos assets estáticos para instalação PWA
// ════════════════════════════════════════════════

const CACHE = 'projetos-lm-v5'; // incrementar a cada deploy significativo

// Assets estáticos — cache-first (imagens, fontes, html)
const ASSETS_STATIC = [
  '/projetos-lm/',
  '/projetos-lm/index.html',
  '/projetos-lm/icon-192.png',
  '/projetos-lm/icon-512.png',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap',
];

// Ficheiros de código — network-first para garantir versão mais recente
const ASSETS_CODE = [
  '/projetos-lm/style.css',
  '/projetos-lm/main.js',
  '/projetos-lm/firebase.js',
  '/projetos-lm/painel.js',
  '/projetos-lm/painel-dashboard.js',
  '/projetos-lm/painel-alertas.js',
  '/projetos-lm/painel-form-extras.js',
  '/projetos-lm/painel-mensagens.js',
  '/projetos-lm/cliente.js',
  '/projetos-lm/reclamacoes.js',
  '/projetos-lm/ocorrencias.js',
  '/projetos-lm/resumo-ia.js',
  '/projetos-lm/modo-apresentacao.js',
  '/projetos-lm/state.js',
  '/projetos-lm/ui.js',
  '/projetos-lm/i18n.js',
  '/projetos-lm/sanitize.js',
  '/projetos-lm/utils.js',
];

const ASSETS = [...ASSETS_STATIC, ...ASSETS_CODE];

// Instalar — cache dos assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(ASSETS.map(url => cache.add(url)))
    ).then(() => self.skipWaiting())
  );
});

// Ativar — limpar caches antigas e tomar controlo imediato
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch — estratégia diferenciada por tipo de asset
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // APIs externas — sempre network, nunca cache
  if (
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebase') ||
    url.hostname.includes('groq.com') ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('emailjs.com')
  ) {
    return;
  }

  // Ficheiros de código (.js, .css) — network-first
  // Garante sempre a versão mais recente; fallback para cache se offline
  const isCode = ASSETS_CODE.some(a => url.pathname === new URL(a, self.location.origin).pathname);
  if (isCode) {
    e.respondWith(
      fetch(e.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      }).catch(() => caches.match(e.request))
    );
    return;
  }

  // Assets estáticos (imagens, fontes, html) — cache-first, fallback network
  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(response => {
        if (response.ok && url.origin === self.location.origin) {
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
        }
        return response;
      });
    }).catch(() => caches.match('/projetos-lm/index.html'))
  );
});
