'use client';

import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Wrench,
  X,
} from 'lucide-react';
import { TaskCard } from '@/components/ui/TaskCard';
import type { DashboardKpiFilter } from '@/lib/dashboard-helpers';
import type { Task } from '@/types/database';

interface KpiDrilldownPanelProps {
  activeKpi: DashboardKpiFilter;
  tasks: Task[];
  isCoord: boolean;
  onClose: () => void;
}

const KPI_META: Record<
  DashboardKpiFilter,
  {
    titleCoord: string;
    titleTech: string;
    subtitle: string;
    icon: React.ReactNode;
    accentClass: string;
  }
> = {
  pending: {
    titleCoord: 'Partes Pendientes / Asignados',
    titleTech: 'Mis Partes Pendientes / Asignados',
    subtitle: 'Partes abiertos pendientes de iniciar desplazamiento o intervención.',
    icon: <Clock size={18} className="text-petrol dark:text-sky-300" />,
    accentClass: 'border-petrol/40 dark:border-sky-400/40',
  },
  in_progress: {
    titleCoord: 'Partes En Curso / En Camino',
    titleTech: 'Mis Partes En Curso / En Camino',
    subtitle: 'Intervenciones activas actualmente en ruta o ejecución en cliente.',
    icon: <Wrench size={18} className="text-navy dark:text-sky-300" />,
    accentClass: 'border-navy/40 dark:border-sky-400/40',
  },
  urgent_high: {
    titleCoord: 'Partes Urgentes y Prioridad Alta',
    titleTech: 'Mis Partes Urgentes y Prioridad Alta',
    subtitle: 'Partes activos marcados con prioridad Urgente o Alta.',
    icon: <AlertTriangle size={18} className="text-magenta dark:text-pink-300" />,
    accentClass: 'border-magenta/40 dark:border-pink-400/40',
  },
  sla_risk: {
    titleCoord: 'Alertas SLA (Vencidos / Vencen Hoy)',
    titleTech: 'Mis Alertas SLA (Vencidos / Vencen Hoy)',
    subtitle: 'Partes con fecha límite vencida o que cumplen hoy.',
    icon: <ShieldAlert size={18} className="text-danger dark:text-red-300" />,
    accentClass: 'border-danger/40 dark:border-red-400/40',
  },
  completed: {
    titleCoord: 'Últimos Partes Completados',
    titleTech: 'Mis Últimos Partes Completados',
    subtitle: 'Partes cerrados ordenados del más reciente al más antiguo.',
    icon: <CheckCircle2 size={18} className="text-success dark:text-emerald-300" />,
    accentClass: 'border-success/40 dark:border-emerald-400/40',
  },
};

export function KpiDrilldownPanel({
  activeKpi,
  tasks,
  isCoord,
  onClose,
}: KpiDrilldownPanelProps) {
  const meta = KPI_META[activeKpi];
  const title = isCoord ? meta.titleCoord : meta.titleTech;
  const tasksHref = `/tasks?preset=${activeKpi}${isCoord ? '' : '&scope=mine'}`;
  const visibleTasks = tasks.slice(0, 8);

  return (
    <section
      aria-label={title}
      className={`bg-white dark:bg-surface rounded-md shadow-card border-2 ${meta.accentClass} p-4 sm:p-5 space-y-4 min-w-0`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border pb-3 min-w-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {meta.icon}
            <h2 className="text-sm sm:text-base font-bold text-charcoal">
              {title}
            </h2>
            <span className="px-2 py-0.5 text-xs font-extrabold rounded-sm bg-navy/10 dark:bg-sky-500/20 text-navy dark:text-sky-300">
              {tasks.length}
            </span>
          </div>
          <p className="text-xs text-mid-grey mt-0.5">{meta.subtitle}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={tasksHref}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-navy text-white text-xs font-bold uppercase tracking-wider hover:bg-navy-dark rounded-xs min-h-[38px]"
          >
            Ver en Tareas <ArrowRight size={14} />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 px-2.5 py-2 border border-border text-xs font-bold text-mid-grey hover:text-charcoal hover:bg-off-white rounded-xs min-h-[38px]"
            aria-label="Cerrar detalle de filtro KPI"
          >
            <X size={15} /> Cerrar
          </button>
        </div>
      </div>

      {tasks.length === 0 ? (
        <div className="py-6 text-center text-sm text-mid-grey bg-off-white rounded-sm border border-border/60">
          No hay partes en esta categoría ahora mismo.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visibleTasks.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
          {tasks.length > visibleTasks.length && (
            <div className="pt-1 flex justify-end">
              <Link
                href={tasksHref}
                className="text-xs font-bold text-magenta hover:underline uppercase tracking-wider inline-flex items-center gap-1"
              >
                Ver los {tasks.length} partes en Tareas <ArrowRight size={13} />
              </Link>
            </div>
          )}
        </>
      )}
    </section>
  );
}
