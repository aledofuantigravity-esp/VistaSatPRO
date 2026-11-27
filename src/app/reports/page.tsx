'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, FileDown, RotateCcw, Shield } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { downloadCsv } from '@/lib/csv';
import { listCustomers, listProfiles, listTasks } from '@/lib/data-service';
import { downloadReportPDF } from '@/lib/pdf-generator';
import {
  TASK_STATUS_META,
  type Customer,
  type Profile,
  type Task,
  type TaskStatus,
} from '@/types/database';

export default function ReportsPage() {
  return (
    <AppShell>
      <ReportsContent />
    </AppShell>
  );
}

function ReportsContent() {
  const { profile } = useAuth();
  const { resolvedTheme } = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  // Filtros avanzados (M9)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [techFilter, setTechFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(t);
  }, []);

  const profileId = profile?.id;
  const profileRole = profile?.role;

  const load = useCallback(async () => {
    if (!profileId || !profileRole) return;
    await Promise.resolve();
    setLoading(true);
    try {
      const viewer = { id: profileId, role: profileRole } as Profile;
      const [t, p, c] = await Promise.all([
        listTasks(viewer),
        listProfiles(),
        listCustomers(),
      ]);
      setTasks(t);
      setProfiles(p);
      setCustomers(c);
    } finally {
      setLoading(false);
    }
  }, [profileId, profileRole]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (dateFrom && t.created_at.slice(0, 10) < dateFrom) return false;
      if (dateTo && t.created_at.slice(0, 10) > dateTo) return false;
      if (techFilter !== 'all') {
        if (techFilter === 'unassigned' && t.assigned_to !== null) return false;
        if (techFilter !== 'unassigned' && t.assigned_to !== techFilter) return false;
      }
      if (customerFilter !== 'all' && t.customer_id !== customerFilter) return false;
      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      return true;
    });
  }, [tasks, dateFrom, dateTo, techFilter, customerFilter, statusFilter]);

  const kpis = useMemo(() => {
    const completed = filteredTasks.filter((t) => t.status === 'completed');
    const open = filteredTasks.filter(
      (t) => t.status !== 'completed' && t.status !== 'cancelled'
    );
    const closeRate =
      filteredTasks.length > 0
        ? Math.round((completed.length / filteredTasks.length) * 100)
        : 0;
    const completedWithTs = completed.filter((t) => t.completed_at);
    const avgHours =
      completedWithTs.length > 0
        ? (
            completedWithTs.reduce((acc, t) => {
              const end = new Date(t.completed_at!).getTime();
              return (
                acc + Math.max(0.1, (end - new Date(t.created_at).getTime()) / 3600000)
              );
            }, 0) / completedWithTs.length
          ).toFixed(1)
        : '—';

    return {
      total: filteredTasks.length,
      completed: completed.length,
      open: open.length,
      closeRate,
      avgHours,
    };
  }, [filteredTasks]);

  const techStats = useMemo(() => {
    return profiles
      .filter((p) => p.role === 'technician')
      .filter((p) => techFilter === 'all' || p.id === techFilter)
      .map((tech) => {
        const assigned = filteredTasks.filter((t) => t.assigned_to === tech.id);
        const completed = assigned.filter((t) => t.status === 'completed');
        const avgHours =
          completed.length > 0
            ? (
                completed.reduce((acc, t) => {
                  const end = t.completed_at ? new Date(t.completed_at).getTime() : Date.now();
                  return (
                    acc + Math.max(0.1, (end - new Date(t.created_at).getTime()) / 3600000)
                  );
                }, 0) / completed.length
              ).toFixed(1)
            : '—';
        const rate =
          assigned.length > 0 ? Math.round((completed.length / assigned.length) * 100) : 0;
        return {
          tech,
          shortName: tech.full_name.split(' ')[0],
          total: assigned.length,
          completed: completed.length,
          avgHours,
          rate,
        };
      });
  }, [profiles, filteredTasks, techFilter]);

  const topCustomers = useMemo(() => {
    return customers
      .filter((c) => customerFilter === 'all' || c.id === customerFilter)
      .map((c) => {
        const cTasks = filteredTasks.filter((t) => t.customer_id === c.id);
        const open = cTasks.filter(
          (t) => t.status !== 'completed' && t.status !== 'cancelled'
        ).length;
        return { customer: c, total: cTasks.length, open };
      })
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [customers, filteredTasks, customerFilter]);

  if (!profile) return null;
  if (profile.role === 'technician') {
    return (
      <div className="p-6 text-center">
        <Shield size={40} className="text-danger mx-auto mb-2" />
        <h1 className="text-lg font-bold text-charcoal">Acceso restringido</h1>
      </div>
    );
  }

  const technicians = profiles.filter((p) => p.role === 'technician');
  const hasFilters =
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    techFilter !== 'all' ||
    customerFilter !== 'all' ||
    statusFilter !== 'all';

  const resetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setTechFilter('all');
    setCustomerFilter('all');
    setStatusFilter('all');
  };

  const exportSummaryCSV = () => {
    const headers = [
      'Técnico',
      'Partes Totales',
      'Completados',
      'Tasa Cierre %',
      'Tiempo Medio (h)',
    ];
    const rows = techStats.map((r) => [
      r.tech.full_name,
      String(r.total),
      String(r.completed),
      `${r.rate}%`,
      String(r.avgHours),
    ]);
    downloadCsv(
      `VistaSatPRO_informe_tecnicos_${new Date().toISOString().slice(0, 10)}.csv`,
      headers,
      rows
    );
  };

  const handleExportPDF = () => {
    const techLabel =
      techFilter === 'all'
        ? 'Todos'
        : techFilter === 'unassigned'
        ? 'Sin asignar'
        : profiles.find((p) => p.id === techFilter)?.full_name || 'Todos';
    const custLabel =
      customerFilter === 'all'
        ? 'Todos'
        : customers.find((c) => c.id === customerFilter)?.name || 'Todos';
    const statusLabel =
      statusFilter === 'all' ? 'Todos' : TASK_STATUS_META[statusFilter].label;

    downloadReportPDF({
      filters: {
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        technicianName: techLabel,
        customerName: custLabel,
        statusLabel,
      },
      kpis,
      techStats: techStats.map((r) => ({
        name: r.tech.full_name,
        total: r.total,
        completed: r.completed,
        rate: r.rate,
        avgHours: r.avgHours,
      })),
      topCustomers: topCustomers.map((r) => ({
        name: r.customer.name,
        total: r.total,
        open: r.open,
      })),
      tasks: filteredTasks,
    });
  };

  const isDark = resolvedTheme === 'dark';
  const axisStroke = isDark ? '#94A3B8' : '#666666';
  const gridStroke = isDark ? '#2A354D' : '#E5E7EB';

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-charcoal flex items-center gap-2">
            <BarChart3 size={22} className="text-navy dark:text-sky-300" /> Informes Operativos SAT
          </h1>
          <p className="text-xs text-mid-grey mt-0.5">
            {filteredTasks.length} parte{filteredTasks.length === 1 ? '' : 's'} en el período seleccionado
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={exportSummaryCSV}>
            <Download size={15} /> CSV Técnicos
          </Button>
          <Button variant="accent" size="sm" onClick={handleExportPDF}>
            <FileDown size={15} /> Exportar PDF
          </Button>
        </div>
      </div>

      {/* Filtros avanzados (M9) */}
      <div className="bg-white dark:bg-surface rounded-md shadow-card p-4 border border-border/60 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase text-mid-grey mb-1">
              Desde
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-2.5 py-2 bg-bg-input border border-border text-xs text-charcoal"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-mid-grey mb-1">
              Hasta
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-2.5 py-2 bg-bg-input border border-border text-xs text-charcoal"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-mid-grey mb-1">
              Técnico
            </label>
            <select
              value={techFilter}
              onChange={(e) => setTechFilter(e.target.value)}
              className="w-full px-2.5 py-2 bg-bg-input border border-border text-xs text-charcoal"
            >
              <option value="all">Todos</option>
              <option value="unassigned">Sin asignar</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-mid-grey mb-1">
              Cliente
            </label>
            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              className="w-full px-2.5 py-2 bg-bg-input border border-border text-xs text-charcoal"
            >
              <option value="all">Todos</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-mid-grey mb-1">
              Estado
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
              className="w-full px-2.5 py-2 bg-bg-input border border-border text-xs text-charcoal"
            >
              <option value="all">Todos</option>
              {Object.entries(TASK_STATUS_META).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        {hasFilters && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-xs font-bold text-magenta hover:underline"
            >
              <RotateCcw size={13} /> Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* KPIs del período */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-surface rounded-md shadow-card p-4 border-l-4 border-navy">
          <p className="text-xs font-bold text-mid-grey uppercase">Partes Filtrados</p>
          <p className="text-2xl font-bold text-charcoal mt-1">{kpis.total}</p>
        </div>
        <div className="bg-white dark:bg-surface rounded-md shadow-card p-4 border-l-4 border-success">
          <p className="text-xs font-bold text-mid-grey uppercase">Completados</p>
          <p className="text-2xl font-bold text-success mt-1">{kpis.completed}</p>
        </div>
        <div className="bg-white dark:bg-surface rounded-md shadow-card p-4 border-l-4 border-magenta">
          <p className="text-xs font-bold text-mid-grey uppercase">Tasa de Cierre</p>
          <p className="text-2xl font-bold text-charcoal mt-1">{kpis.closeRate}%</p>
        </div>
        <div className="bg-white dark:bg-surface rounded-md shadow-card p-4 border-l-4 border-petrol">
          <p className="text-xs font-bold text-mid-grey uppercase">Tiempo Medio Resol.</p>
          <p className="text-2xl font-bold text-navy dark:text-sky-300 mt-1">
            {kpis.avgHours === '—' ? '—' : `${kpis.avgHours}h`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="h-48 bg-white dark:bg-surface rounded-md animate-pulse shadow-card" />
      ) : (
        <>
          {/* Gráfico comparativo rendimiento por técnico */}
          {techStats.length > 0 && (
            <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 border border-border/60">
              <h2 className="text-base font-bold text-charcoal mb-3">
                Comparativa Visual por Técnico
              </h2>
              <div className="h-56 w-full">
                {mounted ? (
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart data={techStats} margin={{ top: 8, right: 12, left: -16, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                      <XAxis dataKey="shortName" tick={{ fontSize: 12, fill: axisStroke }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: axisStroke }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: isDark ? '#182032' : '#FFFFFF',
                          borderColor: isDark ? '#2A354D' : '#DDDDDD',
                          color: isDark ? '#F1F5F9' : '#222222',
                          fontSize: '12px',
                        }}
                      />
                      <Bar dataKey="total" name="Asignados" fill="#002169" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="completed" name="Completados" fill="#1A7A4A" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full bg-off-white rounded-sm animate-pulse" />
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Rendimiento por técnico */}
            <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 border border-border/60 overflow-x-auto">
              <h2 className="text-base font-bold text-charcoal mb-4">
                Rendimiento por Técnico
              </h2>
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-xs uppercase text-mid-grey">
                    <th className="py-2 pr-3">Técnico</th>
                    <th className="py-2 px-2 text-center">Totales</th>
                    <th className="py-2 px-2 text-center">Cerrados</th>
                    <th className="py-2 px-2 text-center">Tasa</th>
                    <th className="py-2 pl-2 text-right">Ø Resol.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {techStats.map((row) => (
                    <tr key={row.tech.id}>
                      <td className="py-3 pr-3 font-semibold text-charcoal">
                        {row.tech.full_name}
                      </td>
                      <td className="py-3 px-2 text-center">{row.total}</td>
                      <td className="py-3 px-2 text-center font-bold text-success">
                        {row.completed}
                      </td>
                      <td className="py-3 px-2 text-center">{row.rate}%</td>
                      <td className="py-3 pl-2 text-right text-navy dark:text-sky-300 font-bold">
                        {row.avgHours === '—' ? '—' : `${row.avgHours}h`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Top Clientes */}
            <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 border border-border/60 overflow-x-auto">
              <h2 className="text-base font-bold text-charcoal mb-4">
                Partes por Cliente (Top 10)
              </h2>
              {topCustomers.length === 0 ? (
                <p className="text-sm text-mid-grey">
                  No hay partes que coincidan con los filtros seleccionados.
                </p>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase text-mid-grey">
                      <th className="py-2 pr-3">Cliente</th>
                      <th className="py-2 px-2 text-center">Total Partes</th>
                      <th className="py-2 pl-2 text-right">Abiertos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {topCustomers.map((row) => (
                      <tr key={row.customer.id}>
                        <td className="py-3 pr-3 font-semibold text-charcoal">
                          {row.customer.name}
                        </td>
                        <td className="py-3 px-2 text-center font-bold">{row.total}</td>
                        <td className="py-3 pl-2 text-right text-magenta font-bold">
                          {row.open}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
