'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowRight,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock,
  MapPin,
  Phone,
  User,
  Wrench,
} from 'lucide-react';
import { PriorityBadge, StatusBadge, TaskTypeBadge } from '@/components/ui/Badge';
import { TaskCard } from '@/components/ui/TaskCard';
import { formatRelativeAge, getScheduledDateTag } from '@/lib/dashboard-helpers';
import {
  resolveTaskType,
  TASK_TYPE_META,
  type Task,
  type TaskType,
} from '@/types/database';

interface DashboardOperationalListsProps {
  openTasks: Task[];
  scheduledInstallations: Task[];
  unscheduledInstallations: Task[];
  isCoord: boolean;
  unassignedPoolCount?: number;
}

type SectionViewFilter = 'all' | 'open' | 'scheduled' | 'unscheduled';

const TYPE_FILTER_OPTIONS: Array<{ id: TaskType | 'all'; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'rma_incident', label: 'RMA' },
  { id: 'cxc_incident', label: 'CXC' },
  { id: 'task', label: 'Tarea' },
  { id: 'installation', label: 'Instalación' },
];

export function DashboardOperationalLists({
  openTasks,
  scheduledInstallations,
  unscheduledInstallations,
  isCoord,
  unassignedPoolCount = 0,
}: DashboardOperationalListsProps) {
  const [sectionView, setSectionView] = useState<SectionViewFilter>('all');
  const [openTypeFilter, setOpenTypeFilter] = useState<TaskType | 'all'>('all');
  const [showAllOpen, setShowAllOpen] = useState(false);
  const [showAllScheduled, setShowAllScheduled] = useState(false);
  const [showAllUnscheduled, setShowAllUnscheduled] = useState(false);

  const filteredOpenTasks = useMemo(() => {
    if (openTypeFilter === 'all') return openTasks;
    return openTasks.filter((t) => resolveTaskType(t) === openTypeFilter);
  }, [openTasks, openTypeFilter]);

  const visibleOpen = showAllOpen ? filteredOpenTasks : filteredOpenTasks.slice(0, 6);
  const visibleScheduled = showAllScheduled
    ? scheduledInstallations
    : scheduledInstallations.slice(0, 6);
  const visibleUnscheduled = showAllUnscheduled
    ? unscheduledInstallations
    : unscheduledInstallations.slice(0, 6);

  const showOpenSection = sectionView === 'all' || sectionView === 'open';
  const showScheduledSection = sectionView === 'all' || sectionView === 'scheduled';
  const showUnscheduledSection = sectionView === 'all' || sectionView === 'unscheduled';

  return (
    <div className="space-y-6 min-w-0">
      {/* Selector rápido de bloques para navegación ágil en smartphone y escritorio */}
      <div className="flex flex-wrap items-center gap-2 bg-white p-2.5 rounded-md border border-border/60 shadow-card">
        <button
          type="button"
          onClick={() => setSectionView('all')}
          className={`px-3 py-1.5 text-xs font-bold rounded-sm transition-colors ${
            sectionView === 'all'
              ? 'bg-navy text-white'
              : 'bg-off-white text-dark-grey hover:bg-navy/5'
          }`}
        >
          Todos los bloques
        </button>
        <button
          type="button"
          onClick={() => setSectionView('open')}
          className={`px-3 py-1.5 text-xs font-bold rounded-sm transition-colors ${
            sectionView === 'open'
              ? 'bg-navy text-white'
              : 'bg-off-white text-dark-grey hover:bg-navy/5'
          }`}
        >
          Partes abiertos ({openTasks.length})
        </button>
        <button
          type="button"
          onClick={() => setSectionView('scheduled')}
          className={`px-3 py-1.5 text-xs font-bold rounded-sm transition-colors ${
            sectionView === 'scheduled'
              ? 'bg-navy text-white'
              : 'bg-off-white text-dark-grey hover:bg-navy/5'
          }`}
        >
          Inst. con fecha ({scheduledInstallations.length})
        </button>
        <button
          type="button"
          onClick={() => setSectionView('unscheduled')}
          className={`px-3 py-1.5 text-xs font-bold rounded-sm transition-colors ${
            sectionView === 'unscheduled'
              ? 'bg-navy text-white'
              : 'bg-off-white text-dark-grey hover:bg-navy/5'
          }`}
        >
          Inst. sin fecha ({unscheduledInstallations.length})
        </button>
      </div>

      {/* BLOQUE 1: Partes aún no cerrados (prioridad alta→baja, fecha más antigua→nueva) */}
      {showOpenSection && (
        <section className="space-y-3 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <ClipboardList size={18} className="text-magenta flex-shrink-0" />
                <h2 className="text-base sm:text-lg font-bold text-charcoal">
                  {isCoord ? 'Partes Aún No Cerrados' : 'Mis Partes Aún No Cerrados'}
                </h2>
                <span className="px-2 py-0.5 text-xs font-extrabold rounded-sm bg-navy/10 text-navy">
                  {filteredOpenTasks.length}
                </span>
              </div>
              <p className="text-xs text-mid-grey mt-0.5">
                Ordenados por prioridad (Urgente → Baja) y fecha de apertura (más antiguos primero)
              </p>
            </div>

            <Link
              href="/tasks"
              className="text-xs font-bold text-magenta uppercase tracking-wider hover:underline inline-flex items-center gap-1 flex-shrink-0"
            >
              Ir a Tareas <ArrowRight size={13} />
            </Link>
          </div>

          {/* Mini-filtro por tipo (envuelve limpio en móvil, cero scroll horizontal) */}
          <div className="flex flex-wrap gap-1.5">
            {TYPE_FILTER_OPTIONS.map((opt) => {
              const countForType =
                opt.id === 'all'
                  ? openTasks.length
                  : openTasks.filter((t) => resolveTaskType(t) === opt.id).length;
              const active = openTypeFilter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setOpenTypeFilter(opt.id)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-sm border transition-colors ${
                    active
                      ? 'bg-navy text-white border-navy'
                      : 'bg-white text-dark-grey border-border hover:border-navy'
                  }`}
                >
                  {opt.label} ({countForType})
                </button>
              );
            })}
          </div>

          {filteredOpenTasks.length === 0 ? (
            <div className="bg-white rounded-md p-6 text-center shadow-card border border-border/60">
              <CheckCircle2 size={28} className="text-success mx-auto mb-2" />
              <p className="text-sm font-bold text-charcoal">
                {openTypeFilter === 'all'
                  ? 'No hay partes pendientes de cierre'
                  : `No hay partes abiertos de tipo ${TASK_TYPE_META[openTypeFilter].label}`}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {visibleOpen.map((task) => (
                  <div key={task.id} className="space-y-1 min-w-0">
                    <div className="flex items-center justify-between px-1 text-[11px] text-mid-grey">
                      <span>Abierto: {formatRelativeAge(task.created_at)}</span>
                      <span>
                        {new Date(task.created_at).toLocaleDateString('es-ES', {
                          day: '2-digit',
                          month: '2-digit',
                          year: '2-digit',
                        })}
                      </span>
                    </div>
                    <TaskCard task={task} />
                  </div>
                ))}
              </div>
              {filteredOpenTasks.length > 6 && (
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAllOpen((prev) => !prev)}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider border border-navy text-navy bg-white hover:bg-navy/5 rounded-xs"
                  >
                    {showAllOpen
                      ? 'Mostrar menos'
                      : `Mostrar todos (${filteredOpenTasks.length})`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* BLOQUE 2: Instalaciones con fecha ya asignada (más próxima primero) */}
      {showScheduledSection && (
        <section className="space-y-3 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CalendarCheck2 size={18} className="text-petrol flex-shrink-0" />
                <h2 className="text-base sm:text-lg font-bold text-charcoal">
                  {isCoord
                    ? 'Instalaciones con Fecha Asignada'
                    : 'Mis Instalaciones con Fecha Asignada'}
                </h2>
                <span className="px-2 py-0.5 text-xs font-extrabold rounded-sm bg-petrol/15 text-petrol">
                  {scheduledInstallations.length}
                </span>
              </div>
              <p className="text-xs text-mid-grey mt-0.5">
                Ordenadas desde la más próxima a ejecutarse
              </p>
            </div>

            <Link
              href="/installations"
              className="text-xs font-bold text-magenta uppercase tracking-wider hover:underline inline-flex items-center gap-1 flex-shrink-0"
            >
              Ver Instalaciones <ArrowRight size={13} />
            </Link>
          </div>

          {scheduledInstallations.length === 0 ? (
            <div className="bg-white rounded-md p-6 text-center shadow-card border border-border/60">
              <CalendarCheck2 size={28} className="text-mid-grey mx-auto mb-2" />
              <p className="text-sm font-bold text-charcoal">
                No hay instalaciones programadas con fecha
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {visibleScheduled.map((task) => (
                  <InstallationCard
                    key={task.id}
                    task={task}
                    mode="scheduled"
                    showAssignee={isCoord}
                  />
                ))}
              </div>
              {scheduledInstallations.length > 6 && (
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAllScheduled((prev) => !prev)}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider border border-navy text-navy bg-white hover:bg-navy/5 rounded-xs"
                  >
                    {showAllScheduled
                      ? 'Mostrar menos'
                      : `Ver todas (${scheduledInstallations.length})`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* BLOQUE 3: Instalaciones sin fecha asignada (parte más antiguo primero) */}
      {showUnscheduledSection && (
        <section className="space-y-3 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <CalendarClock
                  size={18}
                  className="text-amber-600 flex-shrink-0"
                />
                <h2 className="text-base sm:text-lg font-bold text-charcoal">
                  {isCoord
                    ? 'Instalaciones Pendientes de Fecha'
                    : 'Mis Instalaciones Sin Fecha Asignada'}
                </h2>
                <span className="px-2 py-0.5 text-xs font-extrabold rounded-sm bg-amber-100 text-amber-800">
                  {unscheduledInstallations.length}
                </span>
              </div>
              <p className="text-xs text-mid-grey mt-0.5">
                Ordenadas de más antiguas a más recientes según fecha del parte de instalación
              </p>
            </div>

            <Link
              href="/installations"
              className="text-xs font-bold text-magenta uppercase tracking-wider hover:underline inline-flex items-center gap-1 flex-shrink-0"
            >
              Gestionar fechas <ArrowRight size={13} />
            </Link>
          </div>

          {unscheduledInstallations.length === 0 ? (
            <div className="bg-white rounded-md p-6 text-center shadow-card border border-border/60">
              <CheckCircle2 size={28} className="text-success mx-auto mb-2" />
              <p className="text-sm font-bold text-charcoal">
                Todas las instalaciones tienen fecha acordada
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {visibleUnscheduled.map((task) => (
                  <InstallationCard
                    key={task.id}
                    task={task}
                    mode="unscheduled"
                    showAssignee={isCoord}
                  />
                ))}
              </div>
              {unscheduledInstallations.length > 6 && (
                <div className="flex justify-center pt-1">
                  <button
                    type="button"
                    onClick={() => setShowAllUnscheduled((prev) => !prev)}
                    className="px-4 py-2 text-xs font-bold uppercase tracking-wider border border-navy text-navy bg-white hover:bg-navy/5 rounded-xs"
                  >
                    {showAllUnscheduled
                      ? 'Mostrar menos'
                      : `Ver todas (${unscheduledInstallations.length})`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* Aviso compacto al técnico si hay partes sin asignar en la bolsa común */}
      {!isCoord && unassignedPoolCount > 0 && (
        <div className="bg-white rounded-md shadow-card border-l-4 border-petrol p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertCircle
              size={18}
              className="text-petrol flex-shrink-0 mt-0.5"
            />
            <div className="min-w-0">
              <p className="text-sm font-bold text-charcoal">
                Hay {unassignedPoolCount} {unassignedPoolCount === 1 ? 'parte' : 'partes'} sin
                técnico asignado
              </p>
              <p className="text-xs text-mid-grey">
                Disponibles en la bolsa común por si necesitas auto-asignarte alguno.
              </p>
            </div>
          </div>
          <Link
            href="/tasks?filter=unassigned"
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-navy text-white text-xs font-bold uppercase tracking-wider hover:bg-navy-dark rounded-xs flex-shrink-0"
          >
            Ver sin asignar <ArrowRight size={14} />
          </Link>
        </div>
      )}
    </div>
  );
}

function InstallationCard({
  task,
  mode,
  showAssignee,
}: {
  task: Task;
  mode: 'scheduled' | 'unscheduled';
  showAssignee: boolean;
}) {
  const address = [
    task.site_address || task.customer?.address,
    task.site_city || task.customer?.city,
  ]
    .filter(Boolean)
    .join(', ');
  const phone = task.site_contact_phone || task.customer?.contact_phone;
  const mapsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;

  const scheduleTag =
    mode === 'scheduled' && task.scheduled_date
      ? getScheduledDateTag(task.scheduled_date)
      : null;

  return (
    <div
      className={`bg-white rounded-md shadow-card border border-border/60 overflow-hidden min-w-0 border-l-4 ${
        mode === 'scheduled'
          ? scheduleTag?.isPast
            ? 'border-l-danger'
            : 'border-l-petrol'
          : 'border-l-amber-500'
      }`}
    >
      <Link href={`/tasks/${task.id}`} className="block p-4 space-y-2">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-extrabold tracking-wider text-navy uppercase">
                {task.code}
              </span>
              <TaskTypeBadge taskType="installation" />
              {mode === 'scheduled' && scheduleTag ? (
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-xs ${scheduleTag.badgeClass}`}
                >
                  <CalendarCheck2 size={11} /> {scheduleTag.label}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-extrabold uppercase rounded-xs bg-amber-100 text-amber-800">
                  <Clock size={11} /> {formatRelativeAge(task.created_at)}
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-charcoal leading-snug mt-1 truncate">
              {task.customer?.name || 'Cliente'}
            </h3>
          </div>
          <PriorityBadge priority={task.priority} />
        </div>

        {/* Destacado fecha programada o fecha de creación del parte */}
        {mode === 'scheduled' && task.scheduled_date ? (
          <div className="p-2 bg-petrol/10 border border-petrol/20 rounded-xs text-xs font-bold text-petrol flex items-center gap-1.5">
            <CalendarCheck2 size={14} className="flex-shrink-0" />
            <span>
              Cita:{' '}
              {new Date(task.scheduled_date).toLocaleString('es-ES', {
                weekday: 'short',
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        ) : (
          <div className="p-2 bg-amber-50 border border-amber-300/60 rounded-xs text-xs font-semibold text-amber-900 flex items-center gap-1.5">
            <CalendarClock size={14} className="flex-shrink-0" />
            <span>
              Parte del{' '}
              {new Date(task.created_at).toLocaleDateString('es-ES', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}{' '}
              · Sin fecha acordada
            </span>
          </div>
        )}

        {task.equipment_ref && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-dark-grey min-w-0">
            <Wrench size={13} className="text-magenta flex-shrink-0" />
            <span className="truncate">{task.equipment_ref}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/70">
          <div className="flex items-center gap-1.5 flex-wrap">
            <StatusBadge status={task.status} />
            <span
              className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded-xs ${
                task.merchandise_check_done === true
                  ? 'bg-success/15 text-success'
                  : task.merchandise_check_done === false
                  ? 'bg-danger/15 text-danger'
                  : 'bg-off-white text-mid-grey border border-border'
              }`}
            >
              {task.merchandise_check_done === true
                ? 'Cotejo OK'
                : task.merchandise_check_done === false
                ? 'Cotejo incid.'
                : 'Cotejo pend.'}
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs text-mid-grey">
            {showAssignee && (
              <span className="inline-flex items-center gap-1 truncate max-w-[140px]">
                <User size={12} className="flex-shrink-0" />
                <span className="truncate">
                  {task.assignee ? task.assignee.full_name : 'Sin asignar'}
                </span>
              </span>
            )}
            <ChevronRight size={16} className="text-navy flex-shrink-0" />
          </div>
        </div>
      </Link>

      {(mapsUrl || phone) && (
        <div className="grid grid-cols-2 border-t border-border/70 bg-off-white/70 divide-x divide-border/70">
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold text-navy hover:bg-navy/5 min-h-[40px]"
            >
              <MapPin size={13} className="text-magenta flex-shrink-0" />
              <span className="truncate">Maps</span>
            </a>
          ) : (
            <span />
          )}
          {phone ? (
            <a
              href={`tel:${phone.replace(/\s+/g, '')}`}
              className="flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-bold text-navy hover:bg-navy/5 min-h-[40px]"
            >
              <Phone size={13} className="text-petrol flex-shrink-0" />
              <span className="truncate">Llamar</span>
            </a>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
