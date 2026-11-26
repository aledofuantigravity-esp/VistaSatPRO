// Service Worker — VistaSatPRO
// Estrategia: CacheFirst para estáticos, NetworkFirst para API, fallback offline

const STATIC_CACHE = 'vistasat-static-v1';
const API_CACHE = 'vistasat-api-v1';
const MEDIA_CACHE = 'vistasat-media-v1';
const OFFLINE_URL = '/offline.html';

// Recursos que se precargan en la instalación del SW
const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ─── INSTALL ─────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      // Activar inmediatamente sin esperar a que cierren las pestañas antiguas
      return self.skipWaiting();
    })
  );
});

// ─── ACTIVATE ────────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => {
            // Eliminar cachés antiguas de versiones anteriores
            return (
              name.startsWith('vistasat-') &&
              name !== STATIC_CACHE &&
              name !== API_CACHE &&
              name !== MEDIA_CACHE
            );
          })
          .map((name) => caches.delete(name))
      );
    }).then(() => {
      // Tomar control de todos los clientes sin recargar
      return self.clients.claim();
    }).then(() => {
      // Notificar a todos los clientes que el SW se actualizó
      return self.clients.matchAll({ type: 'window' }).then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ type: 'SW_ACTIVATED' });
        });
      });
    })
  );
});

// ─── FETCH ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Ignorar requests que no sean GET
  if (request.method !== 'GET') return;

  // Ignorar extensiones de Chrome y otros esquemas no-http
  if (!url.protocol.startsWith('http')) return;

  // ── Rutas de API de Supabase → NetworkFirst con fallback caché ──
  if (url.hostname.includes('supabase.co') && url.pathname.startsWith('/rest/')) {
    event.respondWith(networkFirstWithCache(request, API_CACHE));
    return;
  }

  // ── Imágenes de Supabase Storage → CacheFirst (7 días) ──
  if (url.hostname.includes('supabase.co') && url.pathname.includes('/storage/')) {
    event.respondWith(cacheFirstWithExpiry(request, MEDIA_CACHE, 7 * 24 * 60 * 60));
    return;
  }

  // ── Next.js _next/static (JS/CSS compilados) → CacheFirst ──
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // ── Iconos y manifest → CacheFirst ──
  if (url.pathname.startsWith('/icons/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // ── Rutas de navegación Next.js → NetworkFirst con fallback offline ──
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(OFFLINE_URL);
      })
    );
    return;
  }

  // ── Resto → NetworkFirst genérico ──
  event.respondWith(networkFirstWithCache(request, STATIC_CACHE));
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
    badge: '/icons/badge-72.png',
    // tag evita mostrar notificaciones duplicadas para la misma tarea
    tag: taskId ? `task-${taskId}` : `generic-${Date.now()}`,
    renotify: true,
    data: {
      taskId,
      url: taskId ? `/tasks/${taskId}` : '/dashboard',
      type,
    },
    actions: taskId
      ? [{ action: 'open', title: 'Ver parte' }]
      : [],
    vibrate: [200, 100, 200],
  };

  event.waitUntil(
    self.registration.showNotification(title || 'VistaSatPRO', options)
  );
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
        // Si ya hay una ventana abierta, navegar en ella
        for (const client of clientList) {
          if ('focus' in client) {
            client.focus();
            client.navigate(targetUrl);
            return;
          }
        }
        // Si no hay ventana, abrir una nueva
        return self.clients.openWindow(targetUrl);
      })
  );
});

// ─── BACKGROUND SYNC ─────────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-pending-actions') {
    event.waitUntil(syncPendingActions());
  }
});

async function syncPendingActions() {
  // Las acciones pendientes offline se guardan en IndexedDB
  // y se procesan aquí cuando vuelve la conexión
  // La implementación completa se incluye en Fase 4
  console.log('[SW] Sincronizando acciones pendientes offline...');
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** CacheFirst: devuelve de caché si existe, si no hace fetch y cachea */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

/** NetworkFirst: intenta red, si falla usa caché */
async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);
    if (response.ok) {
      // Añadir timestamp de caché como header personalizado
      const responseToCache = response.clone();
      cache.put(request, responseToCache);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || Response.error();
  }
}

/** CacheFirst con expiración por tiempo (para media) */
async function cacheFirstWithExpiry(request, cacheName, maxAgeSeconds) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) {
    const cachedDate = cached.headers.get('sw-cached-at');
    if (cachedDate) {
      const age = (Date.now() - parseInt(cachedDate)) / 1000;
      if (age < maxAgeSeconds) return cached;
    } else {
      return cached; // Sin timestamp, asumir válido
    }
  }

  const response = await fetch(request);
  if (response.ok) {
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
