import { getSlaStatus } from '@/lib/sla';
import {
  normalizeTaskStatus,
  resolveTaskType,
  TASK_TYPE_META,
  type Task,
  type TaskPriority,
  type TaskType,
} from '@/types/database';

export type DashboardKpiFilter =
  | 'pending'
  | 'in_progress'
  | 'urgent_high'
  | 'sla_risk'
  | 'completed';

export interface TaskTypeResolutionStat {
  taskType: TaskType;
  label: string;
  shortLabel: string;
  count: number;
  avgHours: number | null;
  formatted: string;
  color: string;
}

export interface DashboardMetrics {
  total: number;
  activeCount: number;
  pendingCount: number;
  inProgressCount: number;
  urgentHighCount: number;
  overdueCount: number;
  dueTodayCount: number;
  slaRiskCount: number;
  slaOnTrackPct: number | null;
  completedCount: number;
  closeRate: number;
  avgHours: number | null;
  avgHoursFormatted: string;
  unassignedCount: number;
  scheduledInstallationsCount: number;
  unscheduledInstallationsCount: number;
}

export const PRIORITY_SORT_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

const TASK_TYPE_STAT_COLORS: Record<TaskType, string> = {
  installation: '#004876',
  rma_incident: '#002169',
  cxc_incident: '#CF095E',
  task: '#5E3654',
};

/**
 * Formatea una duración en horas a una cadena compacta y legible (min, h, o d h).
 */
export function formatDurationHours(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return 'Sin cierres';
  if (hours < 1) {
    return `${Math.max(1, Math.round(hours * 60))} min`;
  }
  if (hours < 24) {
    return `${hours.toFixed(1)} h`;
  }
  const days = Math.floor(hours / 24);
  const remHours = Math.round(hours % 24);
  if (remHours === 0 || remHours === 24) {
    const finalDays = remHours === 24 ? days + 1 : days;
    return `${finalDays}d`;
  }
  return `${days}d ${remHours}h`;
}

/**
 * Devuelve una etiqueta legible de antigüedad desde una fecha ISO.
 */
export function formatRelativeAge(isoDate: string, now = new Date()): string {
  const created = new Date(isoDate);
  if (Number.isNaN(created.getTime())) return '—';

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfCreated = new Date(
    created.getFullYear(),
    created.getMonth(),
    created.getDate()
  ).getTime();
  const diffDays = Math.round((startOfToday - startOfCreated) / 86_400_000);

  if (diffDays <= 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  return `Hace ${diffDays} días`;
}

/**
 * Genera etiqueta y estilo temporal para la fecha acordada de una instalación.
 */
export function getScheduledDateTag(
  isoDate: string,
  now = new Date()
): { label: string; badgeClass: string; isPast: boolean } {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) {
    return {
      label: 'Sin fecha',
      badgeClass: 'bg-mid-grey/15 text-dark-grey',
      isPast: false,
    };
  }

  if (d.getTime() < now.getTime()) {
    return {
      label: 'Fecha pasada',
      badgeClass: 'bg-danger/15 text-danger',
      isPast: true,
    };
  }

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfTarget - startOfToday) / 86_400_000);

  if (diffDays === 0) {
    return {
      label: 'Hoy',
      badgeClass: 'bg-magenta/15 text-magenta',
      isPast: false,
    };
  }
  if (diffDays === 1) {
    return {
      label: 'Mañana',
      badgeClass:
        'bg-amber-100 text-amber-800',
      isPast: false,
    };
  }

  return {
    label: d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
    badgeClass: 'bg-petrol/15 text-petrol',
    isPast: false,
  };
}

export function isOpenTask(task: Task): boolean {
  const st = normalizeTaskStatus(task.status);
  return st !== 'completed' && st !== 'cancelled';
}

/**
 * Ordena partes aún no cerrados estrictamente por prioridad (Urgente → Baja)
 * y a igualdad de prioridad por fecha de apertura más antigua primero.
 */
