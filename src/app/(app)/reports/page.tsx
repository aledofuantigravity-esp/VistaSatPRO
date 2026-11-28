'use client';

import { useCallback, useMemo, useState, useEffect } from 'react';
import { BarChart3, Download, FileDown, Package, RotateCcw, Shield, Timer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { downloadCsv } from '@/lib/csv';
import { computeResolutionStatsByType } from '@/lib/dashboard-helpers';
import { listCustomers, listProfiles, listTasks } from '@/lib/data-service';
import { useAppCache } from '@/store/app-cache';
import {
  getTaskStatusLabel,
  normalizeTaskStatus,
  resolveTaskType,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  TASK_TYPE_META,
  type Customer,
  type Profile,
  type Task,
  type TaskStatus,
  type TaskType,
} from '@/types/database';

export default function ReportsPage() {
  return <ReportsContent />;
}

function ReportsContent() {
  const { profile } = useAuth();
  const cachedTasks = useAppCache((s) => s.tasks);
  const tasksLoadedAt = useAppCache((s) => s.tasksLoadedAt);
  const cachedProfiles = useAppCache((s) => s.profiles);
  const cachedCustomers = useAppCache((s) => s.customers);

  const [tasks, setTasks] = useState<Task[]>(cachedTasks);
  const [profiles, setProfiles] = useState<Profile[]>(cachedProfiles);
  const [customers, setCustomers] = useState<Customer[]>(cachedCustomers);
  const [loading, setLoading] = useState(!tasksLoadedAt);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Filtros avanzados (incluye filtro por Tipo de parte)
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [typeFilter, setTypeFilter] = useState<TaskType | 'all'>('all');
  const [techFilter, setTechFilter] = useState('all');
  const [customerFilter, setCustomerFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');

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
        const [t, p, c] = await Promise.all([
          listTasks(viewer, { force: silent }),
          listProfiles({ force: silent }),
          listCustomers({ force: silent }),
        ]);
        setTasks(t);
        setProfiles(p);
        setCustomers(c);
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

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.deleted_at) return false;
      if (dateFrom && t.created_at.slice(0, 10) < dateFrom) return false;
      if (dateTo && t.created_at.slice(0, 10) > dateTo) return false;
      if (typeFilter !== 'all' && resolveTaskType(t) !== typeFilter) return false;
      if (techFilter !== 'all') {
        if (techFilter === 'unassigned' && t.assigned_to !== null) return false;
        if (techFilter !== 'unassigned' && t.assigned_to !== techFilter) return false;
      }
      if (customerFilter !== 'all' && t.customer_id !== customerFilter) return false;
      if (statusFilter !== 'all' && normalizeTaskStatus(t.status) !== statusFilter) return false;
      return true;
    });
  }, [tasks, dateFrom, dateTo, typeFilter, techFilter, customerFilter, statusFilter]);

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

  const resolutionByType = useMemo(
    () => computeResolutionStatsByType(filteredTasks),
    [filteredTasks]
  );

  const topConsumedParts = useMemo(() => {
    const agg = new Map<
      string,
      { name: string; ref?: string; qty: number; taskIds: Set<string> }
    >();
    for (const t of filteredTasks) {
      for (const m of t.materials_used || []) {
        const cleanName = m.name.trim();
        if (!cleanName) continue;
        const key = `${cleanName.toLowerCase()}::${(m.ref || '').trim().toLowerCase()}`;
        const existing = agg.get(key) || {
          name: cleanName,
          ref: m.ref?.trim() || undefined,
          qty: 0,
          taskIds: new Set<string>(),
        };
        existing.qty += Math.max(1, Number(m.qty) || 1);
        existing.taskIds.add(t.id);
        agg.set(key, existing);
      }
    }
    return Array.from(agg.values())
      .map((item) => ({
        name: item.name,
        ref: item.ref,
        qty: item.qty,
        taskCount: item.taskIds.size,
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 12);
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
    typeFilter !== 'all' ||
    techFilter !== 'all' ||
    customerFilter !== 'all' ||
    statusFilter !== 'all';

  const resetFilters = () => {
    setDateFrom('');
    setDateTo('');
    setTypeFilter('all');
    setTechFilter('all');
    setCustomerFilter('all');
    setStatusFilter('all');
  };

  const exportFullPartsCsv = () => {
    const headers = [
      'Código',
      'Tipo',
      'Cliente',
      'Equipo',
      'Nº Serie',
      'Estado',
      'Prioridad',
      'Técnico',
      'Apertura',
      'Cierre',
      'Tiempo Resol. (h)',
      'Resolución',
      'Copias B/N',
      'Copias Color',
      'Materiales / Repuestos',
    ];
    const rows = filteredTasks.map((t) => {
      const hours =
        t.status === 'completed' && t.completed_at
          ? Math.max(
              0.1,
              (new Date(t.completed_at).getTime() - new Date(t.created_at).getTime()) /
                3_600_000
            ).toFixed(1)
          : '';
      const materialsText = (t.materials_used || [])
        .map((m) => `${m.name}${m.ref ? ` [${m.ref}]` : ''} x${m.qty}`)
        .join(' | ');
      return [
        t.code,
        TASK_TYPE_META[resolveTaskType(t)].label,
        t.customer?.name || '',
        t.equipment_ref || '',
        t.equipment_sn || '',
        getTaskStatusLabel(t.status),
        TASK_PRIORITY_META[t.priority].label,
        t.assignee?.full_name || 'Sin asignar',
        new Date(t.created_at).toLocaleString('es-ES'),
        t.completed_at ? new Date(t.completed_at).toLocaleString('es-ES') : '',
        hours,
        t.resolution || '',
        t.meter_bw ?? '',
        t.meter_color ?? '',
        materialsText,
      ];
    });
    downloadCsv(
      `VistaSatPRO_partes_materiales_${new Date().toISOString().slice(0, 10)}.csv`,
      headers,
      rows
    );
  };

  const handleExportPDF = async () => {
    setExportingPdf(true);
    try {
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
      const typeLabel =
        typeFilter === 'all' ? 'Todos' : TASK_TYPE_META[typeFilter].label;

      const { downloadReportPDF } = await import('@/lib/pdf-generator');
      downloadReportPDF({
        filters: {
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          typeLabel,
          technicianName: techLabel,
          customerName: custLabel,
          statusLabel,
        },
        kpis,
        resolutionByType: resolutionByType.byType.map((b) => ({
          label: b.label,
          count: b.count,
          formatted: b.formatted,
        })),
        topParts: topConsumedParts,
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
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-charcoal flex items-center gap-2">
            <BarChart3 size={22} className="text-navy" /> Informes Operativos SAT
          </h1>
          <p className="text-xs text-mid-grey mt-0.5">
            {filteredTasks.length} parte{filteredTasks.length === 1 ? '' : 's'} en el período seleccionado
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={exportFullPartsCsv}>
            <Download size={15} /> CSV Completo (Partes y Materiales)
          </Button>
          <Button
            variant="accent"
            size="sm"
            isLoading={exportingPdf}
            onClick={handleExportPDF}
          >
            <FileDown size={15} /> Exportar PDF
          </Button>
        </div>
      </div>

      {/* Filtros avanzados */}
      <div className="bg-white rounded-md shadow-card p-4 border border-border/60 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
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
              Tipo de parte
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TaskType | 'all')}
              className="w-full px-2.5 py-2 bg-bg-input border border-border text-xs text-charcoal"
            >
              <option value="all">Todos los tipos</option>
              {Object.entries(TASK_TYPE_META).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
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
        <div className="bg-white rounded-md shadow-card p-4 border-l-4 border-navy">
          <p className="text-xs font-bold text-mid-grey uppercase">Partes Filtrados</p>
          <p className="text-2xl font-bold text-charcoal mt-1">{kpis.total}</p>
        </div>
        <div className="bg-white rounded-md shadow-card p-4 border-l-4 border-success">
          <p className="text-xs font-bold text-mid-grey uppercase">Completados</p>
          <p className="text-2xl font-bold text-success mt-1">{kpis.completed}</p>
        </div>
        <div className="bg-white rounded-md shadow-card p-4 border-l-4 border-magenta">
          <p className="text-xs font-bold text-mid-grey uppercase">Tasa de Cierre</p>
          <p className="text-2xl font-bold text-charcoal mt-1">{kpis.closeRate}%</p>
        </div>
        <div className="bg-white rounded-md shadow-card p-4 border-l-4 border-petrol">
          <p className="text-xs font-bold text-mid-grey uppercase">Tiempo Medio Resol.</p>
          <p className="text-2xl font-bold text-navy mt-1">
            {kpis.avgHours === '—' ? '—' : `${kpis.avgHours}h`}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="h-48 bg-white rounded-md animate-pulse shadow-card" />
      ) : (
        <>
          {/* Tiempo medio de cierre por tipo de parte */}
          <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-charcoal flex items-center gap-2">
                <Timer size={18} className="text-magenta" /> Tiempo Medio de Cierre por Tipo de Parte
              </h2>
              <span className="text-xs font-bold text-navy bg-off-white border border-border px-2.5 py-1 rounded-xs">
                Media global: {resolutionByType.global.formatted} ({resolutionByType.global.count})
              </span>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {resolutionByType.byType.map((item) => (
                <div
                  key={item.taskType}
                  className="p-3 bg-off-white border border-border/80 rounded-sm space-y-1"
                >
                  <p className="text-xs font-bold text-dark-grey">{item.label}</p>
                  <p className="text-lg font-extrabold text-charcoal">{item.formatted}</p>
                  <p className="text-[11px] text-mid-grey">
                    {item.count} cierre{item.count === 1 ? '' : 's'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Repuestos más consumidos */}
            <div className="bg-white rounded-md shadow-card p-5 border border-border/60 overflow-x-auto">
              <h2 className="text-base font-bold text-charcoal mb-4 flex items-center gap-2">
                <Package size={18} className="text-magenta" /> Repuestos Más Consumidos
              </h2>
              {topConsumedParts.length === 0 ? (
                <p className="text-sm text-mid-grey">
                  No se han registrado repuestos en los partes filtrados.
                </p>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs uppercase text-mid-grey">
                      <th className="py-2 pr-3">Repuesto</th>
                      <th className="py-2 px-2">Ref.</th>
                      <th className="py-2 px-2 text-center">Partes</th>
                      <th className="py-2 pl-2 text-right">Unidades</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {topConsumedParts.map((row) => (
                      <tr key={`${row.name}-${row.ref || ''}`}>
                        <td className="py-2.5 pr-3 font-semibold text-charcoal">{row.name}</td>
                        <td className="py-2.5 px-2 text-xs text-mid-grey">{row.ref || '—'}</td>
                        <td className="py-2.5 px-2 text-center">{row.taskCount}</td>
                        <td className="py-2.5 pl-2 text-right font-bold text-navy">
                          {row.qty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Top Clientes */}
            <div className="bg-white rounded-md shadow-card p-5 border border-border/60 overflow-x-auto">
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

          {/* Tabla resumen por técnico */}
          <div className="bg-white rounded-md shadow-card p-5 border border-border/60 overflow-x-auto">
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
                    <td className="py-3 pl-2 text-right text-navy font-bold">
                      {row.avgHours === '—' ? '—' : `${row.avgHours}h`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
