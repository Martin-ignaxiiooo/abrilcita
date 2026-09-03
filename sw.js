const CACHE = 'abrilcita-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/config.js',
  './js/db.js',
  './js/validaciones.js',
  './js/app.js',
  './js/router.js',
  './assets/logo.svg',
  './assets/icon-192.png',
  './assets/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Peticiones a Supabase: solo red (nunca cachear datos personales ni fallar por offline)
  if (url.hostname.includes('supabase')) return;

  // Estrategia network-first para recursos remotos (CDNs) y relativos
  event.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        if (req.url.startsWith(self.location.origin) || url.hostname.includes('fonts') || url.hostname.includes('cdn') || url.hostname.includes('unpkg')) {
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});