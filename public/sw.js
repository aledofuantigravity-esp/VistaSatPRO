// Service Worker v3 — VistaSatPRO
// Estrategia limpia compatible con Next.js App Router (sin interceptar RSC ni /api/)

const STATIC_CACHE = 'vistasat-static-v3';
const MEDIA_CACHE = 'vistasat-media-v2';
const OFFLINE_URL = '/offline.html';

// Solo recursos estáticos directos (sin rutas con redirect como '/')
const STATIC_ASSETS = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/badge-72.png?v=2',
];

// ─── INSTALL ─────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ─── ACTIVATE ────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter(
              (name) =>
                name.startsWith('vistasat-') &&
                name !== STATIC_CACHE &&
                name !== MEDIA_CACHE
            )
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
      .then(() =>
        self.clients.matchAll({ type: 'window' }).then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'SW_ACTIVATED' });
          });
        })
      )
  );
});

// ─── FETCH ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!url.protocol.startsWith('http')) return;

  // Nunca interceptar APIs del servidor ni peticiones RSC/prefetch de Next.js App Router
  if (
    url.pathname.startsWith('/api/') ||
    url.searchParams.has('_rsc') ||
    request.headers.get('RSC') === '1' ||
    request.headers.get('Next-Router-Prefetch') === '1'
  ) {
    return;
  }

  // Imágenes de Supabase Storage → CacheFirst (7 días)
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/storage/')) {
    event.respondWith(cacheFirstWithExpiry(request, MEDIA_CACHE, 7 * 24 * 60 * 60));
    return;
  }

  // Assets estáticos inmutables de Next.js → CacheFirst
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Iconos, screenshots y manifest → CacheFirst
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.startsWith('/screenshots/') ||
    url.pathname === '/manifest.webmanifest'
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // Navegaciones HTML → NetworkFirst con fallback a /offline.html si no hay red
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const offline = await caches.match(OFFLINE_URL);
        return (
          offline ||
          new Response('Sin conexión', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        );
      })
    );
  }
});

// ─── PUSH NOTIFICATIONS ──────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let data;
  try {
    data = event.data.json();
  } catch {
    data = {
      title: 'VistaSatPRO',
      body: event.data.text(),
      taskId: null,
      type: 'generic',
    };
  }

  const { title, body, taskId, type } = data;

  const options = {
    body: body || 'Tienes una actualización en un parte de trabajo.',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png?v=2',
    tag: taskId ? `task-${taskId}` : `generic-${Date.now()}`,
    renotify: true,
    data: {
      taskId,
      url: taskId ? `/tasks/${taskId}` : '/dashboard',
      type,
    },
    actions: taskId ? [{ action: 'open', title: 'Ver parte' }] : [],
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title || 'VistaSatPRO', options));
});

// ─── NOTIFICATION CLICK ───────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const { url } = event.notification.data || {};
  const targetUrl = url || '/dashboard';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            client.navigate(targetUrl);
            return;
          }
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});

// ─── BACKGROUND SYNC ─────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-actions') {
    event.waitUntil(Promise.resolve());
  }
});

// ─── HELPERS ─────────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && !response.redirected) {
    cache.put(request, response.clone());
  }
  return response;
}

async function cacheFirstWithExpiry(request, cacheName, maxAgeSeconds) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    const cachedDate = cached.headers.get('sw-cached-at');
    if (cachedDate) {
      const age = (Date.now() - parseInt(cachedDate, 10)) / 1000;
      if (age < maxAgeSeconds) return cached;
    } else {
      return cached;
    }
  }

  const response = await fetch(request);
  if (response.ok && !response.redirected) {
    const headers = new Headers(response.headers);
    headers.append('sw-cached-at', Date.now().toString());
    const responseToCache = new Response(await response.blob(), {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
    cache.put(request, responseToCache);
    return responseToCache;
  }
  return response;
}
