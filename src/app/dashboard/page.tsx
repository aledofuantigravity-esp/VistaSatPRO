'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  PlusCircle,
  ShieldAlert,
  Users,
  Wrench,
} from 'lucide-react';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { DashboardOperationalLists } from '@/components/dashboard/DashboardOperationalLists';
import { KpiDrilldownPanel } from '@/components/dashboard/KpiDrilldownPanel';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { listTasks } from '@/lib/data-service';
import {
  computeDashboardMetrics,
  filterTasksByKpi,
  getScheduledInstallations,
  getUnscheduledInstallations,
  sortOpenTasksByPriorityAndAge,
  type DashboardKpiFilter,
} from '@/lib/dashboard-helpers';
import type { Profile, Task } from '@/types/database';

export default function DashboardPage() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeKpi, setActiveKpi] = useState<DashboardKpiFilter | null>(null);

  const profileId = profile?.id;
  const profileRole = profile?.role;

  const loadData = useCallback(async () => {
    if (!profileId || !profileRole) return;
    await Promise.resolve();
    setLoading(true);
    try {
      const viewer = { id: profileId, role: profileRole } as Profile;
      const t = await listTasks(viewer);
      setTasks(t);
    } finally {
      setLoading(false);
    }
  }, [profileId, profileRole]);

  useEffect(() => {
    const t = setTimeout(() => void loadData(), 0);
    const handler = () => void loadData();
    window.addEventListener('vistasat:demo-updated', handler);
    window.addEventListener('vistasat:notification-received', handler);
    return () => {
      clearTimeout(t);
      window.removeEventListener('vistasat:demo-updated', handler);
      window.removeEventListener('vistasat:notification-received', handler);
    };
  }, [loadData]);

  const isCoord = profile?.role === 'admin' || profile?.role === 'coordinator';

  const scopedTasks = useMemo(() => {
    if (!profile) return [];
    if (isCoord) return tasks;
    return tasks.filter((t) => t.assigned_to === profile.id);
  }, [tasks, isCoord, profile]);

  const unassignedPoolCount = useMemo(() => {
    if (isCoord) return 0;
    return tasks.filter((t) => !t.assigned_to && t.status === 'pending').length;
  }, [tasks, isCoord]);

  const metrics = useMemo(() => computeDashboardMetrics(scopedTasks), [scopedTasks]);

  const openTasks = useMemo(
    () => sortOpenTasksByPriorityAndAge(scopedTasks),
    [scopedTasks]
  );
  const scheduledInstallations = useMemo(
    () => getScheduledInstallations(scopedTasks),
    [scopedTasks]
  );
  const unscheduledInstallations = useMemo(
    () => getUnscheduledInstallations(scopedTasks),
    [scopedTasks]
  );

  const drilldownTasks = useMemo(() => {
    if (!activeKpi) return [];
    return filterTasksByKpi(scopedTasks, activeKpi);
  }, [scopedTasks, activeKpi]);

  const toggleKpi = (kpi: DashboardKpiFilter) => {
    setActiveKpi((prev) => (prev === kpi ? null : kpi));
  };

  if (!profile) return null;

  const todayFormatted = new Date().toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto overflow-x-hidden">
      {/* Cabecera Ejecutiva / Operativa */}
      <div className="bg-gradient-to-r from-navy to-petrol text-white rounded-md shadow-card p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 min-w-0">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-white/80">
            <span className="px-2 py-0.5 bg-magenta text-white rounded-xs">
              {isCoord ? 'Centro de Control SAT' : 'Mi Jornada en Campo'}
            </span>
            <span className="capitalize">{todayFormatted}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white leading-tight truncate">
            Hola, {profile.full_name}
          </h1>
          <p className="text-xs text-white/80">
            {loading
              ? 'Actualizando resumen operativo...'
              : isCoord
              ? `${metrics.activeCount} partes activos · ${metrics.scheduledInstallationsCount} inst. programadas · ${
                  metrics.overdueCount > 0
                    ? `${metrics.overdueCount} SLA vencido(s)`
                    : 'SLA al día'
                }`
              : `${metrics.activeCount} partes tuyos abiertos · ${metrics.scheduledInstallationsCount} inst. citadas · ${metrics.unscheduledInstallationsCount} sin fecha`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isCoord ? (
            <>
              {profile.role === 'admin' && (
                <Link href="/users">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="border-white/50 text-white hover:bg-white/10 dark:border-white/50"
                  >
                    <Users size={15} /> Usuarios
                  </Button>
                </Link>
              )}
              <Link href="/installations">
                <Button
                  variant="secondary"
                  size="sm"
                  className="border-white/50 text-white hover:bg-white/10 dark:border-white/50"
                >
                  <Calendar size={15} /> Instalaciones
                </Button>
              </Link>
              <Link href="/reports">
                <Button
                  variant="secondary"
                  size="sm"
                  className="border-white/50 text-white hover:bg-white/10 dark:border-white/50"
                >
                  <BarChart3 size={15} /> Informes
                </Button>
              </Link>
              <Link href="/tasks/new">
                <Button variant="accent" size="sm">
                  <PlusCircle size={15} /> Nueva Tarea
                </Button>
              </Link>
            </>
          ) : (
            <>
              <Link href="/tasks">
                <Button
                  variant="secondary"
                  size="sm"
                  className="border-white/50 text-white hover:bg-white/10 dark:border-white/50"
                >
                  Mis tareas <ArrowRight size={14} />
                </Button>
              </Link>
              <Link href="/installations">
                <Button
                  variant="secondary"
                  size="sm"
                  className="border-white/50 text-white hover:bg-white/10 dark:border-white/50"
                >
                  <Calendar size={15} /> Instalaciones
                </Button>
              </Link>
              <Link href="/tasks/new">
                <Button variant="accent" size="sm">
                  <PlusCircle size={15} /> Nueva Tarea
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Tarjetas KPI interactivas (pulsando cada una despliega su filtro inmediato) */}
      <div
        className={`grid gap-3 ${
          isCoord ? 'grid-cols-2 lg:grid-cols-5' : 'grid-cols-2 lg:grid-cols-4'
        }`}
      >
        <KPICard
          label={isCoord ? 'Pendientes' : 'Mis Pendientes'}
          sublabel="Por iniciar"
          value={loading ? '…' : String(metrics.pendingCount)}
          icon={<Clock size={18} />}
          colorClass="bg-petrol"
          active={activeKpi === 'pending'}
          onClick={() => toggleKpi('pending')}
        />

        <KPICard
          label="En Proceso"
          sublabel="Actualmente en curso"
          value={loading ? '…' : String(metrics.inProgressCount)}
          icon={<Wrench size={18} />}
          colorClass="bg-navy"
          active={activeKpi === 'in_progress'}
          onClick={() => toggleKpi('in_progress')}
        />

        <KPICard
          label="Urgentes / Alta"
          sublabel="Prioridad crítica y alta"
          value={loading ? '…' : String(metrics.urgentHighCount)}
          icon={<AlertTriangle size={18} />}
          colorClass="bg-magenta"
          active={activeKpi === 'urgent_high'}
          onClick={() => toggleKpi('urgent_high')}
        />

        {isCoord ? (
          <>
            <KPICard
              label="SLA en Riesgo"
              sublabel={
                loading
                  ? 'Calculando SLA…'
                  : metrics.overdueCount > 0
                  ? `${metrics.overdueCount} venc. · ${metrics.dueTodayCount} hoy`
                  : metrics.dueTodayCount > 0
                  ? `${metrics.dueTodayCount} vence(n) hoy`
                  : metrics.slaOnTrackPct !== null
                  ? `${metrics.slaOnTrackPct}% en plazo`
                  : 'Sin plazos activos'
              }
              value={loading ? '…' : String(metrics.slaRiskCount)}
              icon={<ShieldAlert size={18} />}
              colorClass={
                metrics.overdueCount > 0
                  ? 'bg-danger'
                  : metrics.dueTodayCount > 0
                  ? 'bg-amber-600'
                  : 'bg-success'
              }
              active={activeKpi === 'sla_risk'}
              onClick={() => toggleKpi('sla_risk')}
            />

            <KPICard
              label="Completadas"
              sublabel={
                loading
                  ? '…'
                  : `Cierre ${metrics.closeRate}% · Ø ${metrics.avgHoursFormatted}`
              }
              value={loading ? '…' : String(metrics.completedCount)}
              icon={<CheckCircle2 size={18} />}
              colorClass="bg-success"
              active={activeKpi === 'completed'}
              onClick={() => toggleKpi('completed')}
              className="col-span-2 lg:col-span-1"
            />
          </>
        ) : metrics.slaRiskCount > 0 ? (
          <KPICard
            label="SLA en Riesgo"
            sublabel={
              metrics.overdueCount > 0
                ? `${metrics.overdueCount} vencido(s) · ${metrics.dueTodayCount} hoy`
                : `${metrics.dueTodayCount} vence(n) hoy`
            }
            value={loading ? '…' : String(metrics.slaRiskCount)}
            icon={<ShieldAlert size={18} />}
            colorClass={metrics.overdueCount > 0 ? 'bg-danger' : 'bg-amber-600'}
            active={activeKpi === 'sla_risk'}
            onClick={() => toggleKpi('sla_risk')}
          />
        ) : (
          <KPICard
            label="Completadas"
            sublabel={
              loading
                ? '…'
                : `Cierre ${metrics.closeRate}% · Ø ${metrics.avgHoursFormatted}`
            }
            value={loading ? '…' : String(metrics.completedCount)}
            icon={<CheckCircle2 size={18} />}
            colorClass="bg-success"
            active={activeKpi === 'completed'}
            onClick={() => toggleKpi('completed')}
          />
        )}
      </div>

      {/* Drill-down interactivo del KPI seleccionado */}
      {activeKpi && (
        <KpiDrilldownPanel
          activeKpi={activeKpi}
          tasks={drilldownTasks}
          isCoord={isCoord}
          onClose={() => setActiveKpi(null)}
        />
      )}

      {/* Gráficas y Tiempos Medios por Tipo (solo Administrador / Coordinador) */}
      {isCoord && !loading && (
        <DashboardCharts tasks={scopedTasks} onSelectKpi={toggleKpi} />
      )}

      {/* Bloques operativos inferiores (en Técnico van justo arriba tras los KPIs) */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-36 bg-white dark:bg-surface rounded-md animate-pulse shadow-card"
            />
          ))}
        </div>
      ) : (
        <DashboardOperationalLists
          openTasks={openTasks}
          scheduledInstallations={scheduledInstallations}
          unscheduledInstallations={unscheduledInstallations}
          isCoord={isCoord}
          unassignedPoolCount={unassignedPoolCount}
        />
      )}
    </div>
  );
}

