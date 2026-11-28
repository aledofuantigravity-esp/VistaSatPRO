import type { NotificationType } from '@/types/database';

export interface NotificationTypeVisualMeta {
  label: string;
  badgeClass: string;
  iconBgClass: string;
  iconTextClass: string;
}

export const NOTIFICATION_TYPE_META: Record<NotificationType, NotificationTypeVisualMeta> = {
  task_created: {
    label: 'Nuevo parte',
    badgeClass: 'bg-petrol/10 text-petrol border border-petrol/20',
    iconBgClass: 'bg-petrol/10',
    iconTextClass: 'text-petrol',
  },
  task_assigned: {
    label: 'Asignación',
    badgeClass: 'bg-navy/10 text-navy border border-navy/20',
    iconBgClass: 'bg-navy/10',
    iconTextClass: 'text-navy',
  },
  reassigned: {
    label: 'Reasignación',
    badgeClass: 'bg-navy/10 text-navy border border-navy/20',
    iconBgClass: 'bg-navy/10',
    iconTextClass: 'text-navy',
  },
  comment_added: {
    label: 'Comentario / Nota',
    badgeClass: 'bg-info/15 text-petrol border border-info/30',
    iconBgClass: 'bg-info/15',
    iconTextClass: 'text-petrol',
  },
  status_changed: {
    label: 'Estado',
    badgeClass: 'bg-success/10 text-success border border-success/25',
    iconBgClass: 'bg-success/10',
    iconTextClass: 'text-success',
  },
  priority_changed: {
    label: 'Prioridad',
    badgeClass: 'bg-warning/15 text-amber-800 border border-warning/35',
    iconBgClass: 'bg-warning/15',
    iconTextClass: 'text-amber-700',
  },
  task_updated: {
    label: 'Actualización',
    badgeClass: 'bg-off-white text-dark-grey border border-border',
    iconBgClass: 'bg-off-white border border-border',
    iconTextClass: 'text-navy',
  },
  sla_alert: {
    label: 'Alerta SLA',
    badgeClass: 'bg-danger/10 text-danger border border-danger/25',
    iconBgClass: 'bg-danger/10',
    iconTextClass: 'text-danger',
  },
};

/**
 * Formatea una fecha ISO como tiempo relativo compacto en español para tarjetas de avisos.
 */
export function formatRelativeNotificationTime(isoDate: string): string {
  const ts = Date.parse(isoDate);
  if (Number.isNaN(ts)) return '';

  const diffMs = Date.now() - ts;
  if (diffMs < 60_000) return 'Ahora mismo';

  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 60) return `Hace ${diffMin} min`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Hace ${diffHours} h`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;

  return new Date(ts).toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'short',
  });
}
