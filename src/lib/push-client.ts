import { isSupabaseConfigured, isVapidConfigured } from './supabase/config';

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

async function resolveVapidPublicKey(): Promise<string | null> {
  if (isVapidConfigured() && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()) {
    return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.trim();
  }
  if (!isSupabaseConfigured()) {
    try {
      const res = await fetch('/api/demo?resource=vapid_public_key', { cache: 'no-store' });
      const data = (await res.json()) as { publicKey?: string };
      return data.publicKey || null;
    } catch {
      return null;
    }
  }
  return null;
}

export function detectDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Dispositivo web';
  const ua = navigator.userAgent;
  const os = /iPhone|iPad|iPod/.test(ua)
    ? 'iOS'
    : /Android/i.test(ua)
    ? 'Android'
    : /Windows/i.test(ua)
    ? 'Windows'
    : /Mac OS X|Macintosh/i.test(ua)
    ? 'macOS'
    : /Linux/i.test(ua)
    ? 'Linux'
    : 'Dispositivo';
  const browser = /Edg\//i.test(ua)
    ? 'Edge'
    : /Chrome\//i.test(ua) && !/Edg\//i.test(ua)
    ? 'Chrome'
    : /Firefox\//i.test(ua)
    ? 'Firefox'
    : /Safari\//i.test(ua) && !/Chrome\//i.test(ua)
    ? 'Safari'
    : 'Navegador';
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true);
  return `${os} · ${browser}${isStandalone ? ' (PWA)' : ''}`;
}

function uint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function subscriptionMatchesVapidKey(
  subscription: PushSubscription,
  vapidPublicKey: string
): boolean {
  const existingKeyBuffer = subscription.options?.applicationServerKey;
  if (!existingKeyBuffer) return false;
  const existingBytes = new Uint8Array(existingKeyBuffer);
  const expectedBytes = urlBase64ToUint8Array(vapidPublicKey);
  return uint8ArraysEqual(existingBytes, expectedBytes);
}

export async function getCurrentDevicePushEndpoint(): Promise<string | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!reg || !reg.pushManager) return null;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return null;
    const vapidKey = await resolveVapidPublicKey();
    if (vapidKey && !subscriptionMatchesVapidKey(sub, vapidKey)) {
      return null;
    }
    return sub.endpoint || null;
  } catch {
    return null;
  }
}

export async function subscribeToBrowserPush(options?: {
  forceResubscribe?: boolean;
}): Promise<{
  endpoint: string;
  p256dh: string;
  auth: string;
}> {
  const status = getPushSupportStatus();
  if (status === 'ios_requires_install') {
    throw new Error(
      'En iPhone/iPad primero debes añadir VistaSatPRO a la pantalla de inicio (Compartir → Añadir a pantalla de inicio) y abrirla desde el icono.'
    );
  }
  if (status !== 'supported') {
    throw new Error(
      'Este navegador no soporta notificaciones Push en segundo plano. Usa Chrome, Edge, Firefox o Safari PWA.'
    );
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      'Permiso de notificaciones denegado. Habilita las notificaciones para VistaSatPRO en los ajustes del navegador o del móvil.'
    );
  }

  const vapidPublicKey = await resolveVapidPublicKey();
  if (!vapidPublicKey) {
    if (!isSupabaseConfigured()) {
      return {
        endpoint: `local-demo://device/${navigator.userAgent.slice(0, 24)}/${Date.now()}`,
        p256dh: 'demo-p256dh-key',
        auth: 'demo-auth-secret',
      };
    }
    throw new Error(
      'Falta configurar la clave pública VAPID (NEXT_PUBLIC_VAPID_PUBLIC_KEY) en el servidor para enviar notificaciones Push con la app cerrada.'
    );
  }

  try {
    let registration = await navigator.serviceWorker.getRegistration('/sw.js');
    if (!registration) {
      registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    }
    registration = await navigator.serviceWorker.ready;

    let subscription = await registration.pushManager.getSubscription();
    const keyMismatch =
      Boolean(subscription) && !subscriptionMatchesVapidKey(subscription!, vapidPublicKey);
    if (subscription && (options?.forceResubscribe || keyMismatch)) {
      try {
        await subscription.unsubscribe();
      } catch {
        // Ignorar si ya había caducado
      }
      subscription = null;
    }

    if (!subscription) {
      const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey.buffer as ArrayBuffer,
      });
    }

    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      throw new Error('El navegador no devolvió las claves de suscripción Push.');
    }

    return {
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    };
  } catch (err) {
    if (!isSupabaseConfigured()) {
      return {
        endpoint: `local-demo://device/${navigator.userAgent.slice(0, 24)}/${Date.now()}`,
        p256dh: 'demo-p256dh-key',
        auth: 'demo-auth-secret',
      };
    }
    throw new Error(
      err instanceof Error
        ? err.message
        : 'No se pudo suscribir este dispositivo al servicio Push del navegador.'
    );
  }
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
        badge: '/icons/badge-72.png?v=2',
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
