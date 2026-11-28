'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Calendar,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CalendarX2,
  CheckCircle2,
  ListFilter,
  Plus,
  Search,
  X,
} from 'lucide-react';
import { InstallationsCalendarView } from '@/components/installations/InstallationsCalendarView';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { TaskCard } from '@/components/ui/TaskCard';
import { useAuth } from '@/hooks/useAuth';
import { isOpenTask } from '@/lib/dashboard-helpers';
import { listTasks, updateTaskFields } from '@/lib/data-service';
import { detectInstallationConflicts, downloadInstallationIcs } from '@/lib/ics';
import { dateInputToIso, formatDateOnlyEs, toDateInputValue } from '@/lib/task-dates';
import { useAppCache } from '@/store/app-cache';
import { resolveTaskType, type Profile, type Task } from '@/types/database';

export default function InstallationsPage() {
  return (
    <AppShell>
      <InstallationsContent />
    </AppShell>
  );
}

function InstallationsContent() {
  const { profile } = useAuth();
  const cachedTasks = useAppCache((s) => s.tasks);
  const tasksLoadedAt = useAppCache((s) => s.tasksLoadedAt);

  const [allTasks, setAllTasks] = useState<Task[]>(cachedTasks);
  const [loading, setLoading] = useState(!tasksLoadedAt);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [filterMode, setFilterMode] = useState<'all' | 'pending_date' | 'scheduled' | 'completed'>(
    'all'
  );
  const [feedback, setFeedback] = useState<string | null>(null);

  // Modal rápido para asignar fecha acordada
  const [schedulingTask, setSchedulingTask] = useState<Task | null>(null);
  const [scheduleInput, setScheduleInput] = useState('');
  const [savingDate, setSavingDate] = useState(false);

  const profileId = profile?.id;
  const profileRole = profile?.role;

  const load = useCallback(
    async (silent = false) => {
      if (!profileId || !profileRole) return;
      await Promise.resolve();
      const hasCached = useAppCache.getState().tasksLoadedAt !== null;
      if (!silent && !hasCached) setLoading(true);
      try {
        const viewer = { id: profileId, role: profileRole } as Profile;
        const all = await listTasks(viewer);
        setAllTasks(all);
      } finally {
        setLoading(false);
      }
    },
    [profileId, profileRole]
  );

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    const handler = () => void load(true);
    window.addEventListener('vistasat:demo-updated', handler);
    return () => {
      clearTimeout(t);
      window.removeEventListener('vistasat:demo-updated', handler);
    };
  }, [load]);

  const tasks = useMemo(
    () => allTasks.filter((t) => resolveTaskType(t) === 'installation'),
    [allTasks]
  );

  const searched = useMemo(() => {
    if (!search.trim()) return tasks;
    const q = search.toLowerCase();
    return tasks.filter((t) =>
      [t.code, t.customer?.name, t.equipment_ref, t.site_city, t.problem_desc, t.assignee?.full_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [tasks, search]);

  const pendingDateList = useMemo(
    () =>
      searched.filter(
        (t) => !t.scheduled_date && t.status !== 'completed' && t.status !== 'cancelled'
      ),
    [searched]
  );

  const scheduledList = useMemo(
    () =>
      searched
        .filter((t) => Boolean(t.scheduled_date) && t.status !== 'completed' && t.status !== 'cancelled')
        .sort((a, b) => (a.scheduled_date || '').localeCompare(b.scheduled_date || '')),
    [searched]
  );

  const completedList = useMemo(
    () => searched.filter((t) => t.status === 'completed'),
    [searched]
  );

  const allOpenTasks = useMemo(() => allTasks.filter(isOpenTask), [allTasks]);

  const conflicts = useMemo(() => detectInstallationConflicts(tasks), [tasks]);

  if (!profile) return null;

  const openScheduleModal = (task: Task) => {
    setSchedulingTask(task);
    setScheduleInput(toDateInputValue(task.scheduled_date));
  };

  const handleSaveSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedulingTask) return;
    setSavingDate(true);
    try {
      const nextIso = dateInputToIso(scheduleInput);
      await updateTaskFields(schedulingTask.id, { scheduled_date: nextIso }, profile);
      setSchedulingTask(null);
      setFeedback(
        nextIso
          ? `Fecha acordada asignada a ${schedulingTask.code}.`
          : `Fecha acordada eliminada en ${schedulingTask.code}.`
      );
      setTimeout(() => setFeedback(null), 3500);
      await load(true);
    } finally {
      setSavingDate(false);
    }
  };

  const showPendingDate = filterMode === 'all' || filterMode === 'pending_date';
  const showScheduled = filterMode === 'all' || filterMode === 'scheduled';
  const showCompleted = filterMode === 'completed' || (filterMode === 'all' && completedList.length > 0);

  return (
    <div className="p-4 sm:p-6 space-y-5">
      {feedback && (
        <div className="p-3 bg-navy text-white text-xs font-bold border-l-4 border-magenta shadow-card">
          {feedback}
        </div>
      )}

      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-charcoal flex items-center gap-2">
            <CalendarClock size={22} className="text-navy" /> Instalaciones
          </h1>
          <p className="text-xs text-mid-grey mt-0.5">
            Control de instalaciones pendientes de fecha y calendario de instalaciones acordadas
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex bg-white border border-border rounded-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold ${
                viewMode === 'list' ? 'bg-navy text-white' : 'text-mid-grey hover:text-charcoal'
              }`}
            >
              <ListFilter size={14} /> Lista
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold ${
                viewMode === 'calendar' ? 'bg-navy text-white' : 'text-mid-grey hover:text-charcoal'
              }`}
            >
              <CalendarDays size={14} /> Calendario
            </button>
          </div>

          <Link href="/tasks/new?type=installation">
            <Button variant="accent" size="sm">
              <Plus size={16} /> Nueva Instalación
            </Button>
          </Link>
        </div>
      </div>

      {/* Aviso de solapamientos de horario del mismo técnico */}
      {conflicts.size > 0 && (
        <div className="p-3 bg-danger/10 border-l-4 border-danger rounded-sm flex items-start gap-2.5 text-xs text-charcoal">
          <AlertTriangle size={17} className="text-danger flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-danger">
              Detectados {conflicts.size} parte(s) con solapamiento de horario para el mismo técnico
            </p>
            <p className="text-dark-grey mt-0.5">
              Revisa la vista Calendario o ajusta la hora acordada para evitar dos citas simultáneas.
            </p>
          </div>
        </div>
      )}

      {/* Filtros / Contadores KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <button
          type="button"
          onClick={() => setFilterMode('all')}
          className={`p-3 rounded-md text-left border transition-colors ${
            filterMode === 'all'
              ? 'bg-navy text-white border-navy shadow-card'
              : 'bg-white text-charcoal border-border'
          }`}
        >
          <p className="text-lg font-bold leading-none">{tasks.length}</p>
          <p className={`text-[11px] font-bold uppercase mt-1 ${filterMode === 'all' ? 'text-white/80' : 'text-mid-grey'}`}>
            Todas
          </p>
        </button>

        <button
          type="button"
          onClick={() => setFilterMode('pending_date')}
          className={`p-3 rounded-md text-left border transition-colors ${
            filterMode === 'pending_date'
              ? 'bg-magenta text-white border-magenta shadow-card'
              : 'bg-white text-charcoal border-border'
          }`}
        >
          <p className="text-lg font-bold leading-none">{pendingDateList.length}</p>
          <p
            className={`text-[11px] font-bold uppercase mt-1 ${
              filterMode === 'pending_date' ? 'text-white/85' : 'text-magenta'
            }`}
          >
            Pendientes de fecha
          </p>
        </button>

        <button
          type="button"
          onClick={() => setFilterMode('scheduled')}
          className={`p-3 rounded-md text-left border transition-colors ${
            filterMode === 'scheduled'
              ? 'bg-petrol text-white border-petrol shadow-card'
              : 'bg-white text-charcoal border-border'
          }`}
        >
          <p className="text-lg font-bold leading-none">{scheduledList.length}</p>
          <p
            className={`text-[11px] font-bold uppercase mt-1 ${
              filterMode === 'scheduled' ? 'text-white/85' : 'text-petrol'
            }`}
          >
            Con fecha asignada
          </p>
        </button>

        <button
          type="button"
          onClick={() => setFilterMode('completed')}
          className={`p-3 rounded-md text-left border transition-colors ${
            filterMode === 'completed'
              ? 'bg-success text-white border-success shadow-card'
              : 'bg-white text-charcoal border-border'
          }`}
        >
          <p className="text-lg font-bold leading-none">{completedList.length}</p>
          <p
            className={`text-[11px] font-bold uppercase mt-1 ${
              filterMode === 'completed' ? 'text-white/85' : 'text-success'
            }`}
          >
            Completadas
          </p>
        </button>
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-mid-grey" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar instalación por código, cliente, equipo o ciudad..."
          className="w-full pl-10 pr-3 py-2.5 bg-white border border-border text-charcoal"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-44 bg-white rounded-md animate-pulse shadow-card" />
          ))}
        </div>
      ) : viewMode === 'calendar' ? (
        <InstallationsCalendarView
          scheduledInstallations={scheduledList}
          allOpenTasks={allOpenTasks}
          conflicts={conflicts}
          onChangeSchedule={openScheduleModal}
        />
      ) : (
        <div className="space-y-6">
          {/* Bloque 1: Instalaciones pendientes de asignar fecha */}
          {showPendingDate && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-magenta flex items-center gap-2">
                  <CalendarX2 size={16} /> Pendientes de asignar fecha de instalación (
                  {pendingDateList.length})
                </h2>
              </div>

              {pendingDateList.length === 0 ? (
                <div className="bg-white rounded-md p-6 text-center shadow-card border border-border/60">
                  <p className="text-sm font-bold text-charcoal">
                    No hay instalaciones pendientes de fecha
                  </p>
                  <p className="text-xs text-mid-grey mt-1">
                    Todas las instalaciones activas ya tienen una fecha acordada asignada.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {pendingDateList.map((t) => (
                    <div key={t.id} className="space-y-0">
                      <TaskCard task={t} />
                      <div className="bg-magenta/10 border border-t-0 border-magenta/30 px-4 py-2 flex items-center justify-between gap-2 rounded-b-md">
                        <span className="text-xs font-bold text-magenta">
                          Sin fecha de instalación acordada
                        </span>
                        <button
                          type="button"
                          onClick={() => openScheduleModal(t)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-navy text-white text-xs font-bold hover:bg-navy-dark"
                        >
                          <Calendar size={13} /> Asignar fecha
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Bloque 2: Instalaciones con fecha de instalación */}
          {showScheduled && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-navy flex items-center gap-2">
                  <Calendar size={16} className="text-petrol" /> Instalaciones con
                  fecha de instalación ({scheduledList.length})
                </h2>
              </div>

              {scheduledList.length === 0 ? (
                <div className="bg-white rounded-md p-6 text-center shadow-card border border-border/60">
                  <p className="text-sm font-bold text-charcoal">
                    No hay instalaciones con fecha programada
                  </p>
                  <p className="text-xs text-mid-grey mt-1">
                    Asigna una fecha futura desde la lista superior o al crear una nueva instalación.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {scheduledList.map((t) => {
                    const hasConflict = conflicts.has(t.id);
                    return (
                      <div key={t.id} className="space-y-0">
                        <TaskCard task={t} />
                        <div
                          className={`border border-t-0 px-4 py-2 flex flex-wrap items-center justify-between gap-2 rounded-b-md ${
                            hasConflict
                              ? 'bg-danger/10 border-danger/40'
                              : 'bg-petrol/10 border-petrol/30'
                          }`}
                        >
                          <span
                            className={`text-xs font-bold flex items-center gap-1 ${
                              hasConflict ? 'text-danger' : 'text-petrol'
                            }`}
                          >
                            {hasConflict && <AlertTriangle size={13} />}
                            Programada:{' '}
                            {t.scheduled_date ? formatDateOnlyEs(t.scheduled_date, 'medium') : ''}
                          </span>
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              onClick={() => downloadInstallationIcs(t)}
                              className="inline-flex items-center gap-1 text-xs font-bold text-magenta hover:underline"
                            >
                              <CalendarPlus size={13} /> .ics
                            </button>
                            <button
                              type="button"
                              onClick={() => openScheduleModal(t)}
                              className="text-xs font-bold text-navy hover:underline"
                            >
                              Cambiar fecha
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Bloque 3: Instalaciones completadas */}
          {showCompleted && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
                <h2 className="text-sm font-extrabold uppercase tracking-wider text-success flex items-center gap-2">
                  <CheckCircle2 size={16} /> Instalaciones completadas ({completedList.length})
                </h2>
              </div>

              {completedList.length === 0 ? (
                <div className="bg-white rounded-md p-6 text-center shadow-card">
                  <p className="text-sm text-mid-grey">No hay instalaciones completadas aún.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {completedList.map((t) => (
                    <TaskCard key={t.id} task={t} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* Modal rápido asignar fecha acordada */}
      {schedulingTask && (
        <div
          className="fixed inset-0 z-50 bg-charcoal/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setSchedulingTask(null)}
        >
          <div
            className="bg-white w-full sm:max-w-md rounded-t-lg sm:rounded-lg p-5 space-y-4 shadow-elevated"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div>
                <h3 className="text-base font-bold text-charcoal">
                  Fecha de Instalación · {schedulingTask.code}
                </h3>
                <p className="text-xs text-mid-grey">{schedulingTask.customer?.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setSchedulingTask(null)}
                className="p-1 text-mid-grey"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                  Fecha acordada
                </label>
                <input
                  type="date"
                  aria-label="Fecha acordada"
                  value={scheduleInput}
                  onChange={(e) => setScheduleInput(e.target.value)}
                  className="w-full px-3 py-2.5 bg-bg-input border border-border text-sm text-charcoal"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setSchedulingTask(null)}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="accent" size="sm" isLoading={savingDate}>
                  Guardar fecha
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
