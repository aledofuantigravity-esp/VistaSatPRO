'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Clock, Layers, ShieldCheck, Timer, TrendingUp } from 'lucide-react';
import { useTheme } from '@/hooks/useTheme';
import {
  computeResolutionStatsByType,
  isOpenTask,
  type DashboardKpiFilter,
} from '@/lib/dashboard-helpers';
import { getSlaStatus } from '@/lib/sla';
import {
  resolveTaskType,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  TASK_TYPE_META,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from '@/types/database';

interface DashboardChartsProps {
  tasks: Task[];
  onSelectKpi?: (kpi: DashboardKpiFilter) => void;
}

type MobileChartTab = 'timeline' | 'types' | 'status' | 'sla';

const TYPE_CARD_LABEL: Record<TaskType, string> = {
  installation: 'Instalaciones',
  rma_incident: 'Incidencias RMA',
  cxc_incident: 'Incidencias CXC',
  task: 'Tareas',
};

const TYPE_CHART_COLORS: Record<TaskType, string> = {
  installation: '#004876',
  rma_incident: '#002169',
  cxc_incident: '#CF095E',
  task: '#5E3654',
};

const TYPE_CHART_COLORS_DARK: Record<TaskType, string> = {
  installation: '#38BDF8',
  rma_incident: '#818CF8',
  cxc_incident: '#F472B6',
  task: '#C084FC',
};

export function DashboardCharts({ tasks, onSelectKpi }: DashboardChartsProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);
  const [mobileTab, setMobileTab] = useState<MobileChartTab>('timeline');
  const [typeScope, setTypeScope] = useState<'active' | 'all'>('active');

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => {
      setIsDesktop(mq.matches);
      setMounted(true);
    };
    const t = setTimeout(sync, 0);
    mq.addEventListener('change', sync);
    return () => {
      clearTimeout(t);
      mq.removeEventListener('change', sync);
    };
  }, []);

  const isDark = resolvedTheme === 'dark';
  const axisStroke = isDark ? '#94A3B8' : '#666666';
  const gridStroke = isDark ? '#2A354D' : '#E5E7EB';
  const tooltipStyle = {
    backgroundColor: isDark ? '#182032' : '#FFFFFF',
    borderColor: isDark ? '#2A354D' : '#DDDDDD',
    color: isDark ? '#F1F5F9' : '#222222',
    fontSize: '12px',
    borderRadius: '6px',
  };

  // 0. Estadística de Tiempo Medio de Cierre diferenciado por Tipo de Parte
  const resolutionStats = useMemo(() => computeResolutionStatsByType(tasks), [tasks]);
  const maxAvgHours = useMemo(() => {
    const values = resolutionStats.byType
      .map((s) => s.avgHours ?? 0)
      .filter((v) => v > 0);
    return values.length > 0 ? Math.max(...values) : 1;
  }, [resolutionStats]);

  // 1. Evolución últimos 14 días (abiertos vs. completados)
  const timelineData = useMemo(() => {
    const days: Array<{ key: string; label: string; creados: number; cerrados: number }> = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
      days.push({ key, label, creados: 0, cerrados: 0 });
    }
    const byKey = new Map(days.map((d) => [d.key, d]));
    for (const t of tasks) {
      const cBucket = byKey.get(t.created_at.slice(0, 10));
      if (cBucket) cBucket.creados += 1;
      if (t.completed_at) {
        const dBucket = byKey.get(t.completed_at.slice(0, 10));
        if (dBucket) dBucket.cerrados += 1;
      }
    }
    return days;
  }, [tasks]);

  const timelineTotals = useMemo(() => {
    const opened = timelineData.reduce((acc, d) => acc + d.creados, 0);
    const closed = timelineData.reduce((acc, d) => acc + d.cerrados, 0);
    return { opened, closed, net: closed - opened };
  }, [timelineData]);

  // 2. Distribución por Tipo de Parte (Donut)
  const typeBreakdown = useMemo(() => {
    const source = typeScope === 'active' ? tasks.filter(isOpenTask) : tasks;
    const total = source.length;
    const order: TaskType[] = ['installation', 'rma_incident', 'cxc_incident', 'task'];
    const palette = isDark ? TYPE_CHART_COLORS_DARK : TYPE_CHART_COLORS;

    return {
      total,
      items: order.map((tt) => {
        const count = source.filter((t) => resolveTaskType(t) === tt).length;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return {
          taskType: tt,
          name: TASK_TYPE_META[tt].label,
          shortName: TASK_TYPE_META[tt].shortLabel,
          count,
          pct,
          color: palette[tt],
        };
      }),
    };
  }, [tasks, typeScope, isDark]);

  // 3. Partes por Estado (Barras horizontales limpias sin rotación de etiquetas)
  const statusData = useMemo(() => {
    const statuses: TaskStatus[] = [
      'pending',
      'assigned',
      'en_route',
      'in_progress',
      'on_hold',
      'completed',
      'cancelled',
    ];
    return statuses.map((st) => ({
      name: TASK_STATUS_META[st].label,
      count: tasks.filter((t) => t.status === st).length,
      color:
        isDark && st === 'en_route'
          ? '#818CF8'
          : isDark && st === 'cancelled'
          ? '#64748B'
          : TASK_STATUS_META[st].color,
    }));
  }, [tasks, isDark]);

  // 4. Semáforo SLA y Prioridades sobre partes activos
  const slaAndPriority = useMemo(() => {
    const active = tasks.filter(isOpenTask);
    let overdue = 0;
    let dueToday = 0;
    let onTrack = 0;
    let withoutDue = 0;

    for (const t of active) {
      const sla = getSlaStatus(t);
      if (!sla) withoutDue++;
      else if (sla.state === 'overdue') overdue++;
      else if (sla.state === 'due_today') dueToday++;
      else onTrack++;
    }

    const totalActive = active.length;
    const priorities: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];
    const byPriority = priorities.map((pr) => {
      const count = active.filter((t) => t.priority === pr).length;
      const pct = totalActive > 0 ? Math.round((count / totalActive) * 100) : 0;
      return {
        priority: pr,
        label: TASK_PRIORITY_META[pr].label,
        count,
        pct,
        color: TASK_PRIORITY_META[pr].dotColor,
      };
    });

    return {
      totalActive,
      overdue,
      dueToday,
      onTrack,
      withoutDue,
      byPriority,
    };
  }, [tasks]);

  const showCard = (id: MobileChartTab) => isDesktop || mobileTab === id;

  return (
    <div className="space-y-4 min-w-0">
      {/* Estadística destacada: Tiempo Medio de Cierre por Tipo de Parte */}
      <section className="bg-white dark:bg-surface rounded-md shadow-card p-4 sm:p-5 border border-border/60 space-y-3.5 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 min-w-0">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-charcoal flex items-center gap-2">
              <Timer size={18} className="text-magenta flex-shrink-0" />
              Tiempo Medio de Cierre por Tipo de Parte
            </h2>
            <p className="text-xs text-mid-grey mt-0.5">
              Promedio real desde la apertura hasta el cierre en partes completados
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-off-white border border-border rounded-sm self-start sm:self-auto">
            <Clock size={14} className="text-navy dark:text-sky-300 flex-shrink-0" />
            <span className="text-xs font-bold text-charcoal">
              Media global: {resolutionStats.global.formatted}
            </span>
            <span className="text-[11px] text-mid-grey">
              ({resolutionStats.global.count} cierres)
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
          {resolutionStats.byType.map((item) => {
            const barPct =
              item.avgHours !== null && maxAvgHours > 0
                ? Math.max(8, Math.round((item.avgHours / maxAvgHours) * 100))
                : 0;
            const palette = isDark ? TYPE_CHART_COLORS_DARK : TYPE_CHART_COLORS;
            const barColor = palette[item.taskType];

            return (
              <div
                key={item.taskType}
                className="p-3 sm:p-3.5 bg-off-white rounded-sm border border-border/80 space-y-2 min-w-0"
              >
                <div className="flex items-center justify-between gap-1.5 min-w-0">
                  <span className="text-xs font-bold text-dark-grey truncate">
                    {TYPE_CARD_LABEL[item.taskType]}
                  </span>
                  <span
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: barColor }}
                  />
                </div>

                <div className="text-lg sm:text-xl font-extrabold text-charcoal leading-none">
                  {item.formatted}
                </div>

                <div className="h-1.5 w-full bg-border/70 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${barPct}%`,
                      backgroundColor: barColor,
                    }}
                  />
                </div>

                <p className="text-[11px] text-mid-grey font-medium">
                  {item.count === 0
                    ? 'Aún sin cierres'
                    : item.count === 1
                    ? '1 parte cerrado'
                    : `${item.count} partes cerrados`}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Selector de gráfica en smartphone para evitar scroll infinito */}
      {!isDesktop && (
        <div
          className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-white dark:bg-surface p-2 rounded-md border border-border/60 shadow-card"
          role="tablist"
          aria-label="Selector de gráficas"
        >
          {(
            [
              { id: 'timeline', label: 'Evolución 14d' },
              { id: 'types', label: 'Por Tipo' },
              { id: 'status', label: 'Por Estado' },
              { id: 'sla', label: 'SLA y Prioridad' },
            ] as Array<{ id: MobileChartTab; label: string }>
          ).map((tabItem) => (
            <button
              key={tabItem.id}
              type="button"
              role="tab"
              aria-selected={mobileTab === tabItem.id}
              onClick={() => setMobileTab(tabItem.id)}
              className={`py-2 px-2 text-xs font-bold rounded-sm transition-colors text-center ${
                mobileTab === tabItem.id
                  ? 'bg-navy text-white'
                  : 'bg-off-white text-dark-grey hover:bg-navy/5 dark:hover:bg-white/10'
              }`}
            >
              {tabItem.label}
            </button>
          ))}
        </div>
      )}

      {/* Rejilla de 4 Gráficas Profesionales (sin comparativa Top 5 técnicos) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
        {/* 1. Evolución últimos 14 días */}
        {showCard('timeline') && (
          <div className="bg-white dark:bg-surface rounded-md shadow-card p-4 sm:p-5 border border-border/60 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
              <div>
                <h2 className="text-base font-bold text-charcoal flex items-center gap-2">
                  <TrendingUp size={17} className="text-navy dark:text-sky-300" />
                  Evolución Últimos 14 Días
                </h2>
                <p className="text-xs text-mid-grey mt-0.5">
                  Partes abiertos ({timelineTotals.opened}) vs. completados ({timelineTotals.closed})
                </p>
              </div>
              <span
                className={`px-2 py-0.5 text-[11px] font-bold rounded-xs ${
                  timelineTotals.net >= 0
                    ? 'bg-success/15 text-success dark:bg-emerald-500/20 dark:text-emerald-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                }`}
              >
                Balance: {timelineTotals.net >= 0 ? `+${timelineTotals.net}` : timelineTotals.net}
              </span>
            </div>

            <div className="h-56 w-full min-w-0">
              {mounted ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <AreaChart
                    data={timelineData}
                    margin={{ top: 8, right: 8, left: -20, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisStroke }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: axisStroke }} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area
                      type="monotone"
                      dataKey="creados"
                      name="Abiertos"
                      stroke={isDark ? '#38BDF8' : '#002169'}
                      fill={isDark ? '#38BDF8' : '#002169'}
                      fillOpacity={isDark ? 0.25 : 0.16}
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="cerrados"
                      name="Completados"
                      stroke={isDark ? '#34D399' : '#1A7A4A'}
                      fill={isDark ? '#34D399' : '#1A7A4A'}
                      fillOpacity={isDark ? 0.25 : 0.18}
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full bg-off-white rounded-sm animate-pulse" />
              )}
            </div>
          </div>
        )}

        {/* 2. Distribución por Tipo de Parte (Donut + Leyenda) */}
        {showCard('types') && (
          <div className="bg-white dark:bg-surface rounded-md shadow-card p-4 sm:p-5 border border-border/60 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
              <div>
                <h2 className="text-base font-bold text-charcoal flex items-center gap-2">
                  <Layers size={17} className="text-magenta" />
                  Distribución por Tipo de Parte
                </h2>
                <p className="text-xs text-mid-grey mt-0.5">
                  Reparto operativo entre Instalación, RMA, CXC y Tareas
                </p>
              </div>
              <div className="inline-flex border border-border rounded-xs overflow-hidden text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setTypeScope('active')}
                  className={`px-2.5 py-1 ${
                    typeScope === 'active'
                      ? 'bg-navy text-white'
                      : 'bg-off-white text-mid-grey hover:text-charcoal'
                  }`}
                >
                  Activos
                </button>
                <button
                  type="button"
                  onClick={() => setTypeScope('all')}
                  className={`px-2.5 py-1 ${
                    typeScope === 'all'
                      ? 'bg-navy text-white'
                      : 'bg-off-white text-mid-grey hover:text-charcoal'
                  }`}
                >
                  Todos
                </button>
              </div>
            </div>

            {typeBreakdown.total === 0 ? (
              <div className="h-56 flex items-center justify-center text-sm text-mid-grey bg-off-white rounded-sm">
                Sin partes en este filtro.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center min-w-0">
                <div className="h-52 w-full min-w-0">
                  {mounted ? (
                    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                      <PieChart>
                        <Pie
                          data={typeBreakdown.items.filter((i) => i.count > 0)}
                          dataKey="count"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={46}
                          outerRadius={74}
                          paddingAngle={3}
                        >
                          {typeBreakdown.items
                            .filter((i) => i.count > 0)
                            .map((entry) => (
                              <Cell key={entry.taskType} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full bg-off-white rounded-sm animate-pulse" />
                  )}
                </div>

                <div className="space-y-2 min-w-0">
                  {typeBreakdown.items.map((item) => (
                    <div
                      key={item.taskType}
                      className="flex items-center justify-between gap-2 p-2 bg-off-white rounded-xs border border-border/70 text-xs"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="font-semibold text-charcoal truncate">{item.name}</span>
                      </span>
                      <span className="font-extrabold text-charcoal flex-shrink-0">
                        {item.count}{' '}
                        <span className="text-[11px] font-normal text-mid-grey">
                          ({item.pct}%)
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. Partes por Estado (Barras horizontales limpias, legibles en móvil) */}
        {showCard('status') && (
          <div className="bg-white dark:bg-surface rounded-md shadow-card p-4 sm:p-5 border border-border/60 min-w-0">
            <h2 className="text-base font-bold text-charcoal mb-0.5">Partes por Estado</h2>
            <p className="text-xs text-mid-grey mb-3">
              Distribución actual de la carga operativa
            </p>
            <div className="h-56 w-full min-w-0">
              {mounted ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                  <BarChart
                    data={statusData}
                    layout="vertical"
                    margin={{ top: 4, right: 16, left: 6, bottom: 4 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                    <XAxis
                      type="number"
                      allowDecimals={false}
                      tick={{ fontSize: 11, fill: axisStroke }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={86}
                      tick={{ fontSize: 11, fill: axisStroke }}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Bar dataKey="count" name="Partes" radius={[0, 4, 4, 0]}>
                      {statusData.map((entry, idx) => (
                        <Cell key={idx} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full bg-off-white rounded-sm animate-pulse" />
              )}
            </div>
          </div>
        )}

        {/* 4. Salud SLA y Prioridades */}
        {showCard('sla') && (
          <div className="bg-white dark:bg-surface rounded-md shadow-card p-4 sm:p-5 border border-border/60 space-y-4 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-charcoal flex items-center gap-2">
                  <ShieldCheck size={17} className="text-success dark:text-emerald-300" />
                  Salud SLA y Prioridades
                </h2>
                <p className="text-xs text-mid-grey mt-0.5">
                  Control de vencimientos y urgencia sobre {slaAndPriority.totalActive} partes activos
                </p>
              </div>
              {onSelectKpi && slaAndPriority.overdue + slaAndPriority.dueToday > 0 && (
                <button
                  type="button"
                  onClick={() => onSelectKpi('sla_risk')}
                  className="text-[11px] font-bold text-danger dark:text-red-300 hover:underline uppercase"
                >
                  Ver en riesgo →
                </button>
              )}
            </div>

            {/* Barra segmentada SLA */}
            <div className="space-y-2">
              <div className="h-3 w-full bg-off-white rounded-full overflow-hidden flex border border-border/60">
                {slaAndPriority.totalActive > 0 && (
                  <>
                    {slaAndPriority.overdue > 0 && (
                      <div
                        className="bg-danger h-full"
                        style={{
                          width: `${(slaAndPriority.overdue / slaAndPriority.totalActive) * 100}%`,
                        }}
                        title={`Vencidos: ${slaAndPriority.overdue}`}
                      />
                    )}
                    {slaAndPriority.dueToday > 0 && (
                      <div
                        className="bg-amber-500 h-full"
                        style={{
                          width: `${(slaAndPriority.dueToday / slaAndPriority.totalActive) * 100}%`,
                        }}
                        title={`Vencen hoy: ${slaAndPriority.dueToday}`}
                      />
                    )}
                    {slaAndPriority.onTrack > 0 && (
                      <div
                        className="bg-success h-full"
                        style={{
                          width: `${(slaAndPriority.onTrack / slaAndPriority.totalActive) * 100}%`,
                        }}
                        title={`En plazo: ${slaAndPriority.onTrack}`}
                      />
                    )}
                    {slaAndPriority.withoutDue > 0 && (
                      <div
                        className="bg-mid-grey/40 h-full"
                        style={{
                          width: `${(slaAndPriority.withoutDue / slaAndPriority.totalActive) * 100}%`,
                        }}
                        title={`Sin fecha límite: ${slaAndPriority.withoutDue}`}
                      />
                    )}
                  </>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                <div className="p-2 bg-off-white rounded-xs border border-border/70">
                  <span className="text-mid-grey block">Vencidos</span>
                  <strong className="text-sm text-danger dark:text-red-300">
                    {slaAndPriority.overdue}
                  </strong>
                </div>
                <div className="p-2 bg-off-white rounded-xs border border-border/70">
                  <span className="text-mid-grey block">Vencen hoy</span>
                  <strong className="text-sm text-amber-700 dark:text-amber-300">
                    {slaAndPriority.dueToday}
                  </strong>
                </div>
                <div className="p-2 bg-off-white rounded-xs border border-border/70">
                  <span className="text-mid-grey block">En plazo</span>
                  <strong className="text-sm text-success dark:text-emerald-300">
                    {slaAndPriority.onTrack}
                  </strong>
                </div>
                <div className="p-2 bg-off-white rounded-xs border border-border/70">
                  <span className="text-mid-grey block">Sin límite</span>
                  <strong className="text-sm text-charcoal">
                    {slaAndPriority.withoutDue}
                  </strong>
                </div>
              </div>
            </div>

            {/* Desglose por prioridad en partes activos */}
            <div className="space-y-2 pt-1 border-t border-border/70">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-charcoal">Carga por prioridad (activos)</span>
                {onSelectKpi && (
                  <button
                    type="button"
                    onClick={() => onSelectKpi('urgent_high')}
                    className="text-[11px] font-bold text-magenta hover:underline"
                  >
                    Filtrar Urgentes / Alta →
                  </button>
                )}
              </div>

              <div className="space-y-1.5">
                {slaAndPriority.byPriority.map((pr) => (
                  <div key={pr.priority} className="flex items-center gap-2.5 text-xs">
                    <span className="w-16 font-semibold text-dark-grey flex items-center gap-1.5 flex-shrink-0">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: pr.color }}
                      />
                      {pr.label}
                    </span>
                    <div className="flex-1 h-2 bg-off-white rounded-full overflow-hidden border border-border/60">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pr.pct}%`,
                          backgroundColor: pr.color,
                        }}
                      />
                    </div>
                    <span className="w-12 text-right font-bold text-charcoal flex-shrink-0">
                      {pr.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
