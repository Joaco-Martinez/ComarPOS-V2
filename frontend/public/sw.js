// ComarPOS service worker — solo cachea assets estáticos propios (mismo origin).
// Cualquier otro request (paginas, RSC, y sobre todo el backend cross-origin en
// otro puerto/dominio) pasa directo a la red, sin cachear: los GET al backend
// son datos tenant/usuario-scoped (ej. /auth/me) y cachearlos podria devolver
// datos de otro tenant/usuario en la sesion equivocada.
const CACHE_VERSION = 'comarpos-static-v1';

const STATIC_PATH_PATTERNS = [
  /^\/_next\/static\//,
  /^\/brand\//,
  /^\/icons\//,
  /^\/icon\.png$/,
  /^\/apple-icon\.png$/,
  /^\/manifest\.webmanifest$/,
  /\.(?:woff2?|ttf|otf)$/,
];

function isCacheableStatic(url) {
  return STATIC_PATH_PATTERNS.some((re) => re.test(url.pathname));
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // backend / terceros: siempre red
  if (!isCacheableStatic(url)) return; // paginas, RSC, etc: siempre red

  event.respondWith(
    caches.open(CACHE_VERSION).then(async (cache) => {
      const cached = await cache.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
  );
});
