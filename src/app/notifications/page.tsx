'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  ChevronRight,
  MessageSquare,
  PlusCircle,
  RefreshCw,
  Repeat,
  Settings,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import {
  formatRelativeNotificationTime,
  NOTIFICATION_TYPE_META,
} from '@/lib/notification-ui';
import type { NotificationType } from '@/types/database';

function renderTypeIcon(type: NotificationType) {
  switch (type) {
    case 'task_created':
      return <PlusCircle size={17} />;
    case 'task_assigned':
      return <UserCheck size={17} />;
    case 'reassigned':
      return <Repeat size={17} />;
    case 'comment_added':
      return <MessageSquare size={17} />;
    case 'status_changed':
      return <RefreshCw size={17} />;
    case 'priority_changed':
      return <AlertTriangle size={17} />;
    case 'sla_alert':
      return <ShieldAlert size={17} />;
    case 'task_updated':
    default:
      return <Bell size={17} />;
  }
}

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
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  if (!profile) return null;

  const handleOpenNotification = async (id: string, taskId: string | null) => {
    await markRead(id);
    if (taskId) {
      router.push(`/tasks/${taskId}`);
    }
  };

  const visibleNotifications =
    filter === 'unread' ? notifications.filter((n) => !n.is_read) : notifications;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
      <div className="bg-gradient-to-r from-navy to-petrol text-white rounded-md shadow-card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={`relative w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 ${
              unreadCount > 0 ? 'bg-magenta text-white' : 'bg-white/15 text-white'
            }`}
          >
            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-magenta opacity-65 animate-ping pointer-events-none"
              />
            )}
            <Bell
              size={22}
              className={`relative ${unreadCount > 0 ? 'notif-bell-ring' : ''}`}
            />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold text-white leading-tight">
                Centro de Notificaciones
              </h1>
              {unreadCount > 0 ? (
                <span className="bg-magenta text-white text-xs font-extrabold px-2.5 py-0.5 rounded-full notif-badge-glow">
                  {unreadCount} sin leer
                </span>
              ) : (
                <span className="bg-white/15 text-white/90 text-xs font-bold px-2.5 py-0.5 rounded-full">
                  Al día
                </span>
              )}
            </div>
            <p className="text-xs text-white/80 mt-1">
              {unreadCount > 0
                ? `Tienes ${unreadCount} ${
                    unreadCount === 1 ? 'notificación pendiente' : 'notificaciones pendientes'
                  } de revisar`
                : 'Estás al día — sin avisos pendientes'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 flex-shrink-0">
          {unreadCount > 0 && (
            <Button
              variant="accent"
              size="sm"
              onClick={markAllRead}
            >
              <CheckCheck size={15} /> Marcar todas leídas
            </Button>
          )}
          <Link href="/profile">
            <Button
              variant="secondary"
              size="sm"
              className="border-white/50 text-white hover:bg-white/10"
            >
              <Settings size={15} /> Ajustes Push
            </Button>
          </Link>
        </div>
      </div>

      {/* Filtros locales visuales y nota informativa */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex bg-white border border-border rounded-sm p-1 gap-1 shadow-xs">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xs transition-colors ${
              filter === 'all'
                ? 'bg-navy text-white'
                : 'text-dark-grey hover:bg-off-white'
            }`}
          >
            Todas ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('unread')}
            className={`px-3 py-1.5 text-xs font-bold rounded-xs transition-colors flex items-center gap-1.5 ${
              filter === 'unread'
                ? 'bg-magenta text-white'
                : 'text-dark-grey hover:bg-off-white'
            }`}
          >
            <span>Sin leer</span>
            <span
              className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold ${
                filter === 'unread'
                  ? 'bg-white text-magenta'
                  : unreadCount > 0
                  ? 'bg-magenta text-white'
                  : 'bg-off-white text-mid-grey'
              }`}
            >
              {unreadCount}
            </span>
          </button>
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
      ) : visibleNotifications.length === 0 ? (
        <div className="bg-white rounded-md p-10 text-center shadow-card space-y-2">
          <Bell size={36} className="text-light-grey mx-auto mb-2" />
          <p className="font-bold text-charcoal">
            {filter === 'unread'
              ? 'No tienes notificaciones sin leer'
              : 'Sin notificaciones todavía'}
          </p>
          <p className="text-sm text-mid-grey">
            {filter === 'unread'
              ? 'Ya has revisado todos tus avisos pendientes.'
              : 'Aquí aparecerán las asignaciones y actualizaciones de tus partes.'}
          </p>
          {filter === 'unread' && notifications.length > 0 && (
            <div className="pt-2">
              <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>
                Ver todas ({notifications.length})
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-2.5">
          {visibleNotifications.map((n) => {
            const meta =
              NOTIFICATION_TYPE_META[n.type] || NOTIFICATION_TYPE_META.task_updated;
            const relative = formatRelativeNotificationTime(n.created_at);

            return (
              <button
                key={n.id}
                type="button"
                onClick={() => handleOpenNotification(n.id, n.task_id)}
                className={`w-full text-left rounded-md shadow-card p-4 border-l-4 transition-all flex items-start justify-between gap-3 cursor-pointer ${
                  n.is_read
                    ? 'bg-white border-border opacity-85 hover:opacity-100 hover:bg-off-white/60'
                    : 'bg-magenta/[0.03] border-magenta ring-1 ring-magenta/20 hover:bg-magenta/[0.06]'
                }`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${meta.iconBgClass} ${meta.iconTextClass}`}
                >
                  {renderTypeIcon(n.type)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-xs ${meta.badgeClass}`}
                    >
                      {meta.label}
                    </span>
                    {!n.is_read && (
                      <span className="inline-flex items-center gap-1 bg-magenta text-white text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-xs">
                        Nueva
                      </span>
                    )}
                    {relative && (
                      <span className="text-[11px] font-semibold text-navy ml-auto">
                        {relative}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-charcoal truncate mt-1">
                    {n.title}
                  </h3>
                  <p className="text-xs text-dark-grey mt-1 leading-relaxed">{n.body}</p>
                  <p className="text-[11px] text-mid-grey mt-2">
                    {new Date(n.created_at).toLocaleString('es-ES')}
                    {n.actor ? ` · Por ${n.actor.full_name}` : ''}
                  </p>
                </div>

                {n.task_id && (
                  <ChevronRight
                    size={18}
                    className="text-navy flex-shrink-0 self-center"
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
