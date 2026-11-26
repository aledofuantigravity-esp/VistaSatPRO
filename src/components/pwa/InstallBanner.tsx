'use client';

import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

/**
 * InstallBanner — Android / Chrome / Edge
 * Aparece como bottom sheet cuando el evento beforeinstallprompt está disponible.
 * Se oculta automáticamente si la app ya está instalada (modo standalone).
 */
export function InstallBanner() {
  const { canInstall, isInstalled, triggerInstall, installOutcome } = usePWAInstall();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Comprobar si ya se descartó antes (localStorage)
    const dismissed = localStorage.getItem('vistasat-install-dismissed');
    if (dismissed) {
      const dismissedAt = parseInt(dismissed);
      const daysSince = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24);
      // Volver a mostrar si han pasado más de 7 días
      if (daysSince < 7) {
        setIsDismissed(true);
        return;
      }
    }

    // Mostrar con pequeño delay para no interrumpir la carga inicial
    if (canInstall && !isInstalled) {
      const timer = setTimeout(() => setIsVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [canInstall, isInstalled]);

  // Ocultar si se instaló
  useEffect(() => {
    if (installOutcome === 'accepted') {
      setIsVisible(false);
    }
  }, [installOutcome]);

  const handleDismiss = () => {
    setIsVisible(false);
    setIsDismissed(true);
    localStorage.setItem('vistasat-install-dismissed', Date.now().toString());
  };

  const handleInstall = async () => {
    await triggerInstall();
  };

  if (!isVisible || isDismissed || isInstalled) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="mx-4 mb-4 bg-white rounded-lg shadow-elevated border border-border overflow-hidden">
        {/* Barra de acento superior */}
        <div className="h-1 bg-magenta" />

        <div className="p-4 flex items-start gap-3">
          {/* Icono de la app */}
          <div className="flex-shrink-0 w-12 h-12 bg-navy rounded-md flex items-center justify-center">
            {/* Icono maletín SVG inline */}
            <svg width="28" height="28" viewBox="0 0 44 44" fill="none">
              <rect x="6" y="16" width="32" height="22" rx="3" stroke="white" strokeWidth="2.5"/>
              <path d="M15 16V13C15 11.3 16.3 10 18 10H26C27.7 10 29 11.3 29 13V16" stroke="#CF095E" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="6" y1="26" x2="38" y2="26" stroke="white" strokeWidth="2" strokeOpacity="0.5"/>
              <circle cx="22" cy="26" r="3" fill="#CF095E"/>
            </svg>
          </div>

          {/* Texto */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-charcoal leading-tight">
              Instala VistaSatPRO
            </p>
            <p className="text-xs text-mid-grey mt-0.5 leading-snug">
              Acceso rápido sin navegador · Funciona offline · Notificaciones push
            </p>
          </div>

          {/* Cerrar */}
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 p-1 text-mid-grey hover:text-charcoal transition-colors"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Botones */}
        <div className="px-4 pb-4 flex gap-2">
          <button
            onClick={handleDismiss}
            className="flex-1 py-2.5 px-4 text-sm font-semibold text-mid-grey border border-border hover:bg-off-white transition-colors"
          >
            Ahora no
          </button>
          <button
            onClick={handleInstall}
            className="flex-1 py-2.5 px-4 text-sm font-bold text-white bg-navy hover:bg-navy-dark transition-colors flex items-center justify-center gap-2"
          >
            <Download size={16} />
            Instalar
          </button>
        </div>
      </div>
    </div>
  );
}
