'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, CheckCheck, ChevronRight, Settings } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';

export default function NotificationsPage() {
  return (
    <AppShell>
      <NotificationsContent />
    </AppShell>
  );
}

function NotificationsContent() {
  const { profile } = useAuth();
  const router = useRouter();
  const { notifications, unreadCount, isLoading, markRead, markAllRead } =
    useNotifications();

  if (!profile) return null;

  const handleOpenNotification = async (id: string, taskId: string | null) => {
    await markRead(id);
    if (taskId) {
      router.push(`/tasks/${taskId}`);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-charcoal flex items-center gap-2">
            <Bell size={22} className="text-magenta" /> Centro de Notificaciones
          </h1>
          <p className="text-xs text-mid-grey mt-0.5">
            {unreadCount > 0
              ? `Tienes ${unreadCount} ${
                  unreadCount === 1 ? 'notificación' : 'notificaciones'
                } sin leer`
              : 'Estás al día — sin avisos pendientes'}
          </p>
        </div>

        <div className="flex gap-2">
          {unreadCount > 0 && (
            <Button variant="secondary" size="sm" onClick={markAllRead}>
              <CheckCheck size={15} /> Marcar todas leídas
            </Button>
          )}
          <Link href="/profile">
            <Button variant="ghost" size="sm">
              <Settings size={15} /> Ajustes Push
            </Button>
          </Link>
        </div>
      </div>

      {/* Nota informativa sobre el filtro anti-ruido */}
      <div className="p-3 bg-navy/5 border-l-4 border-navy text-xs text-dark-grey">
        Solo recibes avisos de nuevas asignaciones o cambios realizados por{' '}
        <strong>otros usuarios</strong> (las acciones propias nunca generan autonotificación).
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-white rounded-md animate-pulse shadow-card" />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-md p-10 text-center shadow-card">
          <Bell size={36} className="text-light-grey mx-auto mb-3" />
          <p className="font-bold text-charcoal">Sin notificaciones todavía</p>
          <p className="text-sm text-mid-grey mt-1">
            Aquí aparecerán las asignaciones y actualizaciones de tus partes.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {notifications.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleOpenNotification(n.id, n.task_id)}
              className={`w-full text-left bg-white rounded-md shadow-card p-4 border-l-4 transition-colors hover:bg-off-white/60 flex items-start justify-between gap-3 ${
                n.is_read ? 'border-border opacity-80' : 'border-magenta'
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {!n.is_read && (
                    <span className="w-2 h-2 rounded-full bg-magenta flex-shrink-0" />
                  )}
                  <h3 className="text-sm font-bold text-charcoal truncate">{n.title}</h3>
                </div>
                <p className="text-xs text-dark-grey mt-1 leading-relaxed">{n.body}</p>
                <p className="text-[11px] text-mid-grey mt-2">
                  {new Date(n.created_at).toLocaleString('es-ES')}
                  {n.actor ? ` · Por ${n.actor.full_name}` : ''}
                </p>
              </div>
              {n.task_id && <ChevronRight size={18} className="text-navy flex-shrink-0 mt-1" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
