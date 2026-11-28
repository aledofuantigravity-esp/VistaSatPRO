'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCheck,
  ChevronRight,
  MessageSquare,
  PlusCircle,
  RefreshCw,
  Repeat,
  ShieldAlert,
  UserCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useNotifications } from '@/hooks/useNotifications';
import {
  formatRelativeNotificationTime,
  NOTIFICATION_TYPE_META,
} from '@/lib/notification-ui';
import type { NotificationType } from '@/types/database';

function renderNotificationTypeIcon(type: NotificationType) {
  switch (type) {
    case 'task_created':
      return <PlusCircle size={15} />;
    case 'task_assigned':
      return <UserCheck size={15} />;
    case 'reassigned':
      return <Repeat size={15} />;
    case 'comment_added':
      return <MessageSquare size={15} />;
    case 'status_changed':
      return <RefreshCw size={15} />;
    case 'priority_changed':
      return <AlertTriangle size={15} />;
    case 'sla_alert':
      return <ShieldAlert size={15} />;
    case 'task_updated':
    default:
      return <Bell size={15} />;
  }
}

export function DashboardNotificationsWidget({ isCoord }: { isCoord: boolean }) {
  const router = useRouter();
  const { notifications, unreadCount, isLoading, markRead, markAllRead } =
    useNotifications();

  if (isLoading && notifications.length === 0) {
    return (
      <div className="h-16 bg-white rounded-md animate-pulse shadow-card border border-border/50" />
    );
  }

  const prioritizedNotifications = [...notifications]
    .sort((a, b) => {
      if (a.is_read !== b.is_read) return a.is_read ? 1 : -1;
      return b.created_at.localeCompare(a.created_at);
    })
    .slice(0, 4);

  const handleOpenItem = async (id: string, taskId: string | null) => {
    await markRead(id);
    if (taskId) {
      router.push(`/tasks/${taskId}`);
    }
  };

  if (unreadCount === 0) {
    const latest = notifications[0];
    return (
      <section
        aria-label="Centro de Notificaciones"
        className="bg-white rounded-md shadow-card border border-border/60 border-l-4 border-l-navy px-4 py-3 flex flex-wrap items-center justify-between gap-3 min-w-0"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-navy/10 text-navy flex items-center justify-center flex-shrink-0">
            <Bell size={17} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-navy">
                Notificaciones al día
              </h2>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-success/10 text-success">
                0 sin leer
              </span>
            </div>
            <p className="text-xs text-mid-grey truncate mt-0.5">
              {latest
                ? `Último aviso: ${latest.title} · ${formatRelativeNotificationTime(
                    latest.created_at
                  )}`
                : isCoord
                ? 'Sin avisos pendientes en el centro de control.'
                : 'Sin avisos pendientes. Aquí verás tus nuevas asignaciones y actualizaciones.'}
            </p>
          </div>
        </div>

        <Link
          href="/notifications"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-navy hover:text-magenta transition-colors flex-shrink-0"
        >
          Ver centro <ArrowRight size={14} />
        </Link>
      </section>
    );
  }

  return (
    <section
      aria-label="Centro de Notificaciones"
      className="bg-white rounded-md shadow-card border border-magenta/35 border-l-4 border-l-magenta overflow-hidden min-w-0"
    >
      <div className="bg-gradient-to-r from-magenta/[0.09] via-navy/[0.04] to-white px-4 py-3 border-b border-border/60 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-9 h-9 rounded-full bg-magenta text-white flex items-center justify-center flex-shrink-0">
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full bg-magenta opacity-60 animate-ping pointer-events-none"
            />
            <Bell size={18} className="relative notif-bell-ring" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-extrabold uppercase tracking-wider text-charcoal">
                Centro de Notificaciones
              </h2>
              <span className="relative inline-flex items-center">
                <span className="bg-magenta text-white text-[11px] font-extrabold px-2 py-0.5 rounded-full notif-badge-glow">
                  {unreadCount} sin leer
                </span>
              </span>
            </div>
            <p className="text-xs text-dark-grey mt-0.5">
              {isCoord
                ? 'Avisos destacados de actividad del equipo y alertas operativas.'
                : 'Avisos prioritarios sobre tus partes asignados y cambios recientes.'}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => void markAllRead()}
          >
            <CheckCheck size={14} /> Marcar todas leídas
          </Button>
          <Link
            href="/notifications"
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-navy text-white text-xs font-bold uppercase tracking-wider hover:bg-navy-dark rounded-xs transition-colors"
          >
            Ver todas <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 p-3.5 sm:p-4">
        {prioritizedNotifications.map((n) => {
          const meta =
            NOTIFICATION_TYPE_META[n.type] || NOTIFICATION_TYPE_META.task_updated;
          const relativeTime = formatRelativeNotificationTime(n.created_at);

          return (
            <button
              key={n.id}
              type="button"
              onClick={() => void handleOpenItem(n.id, n.task_id)}
              className={`text-left rounded-sm border p-3 transition-all flex items-start gap-2.5 min-w-0 cursor-pointer ${
                n.is_read
                  ? 'bg-off-white/60 border-border hover:border-navy/40 opacity-85'
                  : 'bg-magenta/[0.03] border-magenta/35 hover:border-magenta shadow-xs'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${meta.iconBgClass} ${meta.iconTextClass}`}
              >
                {renderNotificationTypeIcon(n.type)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-xs ${meta.badgeClass}`}
                  >
                    {meta.label}
                  </span>
                  {!n.is_read && (
                    <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-xs bg-magenta text-white">
                      Nueva
                    </span>
                  )}
                  {relativeTime && (
                    <span className="text-[11px] text-mid-grey ml-auto">
                      {relativeTime}
                    </span>
                  )}
                </div>
                <p className="text-xs sm:text-sm font-bold text-charcoal truncate mt-1">
                  {n.title}
                </p>
                <p className="text-xs text-dark-grey line-clamp-2 mt-0.5 leading-snug">
                  {n.body}
                </p>
                {n.actor && (
                  <p className="text-[11px] text-mid-grey mt-1 truncate">
                    Por {n.actor.full_name}
                  </p>
                )}
              </div>

              {n.task_id && (
                <ChevronRight
                  size={16}
                  className="text-navy flex-shrink-0 self-center"
                />
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
