'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/data-service';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { AppNotification } from '@/types/database';

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [latestToast, setLatestToast] = useState<AppNotification | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const seenIdsRef = useRef<Set<string>>(new Set());

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

  // Suscripción en tiempo real (Supabase Realtime o eventos locales Demo)
  useEffect(() => {
    if (!userId) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      const handleDemo = () => load();
      window.addEventListener('vistasat:demo-updated', handleDemo);
      return () => window.removeEventListener('vistasat:demo-updated', handleDemo);
    }

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${userId}`,
        },
        () => {
          load();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, load]);

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

  return {
    notifications,
    unreadCount,
    isLoading,
    latestToast,
    dismissToast: () => setLatestToast(null),
    markRead,
    markAllRead,
    reload: load,
  };
}
