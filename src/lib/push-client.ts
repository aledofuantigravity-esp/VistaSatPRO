import { isVapidConfigured } from './supabase/config';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushSupportStatus = 'supported' | 'unsupported' | 'ios_requires_install';

export function getPushSupportStatus(): PushSupportStatus {
  if (typeof window === 'undefined') return 'unsupported';

  const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (isIOS && !isStandalone) {
    return 'ios_requires_install';
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }

  return 'supported';
}

export async function subscribeToBrowserPush(): Promise<{
  endpoint: string;
  p256dh: string;
  auth: string;
} | null> {
  const status = getPushSupportStatus();
  if (status !== 'supported') return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  // Si no hay VAPID real configurado aún (entorno demo local), devolvemos suscripción simulada local
  if (!isVapidConfigured()) {
    return {
      endpoint: `local-demo://device/${navigator.userAgent.slice(0, 24)}/${Date.now()}`,
      p256dh: 'demo-p256dh-key',
      auth: 'demo-auth-secret',
    };
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    const applicationServerKey = urlBase64ToUint8Array(
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!
    );
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    return null;
  }

  return {
    endpoint: json.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
  };
}

export async function showLocalBrowserNotification(title: string, body: string, taskId?: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, {
        body,
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-72.png',
        tag: taskId ? `task-${taskId}` : `vistasat-${Date.now()}`,
        data: { taskId, url: taskId ? `/tasks/${taskId}` : '/dashboard' },
      });
      return;
    } catch {
      // Fallback a Notification API estándar
    }
  }

  new Notification(title, { body, icon: '/icons/icon-192.png' });
}
