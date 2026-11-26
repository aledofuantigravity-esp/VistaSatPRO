'use client';

import { useEffect } from 'react';

/**
 * ServiceWorkerRegistration
 * Se monta una sola vez en el RootLayout.
 * Registra sw.js, gestiona actualizaciones y escucha mensajes del SW.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    const registerSW = async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none', // Forzar comprobación de actualizaciones siempre
        });

        console.log('[SW] Registrado correctamente:', registration.scope);

        // Comprobar actualizaciones cada vez que la app vuelve al foco
        const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible') {
            registration.update();
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Detectar cuando hay un nuevo SW esperando → notificar al usuario
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          if (!newWorker) return;

          newWorker.addEventListener('statechange', () => {
            if (
              newWorker.state === 'installed' &&
              navigator.serviceWorker.controller
            ) {
              // Hay una nueva versión disponible
              window.dispatchEvent(new CustomEvent('sw:update-available'));
            }
          });
        });

        return () => {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
      } catch (error) {
        console.error('[SW] Error al registrar:', error);
      }
    };

    // Escuchar mensajes del SW (p.ej. SW_ACTIVATED)
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_ACTIVATED') {
        console.log('[SW] Nuevo SW activado');
      }
    });

    registerSW();
  }, []);

  // No renderiza nada en el DOM
  return null;
}
