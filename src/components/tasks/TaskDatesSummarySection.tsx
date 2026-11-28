'use client';

import { CalendarClock, CalendarCheck2, Clock, Hourglass } from 'lucide-react';
import {
  calculateElapsedDaysAndHours,
  formatFullDayDateTime,
  getEffectiveClosedAt,
} from '@/lib/task-dates';
import type { Task } from '@/types/database';

export function TaskDatesSummarySection({ task }: { task: Task }) {
  const closedAt = getEffectiveClosedAt(task);
  const elapsed = calculateElapsedDaysAndHours(task.created_at, closedAt);

  return (
    <section
      aria-labelledby="task-dates-heading"
      className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-3"
    >
      <h2
        id="task-dates-heading"
        className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2"
      >
        <CalendarClock size={16} className="text-magenta" /> Fechas y Tiempo del Parte
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Apertura */}
        <div className="p-3 bg-off-white border border-border border-l-4 border-l-navy rounded-sm space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-mid-grey flex items-center gap-1.5">
            <Clock size={12} className="text-navy" /> Día y fecha de apertura
          </span>
          <p className="text-xs sm:text-sm font-bold text-charcoal">
            {formatFullDayDateTime(task.created_at)}
          </p>
        </div>

        {/* Cierre */}
        <div
          className={`p-3 border border-border border-l-4 rounded-sm space-y-1 ${
            closedAt
              ? 'bg-emerald-50/50 border-l-success'
              : task.status === 'cancelled'
              ? 'bg-off-white border-l-mid-grey'
              : 'bg-amber-50/40 border-l-amber-500'
          }`}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider text-mid-grey flex items-center gap-1.5">
            <CalendarCheck2
              size={12}
              className={closedAt ? 'text-success' : 'text-amber-600'}
            />{' '}
            Fecha y hora de cierre
          </span>
          <p className="text-xs sm:text-sm font-bold text-charcoal">
            {closedAt
              ? formatFullDayDateTime(closedAt)
              : task.status === 'cancelled'
              ? 'Parte cancelado'
              : 'Pendiente de cierre'}
          </p>
        </div>

        {/* Duración en días y horas */}
        <div className="p-3 bg-navy/[0.03] border border-border border-l-4 border-l-petrol rounded-sm space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-mid-grey flex items-center gap-1.5">
            <Hourglass size={12} className="text-petrol" />{' '}
            {closedAt ? 'Duración (apertura → cierre)' : 'Tiempo desde apertura'}
          </span>
          <p
            data-testid="task-elapsed-duration"
            className="text-xs sm:text-sm font-extrabold text-navy"
          >
            {elapsed.formatted}
          </p>
          <p className="text-[11px] text-mid-grey">
            {closedAt ? 'Desde apertura hasta cierre' : 'En curso hasta ahora'}
          </p>
        </div>
      </div>
    </section>
  );
}
