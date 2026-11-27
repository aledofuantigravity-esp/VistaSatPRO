'use client';

import { useState, useEffect, useSyncExternalStore } from 'react';
import { RefreshCw, WifiOff, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { syncOfflineActions } from '@/lib/data-service';
import { getPendingOfflineActions } from '@/lib/offline-queue';

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

export function OfflineBanner() {
  const { profile } = useAuth();
  const isOnline = useSyncExternalStore(
    subscribeOnline,
    () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    () => true
  );
  const [isDismissed, setIsDismissed] = useState(false);
  const [showReconnected, setShowReconnected] = useState(false);
  const [syncedCount, setSyncedCount] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const refreshPending = async () => {
      const items = await getPendingOfflineActions();
      setPendingCount(items.length);
    };
    const t = setTimeout(() => void refreshPending(), 0);

    const handleOffline = () => {
      setIsDismissed(false);
      void refreshPending();
    };
    const handleOnline = () => {
      setSyncedCount(0);
      setShowReconnected(true);
      void refreshPending();
      setTimeout(() => setShowReconnected(false), 3500);
    };
    const handleSynced = (ev: Event) => {
      const count = (ev as CustomEvent<{ count?: number }>).detail?.count ?? 0;
      setSyncedCount(count);
      setShowReconnected(true);
      void refreshPending();
      setTimeout(() => setShowReconnected(false), 4000);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    window.addEventListener('vistasat:offline-queue-changed', refreshPending);
    window.addEventListener('vistasat:offline-synced', handleSynced);
    return () => {
      clearTimeout(t);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('vistasat:offline-queue-changed', refreshPending);
      window.removeEventListener('vistasat:offline-synced', handleSynced);
    };
  }, []);

  const handleManualSync = async () => {
    if (!profile || retrying) return;
    setRetrying(true);
    try {
      await syncOfflineActions(profile);
    } finally {
      setRetrying(false);
    }
  };

  if (showReconnected && isOnline && pendingCount === 0) {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-50 animate-slide-down"
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        <div className="bg-success text-white px-4 py-2.5 flex items-center justify-center gap-2">
          <span className="text-sm font-semibold">
            ✓ Conexión restaurada
            {syncedCount > 0 ? ` · ${syncedCount} cambio${syncedCount === 1 ? '' : 's'} sincronizado${syncedCount === 1 ? '' : 's'}` : ''}
          </span>
        </div>
      </div>
    );
  }

  // Barra si estamos online pero aún quedan acciones en la cola esperando sincronizar
  if (isOnline && pendingCount > 0) {
    return (
      <div
        className="fixed top-0 left-0 right-0 z-50 animate-slide-down"
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        <div className="bg-petrol text-white px-4 py-2 flex items-center justify-center gap-3 text-xs sm:text-sm font-semibold">
          <span>
            {retrying
              ? `Sincronizando ${pendingCount} cambio${pendingCount === 1 ? '' : 's'} pendiente${pendingCount === 1 ? '' : 's'}...`
              : `${pendingCount} cambio${pendingCount === 1 ? '' : 's'} pendiente${pendingCount === 1 ? '' : 's'} de subir`}
          </span>
          <button
            type="button"
            onClick={handleManualSync}
            disabled={retrying}
            className="inline-flex items-center gap-1 px-2.5 py-1 bg-white/15 hover:bg-white/25 rounded-xs text-xs font-bold disabled:opacity-50"
          >
            <RefreshCw size={13} className={retrying ? 'animate-spin' : ''} /> Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (isOnline || isDismissed) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 animate-slide-down"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <div className="bg-warning text-charcoal px-4 py-2.5 flex items-center gap-3">
        <WifiOff size={16} className="flex-shrink-0" />
        <span className="text-sm font-semibold flex-1">
          Sin conexión — Trabajando con caché local
          {pendingCount > 0
            ? ` (${pendingCount} cambio${pendingCount === 1 ? '' : 's'} en cola)`
            : ' (fotos, firma y cambios se encolan automáticamente)'}
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
