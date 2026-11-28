'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Calendar,
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { StatusBadge } from '@/components/ui/Badge';
import { downloadInstallationIcs } from '@/lib/ics';
import { getSlaStatus } from '@/lib/sla';
import { resolveTaskType, type Task } from '@/types/database';

interface InstallationsCalendarViewProps {
  scheduledInstallations: Task[];
  allOpenTasks: Task[];
  conflicts: Map<string, Task[]>;
  onChangeSchedule: (task: Task) => void;
}

interface CalendarDayEvent {
  id: string;
  kind: 'installation' | 'sla';
  dateKey: string;
  timeLabel: string;
  task: Task;
  hasConflict: boolean;
}

const WEEKDAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function toLocalDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getMondayOfWeek(ref: Date): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

export function InstallationsCalendarView({
  scheduledInstallations,
  allOpenTasks,
  conflicts,
  onChangeSchedule,
}: InstallationsCalendarViewProps) {
  const [viewMode, setViewMode] = useState<'month' | 'week'>('month');
  const [showSla, setShowSla] = useState(true);
  const [cursorDate, setCursorDate] = useState(() => new Date());
  const [selectedDayKey, setSelectedDayKey] = useState(() => toLocalDateKey(new Date()));

  const todayKey = toLocalDateKey(new Date());

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarDayEvent[]>();

    for (const t of scheduledInstallations) {
      if (!t.scheduled_date) continue;
      const d = new Date(t.scheduled_date);
      if (Number.isNaN(d.getTime())) continue;
      const dateKey = toLocalDateKey(d);
      const list = map.get(dateKey) || [];
      list.push({
        id: `inst-${t.id}`,
        kind: 'installation',
        dateKey,
        timeLabel: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
        task: t,
        hasConflict: conflicts.has(t.id),
      });
      map.set(dateKey, list);
    }

    if (showSla) {
      for (const t of allOpenTasks) {
        if (!t.due_date) continue;
        if (t.status === 'completed' || t.status === 'cancelled') continue;
        const d = new Date(t.due_date);
        if (Number.isNaN(d.getTime())) continue;
        const dateKey = toLocalDateKey(d);
        const list = map.get(dateKey) || [];
        list.push({
          id: `sla-${t.id}`,
          kind: 'sla',
          dateKey,
          timeLabel: d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          task: t,
          hasConflict: false,
        });
        map.set(dateKey, list);
      }
    }

    for (const [k, items] of map.entries()) {
      items.sort((a, b) => a.timeLabel.localeCompare(b.timeLabel));
      map.set(k, items);
    }

    return map;
  }, [scheduledInstallations, allOpenTasks, conflicts, showSla]);

  const calendarDays = useMemo(() => {
    if (viewMode === 'week') {
      const monday = getMondayOfWeek(cursorDate);
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return { date: d, dateKey: toLocalDateKey(d), inCurrentMonth: true };
      });
    }

    const firstOfMonth = new Date(cursorDate.getFullYear(), cursorDate.getMonth(), 1);
    const startMonday = getMondayOfWeek(firstOfMonth);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(startMonday);
      d.setDate(startMonday.getDate() + i);
      return {
        date: d,
        dateKey: toLocalDateKey(d),
        inCurrentMonth: d.getMonth() === cursorDate.getMonth(),
      };
    });
  }, [cursorDate, viewMode]);

  const headerTitle = useMemo(() => {
    if (viewMode === 'month') {
      return cursorDate.toLocaleDateString('es-ES', {
        month: 'long',
        year: 'numeric',
      });
    }
    const monday = getMondayOfWeek(cursorDate);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return `${monday.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
    })} – ${sunday.toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })}`;
  }, [cursorDate, viewMode]);

  const moveCursor = (direction: -1 | 1) => {
    setCursorDate((prev) => {
      const next = new Date(prev);
      if (viewMode === 'month') {
        next.setMonth(prev.getMonth() + direction);
      } else {
        next.setDate(prev.getDate() + direction * 7);
      }
      return next;
    });
  };

  const goToday = () => {
    const now = new Date();
    setCursorDate(now);
    setSelectedDayKey(toLocalDateKey(now));
  };

  const selectedDayEvents = eventsByDay.get(selectedDayKey) || [];

  return (
    <div className="space-y-4">
      {/* Barra superior del calendario */}
      <div className="bg-white rounded-md shadow-card p-3 sm:p-4 border border-border/60 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => moveCursor(-1)}
            className="p-2 border border-border bg-off-white hover:bg-navy/5 text-charcoal rounded-xs"
            aria-label="Periodo anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="px-3 py-1.5 border border-border bg-off-white hover:bg-navy/5 text-xs font-bold text-navy rounded-xs"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => moveCursor(1)}
            className="p-2 border border-border bg-off-white hover:bg-navy/5 text-charcoal rounded-xs"
            aria-label="Periodo siguiente"
          >
            <ChevronRight size={16} />
          </button>
          <h2 className="text-sm sm:text-base font-extrabold text-charcoal capitalize ml-1">
            {headerTitle}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-dark-grey cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showSla}
              onChange={(e) => setShowSla(e.target.checked)}
              className="accent-magenta"
            />
            Mostrar vencimientos SLA
          </label>

          <div className="inline-flex border border-border rounded-xs overflow-hidden bg-off-white">
            <button
              type="button"
              onClick={() => setViewMode('month')}
              className={`px-3 py-1.5 text-xs font-bold ${
                viewMode === 'month' ? 'bg-navy text-white' : 'text-mid-grey hover:text-charcoal'
              }`}
            >
              Mes
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={`px-3 py-1.5 text-xs font-bold ${
                viewMode === 'week' ? 'bg-navy text-white' : 'text-mid-grey hover:text-charcoal'
              }`}
            >
              Semana
            </button>
          </div>
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap items-center gap-4 text-[11px] font-semibold text-mid-grey px-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-petrol" /> Instalación programada
        </span>
        {showSla && (
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-magenta" /> Vencimiento SLA
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-danger" /> Solapamiento de técnico
        </span>
      </div>

      {/* Cuadrícula responsive sin scroll horizontal */}
      <div className="bg-white rounded-md shadow-card border border-border overflow-hidden">
        <div className="grid grid-cols-7 bg-navy text-white text-[11px] font-bold uppercase text-center py-2">
          {WEEKDAY_NAMES.map((d) => (
            <div key={d}>{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 divide-x divide-y divide-border/70">
          {calendarDays.map((cell) => {
            const items = eventsByDay.get(cell.dateKey) || [];
            const instItems = items.filter((e) => e.kind === 'installation');
            const slaItems = items.filter((e) => e.kind === 'sla');
            const hasConflict = instItems.some((e) => e.hasConflict);
            const isSelected = cell.dateKey === selectedDayKey;
            const isToday = cell.dateKey === todayKey;

            return (
              <button
                key={cell.dateKey}
                type="button"
                onClick={() => setSelectedDayKey(cell.dateKey)}
                className={`text-left p-1.5 sm:p-2 min-h-[64px] sm:min-h-[96px] flex flex-col justify-between transition-colors min-w-0 ${
                  !cell.inCurrentMonth ? 'bg-off-white/60 text-light-grey' : 'bg-white text-charcoal'
                } ${isSelected ? 'ring-2 ring-inset ring-magenta bg-magenta/5' : 'hover:bg-off-white'}`}
              >
                <div className="flex items-center justify-between gap-1 w-full">
                  <span
                    className={`text-xs font-bold inline-flex items-center justify-center w-6 h-6 rounded-full ${
                      isToday ? 'bg-navy text-white' : ''
                    }`}
                  >
                    {cell.date.getDate()}
                  </span>
                  {hasConflict && (
                    <AlertTriangle size={12} className="text-danger flex-shrink-0" />
                  )}
                </div>

                {/* En escritorio mostramos chips compactos; en móvil puntos y contador */}
                <div className="space-y-1 mt-1 hidden sm:block w-full">
                  {items.slice(0, 2).map((ev) => (
                    <div
                      key={ev.id}
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-xs truncate ${
                        ev.hasConflict
                          ? 'bg-danger/15 text-danger border border-danger/30'
                          : ev.kind === 'installation'
                          ? 'bg-petrol/15 text-petrol'
                          : 'bg-magenta/15 text-magenta'
                      }`}
                    >
                      {ev.kind === 'installation'
                        ? `${ev.task.code} · ${ev.task.customer?.name || 'Instalación'}`
                        : `${ev.timeLabel} · ${ev.task.code}`}
                    </div>
                  ))}
                  {items.length > 2 && (
                    <p className="text-[10px] font-bold text-mid-grey pl-1">
                      +{items.length - 2} más
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1 sm:hidden mt-1">
                  {instItems.length > 0 && (
                    <span className="inline-flex items-center justify-center px-1 min-w-[16px] h-4 rounded-full bg-petrol text-white text-[9px] font-bold">
                      {instItems.length}
                    </span>
                  )}
                  {slaItems.length > 0 && (
                    <span className="inline-flex items-center justify-center px-1 min-w-[16px] h-4 rounded-full bg-magenta text-white text-[9px] font-bold">
                      {slaItems.length}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Agenda del día seleccionado */}
      <div className="bg-white rounded-md shadow-card p-4 border border-border/60 space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-navy flex items-center gap-2">
            <Calendar size={15} className="text-magenta" /> Agenda del{' '}
            {new Date(`${selectedDayKey}T12:00:00`).toLocaleDateString('es-ES', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </h3>
          <span className="text-xs font-bold text-mid-grey">
            {selectedDayEvents.length} evento{selectedDayEvents.length === 1 ? '' : 's'}
          </span>
        </div>

        {selectedDayEvents.length === 0 ? (
          <p className="text-xs text-mid-grey py-2">
            No hay instalaciones citadas ni vencimientos SLA en este día.
          </p>
        ) : (
          <div className="space-y-2.5">
            {selectedDayEvents.map((ev) => {
              const t = ev.task;
              const sla = getSlaStatus(t);
              const conflicting = conflicts.get(t.id) || [];
              return (
                <div
                  key={ev.id}
                  className={`p-3 rounded-sm border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 ${
                    ev.hasConflict
                      ? 'bg-danger/5 border-danger/40'
                      : ev.kind === 'installation'
                      ? 'bg-off-white border-border'
                      : 'bg-magenta/5 border-magenta/30'
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-extrabold text-navy">{t.code}</span>
                      <span
                        className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-xs ${
                          ev.kind === 'installation'
                            ? 'bg-petrol text-white'
                            : 'bg-magenta text-white'
                        }`}
                      >
                        {ev.kind === 'installation'
                          ? 'Instalación programada'
                          : `Vence SLA ${ev.timeLabel}`}
                      </span>
                      <StatusBadge status={t.status} />
                      {sla && ev.kind === 'sla' && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 ${sla.badgeClass}`}>
                          <Clock size={10} className="inline mr-0.5" />
                          {sla.shortLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-charcoal truncate">
                      {t.customer?.name || 'Cliente'}
                      {t.equipment_ref ? ` · ${t.equipment_ref}` : ''}
                    </p>
                    <p className="text-[11px] text-mid-grey">
                      Técnico: <strong>{t.assignee?.full_name || 'Sin asignar'}</strong>
                      {t.site_city || t.customer?.city
                        ? ` · ${t.site_city || t.customer?.city}`
                        : ''}
                    </p>
                    {ev.hasConflict && conflicting.length > 0 && (
                      <p className="text-[11px] font-bold text-danger flex items-center gap-1">
                        <ShieldAlert size={13} /> Solapamiento horario con:{' '}
                        {conflicting.map((c) => c.code).join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                    {ev.kind === 'installation' && (
                      <>
                        <button
                          type="button"
                          onClick={() => downloadInstallationIcs(t)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-border text-xs font-bold text-navy hover:bg-navy/5 rounded-xs"
                        >
                          <CalendarPlus size={13} className="text-magenta" /> .ics
                        </button>
                        <button
                          type="button"
                          onClick={() => onChangeSchedule(t)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-border text-xs font-bold text-charcoal hover:bg-off-white rounded-xs"
                        >
                          Cambiar fecha
                        </button>
                      </>
                    )}
                    <Link
                      href={`/tasks/${t.id}`}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-navy text-white text-xs font-bold hover:bg-navy-dark rounded-xs"
                    >
                      {resolveTaskType(t) === 'installation' ? 'Abrir' : 'Ver'} <ExternalLink size={12} />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
