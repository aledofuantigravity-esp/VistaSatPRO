'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Bell, X } from 'lucide-react';
import type { AppNotification } from '@/types/database';

export function NotificationToast({
  notification,
  onDismiss,
}: {
  notification: AppNotification | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!notification) return;
    const t = setTimeout(onDismiss, 5000);
    return () => clearTimeout(t);
  }, [notification, onDismiss]);

  if (!notification) return null;

  return (
    <div
      className="fixed bottom-20 lg:bottom-6 right-4 left-4 lg:left-auto lg:w-96 z-50 toast-enter"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="bg-navy text-white rounded-md shadow-elevated border-l-4 border-magenta p-4 flex items-start gap-3">
        <Bell size={18} className="text-magenta flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold leading-tight">{notification.title}</p>
          <p className="text-xs text-white/80 mt-1 line-clamp-2">{notification.body}</p>
          {notification.task_id && (
            <Link
              href={`/tasks/${notification.task_id}`}
              onClick={onDismiss}
              className="inline-block mt-2 text-xs font-bold text-magenta uppercase tracking-wider hover:underline"
            >
              Ver parte →
            </Link>
          )}
        </div>
        <button
          onClick={onDismiss}
          className="text-white/70 hover:text-white p-1"
          aria-label="Cerrar notificación"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
