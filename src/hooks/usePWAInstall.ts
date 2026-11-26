'use client';

import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

interface UsePWAInstallReturn {
  /** True si la app ya está en modo standalone (instalada) */
  isInstalled: boolean;
  /** True si es iOS/Safari y NO está en standalone */
  isIOSBrowser: boolean;
  /** True si hay prompt de instalación disponible (Android/Chrome/Edge) */
  canInstall: boolean;
  /** Lanzar el prompt nativo de instalación */
  triggerInstall: () => Promise<void>;
  /** Resultado de la última instalación */
  installOutcome: 'accepted' | 'dismissed' | null;
}

/**
 * Hook de instalación PWA.
 * Gestiona el flujo completo para Android/Chrome/Edge e iOS/Safari.
 */
export function usePWAInstall(): UsePWAInstallReturn {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOSBrowser, setIsIOSBrowser] = useState(false);
  const [installOutcome, setInstallOutcome] = useState<'accepted' | 'dismissed' | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Detectar si ya está en modo standalone
    const checkInstalled =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    setIsInstalled(checkInstalled);

    // Detectar iOS en navegador (no standalone)
    const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
    setIsIOSBrowser(isIOS && !checkInstalled);

    if (checkInstalled) return; // Ya instalada, no necesitamos el prompt

    // Escuchar el evento beforeinstallprompt (Android/Chrome/Edge)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault(); // Evitar el banner nativo automático
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    // Detectar instalación completada
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      console.log('[PWA] App instalada correctamente');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = useCallback(async () => {
    if (!deferredPrompt) return;

    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setInstallOutcome(outcome);

    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  return {
    isInstalled,
    isIOSBrowser,
    canInstall: !!deferredPrompt,
    triggerInstall,
    installOutcome,
  };
}
