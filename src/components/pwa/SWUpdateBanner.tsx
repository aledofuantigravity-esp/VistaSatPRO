'use client';

import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * SWUpdateBanner — Notifica al usuario cuando hay una nueva versión disponible.
 * Se dispara por el evento 'sw:update-available' del ServiceWorkerRegistration.
 */
export function SWUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    const handleUpdate = () => setUpdateAvailable(true);
    window.addEventListener('sw:update-available', handleUpdate);
    return () => window.removeEventListener('sw:update-available', handleUpdate);
  }, []);

  const handleUpdate = () => {
    // Recargar la página para activar el nuevo SW
    window.location.reload();
  };

  if (!updateAvailable) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 animate-slide-down"
      style={{ paddingTop: 'var(--safe-top)' }}
    >
      <div className="bg-navy text-white px-4 py-2.5 flex items-center gap-3">
        <RefreshCw size={15} className="flex-shrink-0" />
        <span className="text-sm font-medium flex-1">
          Nueva versión disponible
        </span>
        <button
          onClick={handleUpdate}
          className="flex-shrink-0 text-sm font-bold text-magenta hover:text-white transition-colors px-2"
        >
          Actualizar
        </button>
      </div>
    </div>
  );
}
