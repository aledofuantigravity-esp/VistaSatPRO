'use client';

import { useState, useEffect } from 'react';
import { X, Share, PlusSquare } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';

/**
 * InstallGuideSheet — iOS / Safari
 * Muestra instrucciones visuales para añadir a pantalla de inicio en iOS.
 * Prerrequisito para habilitar Web Push en Safari 16.4+.
 */
export function InstallGuideSheet() {
  const { isIOSBrowser, isInstalled } = usePWAInstall();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!isIOSBrowser || isInstalled) return;

    // Comprobar si ya se descartó (no molestar más de 1 vez/semana)
    const dismissed = localStorage.getItem('vistasat-ios-guide-dismissed');
    if (dismissed) {
      const daysSince = (Date.now() - parseInt(dismissed)) / (1000 * 60 * 60 * 24);
      if (daysSince < 7) return;
    }

    // Mostrar con delay de 3s para no interrumpir la carga inicial
    const timer = setTimeout(() => setIsVisible(true), 3000);
    return () => clearTimeout(timer);
  }, [isIOSBrowser, isInstalled]);

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('vistasat-ios-guide-dismissed', Date.now().toString());
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Overlay semitransparente */}
      <div
        className="fixed inset-0 z-40 bg-charcoal/60 backdrop-blur-sm"
        onClick={handleDismiss}
      />

      {/* Sheet inferior */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-lg shadow-elevated animate-slide-up"
        style={{ paddingBottom: 'max(var(--safe-bottom), 24px)' }}
      >
        {/* Handle drag */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-border rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            {/* Mini logo */}
            <div className="w-8 h-8 bg-navy rounded flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 44 44" fill="none">
                <rect x="6" y="16" width="32" height="22" rx="3" stroke="white" strokeWidth="3"/>
                <path d="M15 16V13C15 11.3 16.3 10 18 10H26C27.7 10 29 11.3 29 13V16" stroke="#CF095E" strokeWidth="3" strokeLinecap="round"/>
                <circle cx="22" cy="26" r="3" fill="#CF095E"/>
              </svg>
            </div>
            <span className="text-md font-bold text-charcoal">Instala VistaSatPRO</span>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1 text-mid-grey"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        {/* Contenido de instrucciones */}
        <div className="px-5 py-5">
          <p className="text-sm text-dark-grey mb-5 leading-relaxed">
            Añade VistaSatPRO a tu pantalla de inicio para acceder más rápido
            y recibir notificaciones en tiempo real.
          </p>

          {/* Paso 1 */}
          <div className="flex items-start gap-4 mb-5">
            <div className="flex-shrink-0 w-9 h-9 bg-navy rounded-full flex items-center justify-center">
              <span className="text-sm font-bold text-white">1</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-charcoal">
                Toca el botón Compartir
              </p>
              <div className="mt-1.5 inline-flex items-center gap-1.5 bg-off-white border border-border rounded-sm px-2.5 py-1.5">
                <Share size={15} className="text-navy" />
                <span className="text-xs text-dark-grey font-medium">
                  barra inferior de Safari
                </span>
              </div>
            </div>
          </div>

          {/* Paso 2 */}
          <div className="flex items-start gap-4 mb-5">
            <div className="flex-shrink-0 w-9 h-9 bg-navy rounded-full flex items-center justify-center">
              <span className="text-sm font-bold text-white">2</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-charcoal">
                Pulsa &ldquo;Añadir a pantalla de inicio&rdquo;
              </p>
              <div className="mt-1.5 inline-flex items-center gap-1.5 bg-off-white border border-border rounded-sm px-2.5 py-1.5">
                <PlusSquare size={15} className="text-navy" />
                <span className="text-xs text-dark-grey font-medium">
                  desplázate en el menú de Safari
                </span>
              </div>
            </div>
          </div>

          {/* Paso 3 */}
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 w-9 h-9 bg-navy rounded-full flex items-center justify-center">
              <span className="text-sm font-bold text-white">3</span>
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-charcoal">
                Toca &ldquo;Añadir&rdquo; en la esquina superior derecha
              </p>
              <p className="text-xs text-mid-grey mt-1">
                La app aparecerá en tu pantalla de inicio como una app nativa.
              </p>
            </div>
          </div>
        </div>

        {/* Nota sobre notificaciones */}
        <div className="mx-5 mb-4 p-3 bg-navy/5 border-l-4 border-navy rounded-r-sm">
          <p className="text-xs text-dark-grey leading-relaxed">
            <strong className="text-navy">¿Por qué instalarlo?</strong>{' '}
            Las notificaciones push en iPhone solo funcionan desde la app instalada en la pantalla de inicio.
          </p>
        </div>

        {/* Botón cerrar */}
        <div className="px-5">
          <button
            onClick={handleDismiss}
            className="w-full py-3 text-sm font-semibold text-mid-grey border border-border hover:bg-off-white transition-colors"
          >
            Ahora no
          </button>
        </div>
      </div>
    </>
  );
}
