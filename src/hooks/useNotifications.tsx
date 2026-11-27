'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/data-service';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { AppNotification } from '@/types/database';

interface NotificationsContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  latestToast: AppNotification | null;
  dismissToast: () => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  reload: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const { profile } = useAuth();
  const userId = profile?.id;
  const instanceId = useId();

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [latestToast, setLatestToast] = useState<AppNotification | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const hasInitializedRef = useRef(false);
  const revisionRef = useRef<number | null>(null);

  const load = useCallback(async (silent = false) => {
    await Promise.resolve();
    if (!userId) {
      setNotifications([]);
      return;
    }
    if (!silent) setIsLoading(true);
    try {
      const data = await listNotifications(userId);
      setNotifications(data);
      if (!hasInitializedRef.current) {
        hasInitializedRef.current = true;
        data.forEach((n) => seenIdsRef.current.add(n.id));
      } else {
        const newestUnread = data.find((n) => !n.is_read && !seenIdsRef.current.has(n.id));
        data.forEach((n) => seenIdsRef.current.add(n.id));
        if (newestUnread) {
          setLatestToast(newestUnread);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(
              new CustomEvent('vistasat:notification-received', { detail: newestUnread })
            );
          }
        }
      }
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    seenIdsRef.current.clear();
    hasInitializedRef.current = false;
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // Escuchar eventos PUSH_RECEIVED del Service Worker + refresco al volver a la app
  useEffect(() => {
    if (!userId || typeof window === 'undefined') return;

    const handleVisibleOrFocus = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void load(true);
      }
    };

    const handleSwMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PUSH_RECEIVED') {
        void load(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibleOrFocus);
    window.addEventListener('focus', handleVisibleOrFocus);
    window.addEventListener('online', handleVisibleOrFocus);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibleOrFocus);
      window.removeEventListener('focus', handleVisibleOrFocus);
      window.removeEventListener('online', handleVisibleOrFocus);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, [userId, load]);

  // Suscripción en tiempo real (Supabase Realtime + respaldo ligero o servidor simulado)
  useEffect(() => {
    if (!userId) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      const handleDemo = () => void load(true);
      window.addEventListener('vistasat:demo-updated', handleDemo);

      const interval = setInterval(async () => {
        if (document.visibilityState !== 'visible' || !navigator.onLine) return;
        try {
          const res = await fetch('/api/demo?resource=revision', { cache: 'no-store' });
          const data = (await res.json()) as { revision?: number };
          if (typeof data.revision === 'number') {
            if (revisionRef.current !== null && revisionRef.current !== data.revision) {
              revisionRef.current = data.revision;
              window.dispatchEvent(new CustomEvent('vistasat:demo-updated'));
            } else {
              revisionRef.current = data.revision;
            }
          }
        } catch {
          // Silencioso si no hay conexión momentánea
        }
      }, 4000);

      return () => {
        clearInterval(interval);
        window.removeEventListener('vistasat:demo-updated', handleDemo);
      };
    }

    const channelName = `notifications:${userId}:${instanceId}`;
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          void load(true);
        }
      )
      .subscribe();

    // Respaldo ligero cada 12s si la app está en primer plano (cubre desconexiones móviles de WebSocket)
    const fallbackInterval = setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        void load(true);
      }
    }, 12_000);

    return () => {
      clearInterval(fallbackInterval);
      void supabase.removeChannel(channel);
    };
  }, [userId, instanceId, load]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markRead = async (id: string) => {
    await markNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
      )
    );
  };

  const markAllRead = async () => {
    if (!userId) return;
    await markAllNotificationsRead(userId);
    const nowIso = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true, read_at: nowIso })));
  };

  return (
    <NotificationsContext.Provider
      value={{
        notifications,
        unreadCount,
        isLoading,
        latestToast,
        dismissToast: () => setLatestToast(null),
        markRead,
        markAllRead,
        reload: load,
      }}
    >
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) {
    throw new Error('useNotifications debe usarse dentro de NotificationsProvider');
  }
  return ctx;
}
