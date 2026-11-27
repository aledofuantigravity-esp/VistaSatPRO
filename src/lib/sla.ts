import type { Task } from '@/types/database';

export type SlaState = 'overdue' | 'due_today' | 'upcoming';

export interface SlaInfo {
  state: SlaState;
  label: string;
  shortLabel: string;
  badgeClass: string;
  dueDateFormatted: string;
}

/**
 * Calcula el estado de SLA / vencimiento de un parte de trabajo.
 * Los partes completados o cancelados no generan alertas SLA.
 */
export function getSlaStatus(task: Pick<Task, 'due_date' | 'status'>): SlaInfo | null {
  if (!task.due_date || task.status === 'completed' || task.status === 'cancelled') {
    return null;
  }

  const due = new Date(task.due_date);
  if (Number.isNaN(due.getTime())) return null;

  const now = new Date();
  const formatted = due.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  if (due.getTime() < now.getTime()) {
    return {
      state: 'overdue',
      label: `VENCIDO (${formatted})`,
      shortLabel: 'VENCIDO',
      badgeClass:
        'bg-danger/15 text-danger border border-danger/40 dark:bg-danger/25 dark:text-red-300',
      dueDateFormatted: formatted,
    };
  }

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  if (due.getTime() <= endOfToday.getTime()) {
    return {
      state: 'due_today',
      label: `VENCE HOY (${due.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })})`,
      shortLabel: 'HOY',
      badgeClass:
        'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40',
      dueDateFormatted: formatted,
    };
  }

  return {
    state: 'upcoming',
    label: `Límite: ${formatted}`,
    shortLabel: due.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }),
    badgeClass:
      'bg-navy/10 text-navy border border-navy/20 dark:bg-white/10 dark:text-slate-200 dark:border-white/15',
    dueDateFormatted: formatted,
  };
}

/** Convierte ISO string a valor compatible con input `datetime-local`. */
export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
