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
  const revisionRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    await Promise.resolve();
    if (!userId) {
      setNotifications([]);
      return;
    }
    setIsLoading(true);
    try {
      const data = await listNotifications(userId);
      setNotifications(data);
      if (seenIdsRef.current.size === 0) {
        data.forEach((n) => seenIdsRef.current.add(n.id));
      } else {
        const newestUnread = data.find((n) => !n.is_read && !seenIdsRef.current.has(n.id));
        data.forEach((n) => seenIdsRef.current.add(n.id));
        if (newestUnread) {
          setLatestToast(newestUnread);
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    seenIdsRef.current.clear();
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // Suscripción en tiempo real (Supabase Realtime o polling ligero en servidor simulado)
  useEffect(() => {
    if (!userId) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      const handleDemo = () => void load();
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
          void load();
        }
      )
      .subscribe();

    return () => {
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