export function sortOpenTasksByPriorityAndAge(tasks: Task[]): Task[] {
  return tasks
    .filter(isOpenTask)
    .sort((a, b) => {
      const pDiff = PRIORITY_SORT_ORDER[a.priority] - PRIORITY_SORT_ORDER[b.priority];
      if (pDiff !== 0) return pDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
}

/**
 * Instalaciones abiertas con fecha acordada asignada, ordenadas por la más próxima a ejecutarse.
 */
export function getScheduledInstallations(tasks: Task[]): Task[] {
  return tasks
    .filter(
      (t) =>
        isOpenTask(t) &&
        resolveTaskType(t) === 'installation' &&
        Boolean(t.scheduled_date)
    )
    .sort(
      (a, b) =>
        new Date(a.scheduled_date!).getTime() - new Date(b.scheduled_date!).getTime()
    );
}

/**
 * Instalaciones abiertas sin fecha acordada, ordenadas de más antigua a más nueva según apertura.
 */
export function getUnscheduledInstallations(tasks: Task[]): Task[] {
  return tasks
    .filter(
      (t) =>
        isOpenTask(t) &&
        resolveTaskType(t) === 'installation' &&
        !t.scheduled_date
    )
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
}

/**
 * Filtra y ordena los partes correspondientes al KPI seleccionado en el dashboard.
 */
export function filterTasksByKpi(tasks: Task[], kpi: DashboardKpiFilter): Task[] {
  if (kpi === 'pending') {
    return sortOpenTasksByPriorityAndAge(
      tasks.filter((t) => normalizeTaskStatus(t.status) === 'pending')
    );
  }
  if (kpi === 'in_progress') {
    return sortOpenTasksByPriorityAndAge(
      tasks.filter((t) => normalizeTaskStatus(t.status) === 'in_progress')
    );
  }
  if (kpi === 'urgent_high') {
    return sortOpenTasksByPriorityAndAge(
      tasks.filter(
        (t) => isOpenTask(t) && (t.priority === 'urgent' || t.priority === 'high')
      )
    );
  }
  if (kpi === 'sla_risk') {
    return tasks
      .filter((t) => {
        if (!isOpenTask(t)) return false;
        const state = getSlaStatus(t)?.state;
        return state === 'overdue' || state === 'due_today';
      })
      .sort((a, b) => {
        const aOver = getSlaStatus(a)?.state === 'overdue' ? 0 : 1;
        const bOver = getSlaStatus(b)?.state === 'overdue' ? 0 : 1;
        if (aOver !== bOver) return aOver - bOver;
        return (
          new Date(a.due_date || a.created_at).getTime() -
          new Date(b.due_date || b.created_at).getTime()
        );
      });
  }
  return tasks
    .filter((t) => normalizeTaskStatus(t.status) === 'completed')
    .sort(
      (a, b) =>
        new Date(b.completed_at || b.updated_at).getTime() -
        new Date(a.completed_at || a.updated_at).getTime()
    );
}

/**
 * Calcula todos los KPIs del conjunto de partes recibido (global para admin o propio para técnico).
 */
export function computeDashboardMetrics(tasks: Task[]): DashboardMetrics {
  const active = tasks.filter(isOpenTask);
  const pendingList = tasks.filter((t) => normalizeTaskStatus(t.status) === 'pending');
  const inProgress = tasks.filter(
    (t) => normalizeTaskStatus(t.status) === 'in_progress'
  );
  const urgentHigh = active.filter(
    (t) => t.priority === 'urgent' || t.priority === 'high'
  );

  let overdueCount = 0;
  let dueTodayCount = 0;
  let withDueDateActive = 0;
  for (const t of active) {
    const sla = getSlaStatus(t);
    if (sla) {
      withDueDateActive++;
      if (sla.state === 'overdue') overdueCount++;
      else if (sla.state === 'due_today') dueTodayCount++;
    }
  }

  const slaRiskCount = overdueCount + dueTodayCount;
  const slaOnTrackPct =
    withDueDateActive > 0
      ? Math.round(((withDueDateActive - overdueCount) / withDueDateActive) * 100)
      : null;

  const completed = tasks.filter((t) => normalizeTaskStatus(t.status) === 'completed');
  const resolvedDurations = completed
    .filter((t) => Boolean(t.completed_at))
    .map((t) =>
      Math.max(
        0.05,
        (new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime()) / 3_600_000
      )
    );

  const avgHours =
    resolvedDurations.length > 0
      ? Number(
          (
            resolvedDurations.reduce((a, b) => a + b, 0) / resolvedDurations.length
          ).toFixed(1)
        )
      : null;

  const closeRate =
    tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0;

  const unassignedCount = active.filter(
    (t) => !t.assigned_to && normalizeTaskStatus(t.status) === 'pending'
  ).length;
  const scheduledInstallationsCount = getScheduledInstallations(tasks).length;
  const unscheduledInstallationsCount = getUnscheduledInstallations(tasks).length;

  return {
    total: tasks.length,
    activeCount: active.length,
    pendingCount: pendingList.length,
    inProgressCount: inProgress.length,
    urgentHighCount: urgentHigh.length,
    overdueCount,
    dueTodayCount,
    slaRiskCount,
    slaOnTrackPct,
    completedCount: completed.length,
    closeRate,
    avgHours,
    avgHoursFormatted: formatDurationHours(avgHours),
    unassignedCount,
    scheduledInstallationsCount,
    unscheduledInstallationsCount,
  };
}

/**
 * Calcula el tiempo medio de cierre (en horas) diferenciando cada tipo de parte:
 * Instalación, Incidencia RMA, Incidencia CXC y Tarea.
 */
export function computeResolutionStatsByType(tasks: Task[]): {
  global: { count: number; avgHours: number | null; formatted: string };
  byType: TaskTypeResolutionStat[];
} {
  const orderedTypes: TaskType[] = [
    'installation',
    'rma_incident',
    'cxc_incident',
    'task',
  ];

  const allCompletedDurations: number[] = [];

  const byType: TaskTypeResolutionStat[] = orderedTypes.map((taskType) => {
    const meta = TASK_TYPE_META[taskType];
    const matching = tasks.filter(
      (t) =>
        t.status === 'completed' &&
        Boolean(t.completed_at) &&
        resolveTaskType(t) === taskType
    );

    const durations = matching.map((t) => {
      const hours = Math.max(
        0.05,
        (new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime()) /
          3_600_000
      );
      allCompletedDurations.push(hours);
      return hours;
    });

    const avgHours =
      durations.length > 0
        ? Number((durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1))
        : null;

    return {
      taskType,
      label: meta.label,
      shortLabel: meta.shortLabel,
      count: durations.length,
      avgHours,
      formatted: formatDurationHours(avgHours),
      color: TASK_TYPE_STAT_COLORS[taskType],
    };
  });

  const globalAvgHours =
    allCompletedDurations.length > 0
      ? Number(
          (
            allCompletedDurations.reduce((a, b) => a + b, 0) /
            allCompletedDurations.length
          ).toFixed(1)
        )
      : null;

  return {
    global: {
      count: allCompletedDurations.length,
      avgHours: globalAvgHours,
      formatted: formatDurationHours(globalAvgHours),
    },
    byType,
  };
}
