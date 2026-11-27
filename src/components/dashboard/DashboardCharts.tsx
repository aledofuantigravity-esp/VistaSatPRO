'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '@/hooks/useTheme';
import {
  TASK_STATUS_META,
  type Profile,
  type Task,
  type TaskStatus,
} from '@/types/database';

interface DashboardChartsProps {
  tasks: Task[];
  profiles: Profile[];
  isCoord: boolean;
}

export function DashboardCharts({ tasks, profiles, isCoord }: DashboardChartsProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  const isDark = resolvedTheme === 'dark';
  const axisStroke = isDark ? '#94A3B8' : '#666666';
  const gridStroke = isDark ? '#2A354D' : '#E5E7EB';
  const tooltipStyle = {
    backgroundColor: isDark ? '#182032' : '#FFFFFF',
    borderColor: isDark ? '#2A354D' : '#DDDDDD',
    color: isDark ? '#F1F5F9' : '#222222',
    fontSize: '12px',
  };

  // 1. Datos por estado
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
      color: TASK_STATUS_META[st].color,
    }));
  }, [tasks]);

  // 2. Evolución últimos 14 días (creados vs completados)
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
      const cKey = t.created_at.slice(0, 10);
      const cBucket = byKey.get(cKey);
      if (cBucket) cBucket.creados += 1;

      if (t.completed_at) {
        const dKey = t.completed_at.slice(0, 10);
        const dBucket = byKey.get(dKey);
        if (dBucket) dBucket.cerrados += 1;
      }
    }
    return days;
  }, [tasks]);

  // 3. Top 5 técnicos por partes completados y tiempo medio
  const topTechs = useMemo(() => {
    if (!isCoord) return [];
    return profiles
      .filter((p) => p.role === 'technician' && p.is_active)
      .map((tech) => {
        const assigned = tasks.filter((t) => t.assigned_to === tech.id);
        const completed = assigned.filter((t) => t.status === 'completed');
        const open = assigned.filter(
          (t) => t.status !== 'completed' && t.status !== 'cancelled'
        ).length;
        const avgHours =
          completed.length > 0
            ? Number(
                (
                  completed.reduce((acc, t) => {
                    const end = t.completed_at ? new Date(t.completed_at).getTime() : Date.now();
                    return (
                      acc + Math.max(0.1, (end - new Date(t.created_at).getTime()) / 3600000)
                    );
                  }, 0) / completed.length
                ).toFixed(1)
              )
            : null;
        return {
          id: tech.id,
          name: tech.full_name,
          shortName: tech.full_name.split(' ')[0],
          completed: completed.length,
          open,
          avgHours,
        };
      })
      .sort((a, b) => b.completed - a.completed || b.open - a.open)
      .slice(0, 5);
  }, [isCoord, profiles, tasks]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gráfico de barras: Partes por estado */}
        <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 border border-border/60">
          <h2 className="text-base font-bold text-charcoal mb-1">Partes por Estado</h2>
          <p className="text-xs text-mid-grey mb-4">Distribución actual de la carga SAT</p>
          <div className="h-60 w-full">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <BarChart data={statusData} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: axisStroke }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    height={48}
                  />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: axisStroke }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="Partes" radius={[4, 4, 0, 0]}>
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

        {/* Gráfico de evolución: Últimos 14 días */}
        <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 border border-border/60">
          <h2 className="text-base font-bold text-charcoal mb-1">
            Evolución Últimos 14 Días
          </h2>
          <p className="text-xs text-mid-grey mb-4">Partes abiertos vs. completados por día</p>
          <div className="h-60 w-full">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                <AreaChart data={timelineData} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: axisStroke }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: axisStroke }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="creados"
                    name="Abiertos"
                    stroke="#002169"
                    fill="#002169"
                    fillOpacity={isDark ? 0.35 : 0.18}
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="cerrados"
                    name="Completados"
                    stroke="#1A7A4A"
                    fill="#1A7A4A"
                    fillOpacity={isDark ? 0.35 : 0.2}
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full bg-off-white rounded-sm animate-pulse" />
            )}
          </div>
        </div>
      </div>

      {/* Top 5 técnicos (solo coordinadores/admin) */}
      {isCoord && (
        <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 border border-border/60">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 mb-4">
            <div>
              <h2 className="text-base font-bold text-charcoal">
                Top 5 Técnicos · Partes Completados y Tiempo Medio
              </h2>
              <p className="text-xs text-mid-grey">
                Comparativa de cierres frente a carga activa actual
              </p>
            </div>
          </div>
          {topTechs.length === 0 ? (
            <p className="text-sm text-mid-grey">No hay técnicos activos registrados.</p>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-center">
              <div className="h-52 w-full">
                {mounted ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart
                      data={topTechs}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 10, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: axisStroke }} />
                      <YAxis
                        type="category"
                        dataKey="shortName"
                        width={76}
                        tick={{ fontSize: 11, fill: axisStroke }}
                      />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="completed" name="Completados" fill="#1A7A4A" radius={[0, 4, 4, 0]} />
                      <Bar dataKey="open" name="Activos" fill="#CF095E" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full bg-off-white rounded-sm animate-pulse" />
                )}
              </div>

              <div className="space-y-2.5">
                {topTechs.map((row, idx) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between p-3 bg-off-white rounded-sm border-l-4 border-navy"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-charcoal truncate">
                        #{idx + 1} · {row.name}
                      </p>
                      <p className="text-xs text-mid-grey">
                        {row.completed} cerrados · {row.open} en curso
                      </p>
                    </div>
                    <span className="text-xs font-extrabold text-navy dark:text-sky-300 bg-white dark:bg-surface px-2.5 py-1 border border-border rounded-xs">
                      {row.avgHours !== null ? `Ø ${row.avgHours}h` : 'Sin cierres'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
