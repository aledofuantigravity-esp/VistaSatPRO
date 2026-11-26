'use client';

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

interface UsePWAInstallReturn {
  isInstalled: boolean;
  isIOSBrowser: boolean;
  canInstall: boolean;
  triggerInstall: () => Promise<void>;
  installOutcome: 'accepted' | 'dismissed' | null;
}

const emptySubscribe = () => () => {};

function getInstalledSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function getIOSBrowserSnapshot(): boolean {
  if (typeof window === 'undefined') return false;
  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  return isIOS && !getInstalledSnapshot();
}

export function usePWAInstall(): UsePWAInstallReturn {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installedEvent, setInstalledEvent] = useState(false);
  const [installOutcome, setInstallOutcome] = useState<'accepted' | 'dismissed' | null>(null);

  const isStandalone = useSyncExternalStore(
    emptySubscribe,
    getInstalledSnapshot,
    () => false
  );
  const isIOSBrowser = useSyncExternalStore(
    emptySubscribe,
    getIOSBrowserSnapshot,
    () => false
  );

  const isInstalled = isStandalone || installedEvent;

  useEffect(() => {
    if (isInstalled) return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstalledEvent(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isInstalled]);

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