function KPICard({
  label,
  sublabel,
  value,
  icon,
  colorClass,
  active,
  onClick,
  className = '',
}: {
  label: string;
  sublabel: string;
  value: string;
  icon: React.ReactNode;
  colorClass: string;
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`text-left bg-white dark:bg-surface rounded-md shadow-card p-3.5 sm:p-4 border-2 transition-all cursor-pointer min-w-0 flex flex-col justify-between gap-2 ${
        active
          ? 'border-navy dark:border-sky-400 ring-2 ring-navy/20 dark:ring-sky-400/20'
          : 'border-border/50 hover:border-navy/40 dark:hover:border-sky-400/40'
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-2 w-full">
        <div className={`inline-flex p-2 rounded-sm ${colorClass} text-white flex-shrink-0`}>
          {icon}
        </div>
        <span
          className={`inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-xs ${
            active
              ? 'bg-navy text-white dark:bg-sky-500 dark:text-slate-950'
              : 'text-mid-grey bg-off-white'
          }`}
        >
          {active ? (
            <>
              Activo <ChevronUp size={11} />
            </>
          ) : (
            <>
              Ver <ChevronDown size={11} />
            </>
          )}
        </span>
      </div>

      <div className="min-w-0">
        <div className="text-2xl font-extrabold text-charcoal leading-none">{value}</div>
        <div className="text-xs font-bold text-charcoal mt-1.5 leading-snug truncate">
          {label}
        </div>
        <div className="text-[11px] text-mid-grey mt-0.5 truncate">{sublabel}</div>
      </div>
    </button>
  );
}
