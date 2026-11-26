'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { WifiOff, X } from 'lucide-react';

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function OfflineBanner() {
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    () => true
  );
  const [isDismissed, setIsDismissed] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    const handleOffline = () => setIsDismissed(false);
    const handleOnline = () => {
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

  if (isOnline && !showReconnected) return null;

  if (showReconnected && isOnline) {
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

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 animate-slide-down"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <div className="bg-warning text-charcoal px-4 py-2.5 flex items-center gap-3">
        <WifiOff size={16} className="flex-shrink-0" />
        <span className="text-sm font-semibold flex-1">
          Sin conexión — Trabajando con caché local (los cambios se encolan automáticamente)
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
