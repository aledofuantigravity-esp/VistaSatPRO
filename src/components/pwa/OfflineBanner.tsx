'use client';

import { useState, useEffect } from 'react';
import { WifiOff, X } from 'lucide-react';

/**
 * OfflineBanner — Banner no intrusivo cuando no hay conexión.
 * Se muestra en la parte superior con animación de entrada.
 * El técnico puede descartarlo manualmente.
 */
export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Estado inicial
    setIsOffline(!navigator.onLine);

    const handleOffline = () => {
      setIsOffline(true);
      setIsDismissed(false); // Resetear dismiss al perder conexión de nuevo
    };

    const handleOnline = () => {
      setIsOffline(false);
      // Mostrar mensaje de reconexión brevemente
      setShowReconnected(true);
      setTimeout(() => setShowReconnected(false), 3000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  if (!isOffline && !showReconnected) return null;

  // Banner de reconexión (verde, temporal)
  if (showReconnected) {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-50 animate-slide-down"
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        <div className="bg-success text-white px-4 py-2.5 flex items-center justify-center gap-2">
          <span className="text-sm font-semibold">✓ Conexión restaurada</span>
        </div>
      </div>
    );
  }

  if (isDismissed) return null;

  // Banner offline (amarillo)
  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 animate-slide-down"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <div className="bg-warning text-charcoal px-4 py-2.5 flex items-center gap-3">
        <WifiOff size={16} className="flex-shrink-0" />
        <span className="text-sm font-semibold flex-1">
          Sin conexión — Los datos mostrados pueden no estar actualizados
        </span>
        <button
          onClick={() => setIsDismissed(true)}
          className="flex-shrink-0 p-0.5 opacity-70 hover:opacity-100"
          aria-label="Cerrar aviso"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
