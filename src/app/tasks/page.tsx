'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Download,
  Filter,
  LayoutGrid,
  Plus,
  Search,
  Table as TableIcon,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { PriorityBadge, StatusBadge } from '@/components/ui/Badge';
import { TaskCard } from '@/components/ui/TaskCard';
import { useAuth } from '@/hooks/useAuth';
import { listProfiles, listTasks } from '@/lib/data-service';
import {
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  type Profile,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from '@/types/database';

export default function TasksPage() {
  return (
    <AppShell>
      <TasksContent />
    </AppShell>
  );
}

function TasksContent() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const isCoord = profile?.role === 'admin' || profile?.role === 'coordinator';

  const [tab, setTab] = useState<'mine' | 'unassigned' | 'all'>(() =>
    isCoord ? 'all' : 'mine'
  );
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [techFilter, setTechFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const load = useCallback(async () => {
    if (!profile) return;
    await Promise.resolve();
    setLoading(true);
    try {
      const [t, p] = await Promise.all([
        listTasks(profile),
        isCoord ? listProfiles() : Promise.resolve([]),
      ]);
      setTasks(t);
      setProfiles(p);
    } finally {
      setLoading(false);
    }
  }, [profile, isCoord]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    const handler = () => void load();
    window.addEventListener('vistasat:demo-updated', handler);
    return () => {
      clearTimeout(t);
      window.removeEventListener('vistasat:demo-updated', handler);
    };
  }, [load]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (tab === 'mine' && t.assigned_to !== profile?.id) return false;
      if (tab === 'unassigned' && (t.assigned_to !== null || t.status !== 'pending')) return false;

      if (statusFilter !== 'all' && t.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (techFilter !== 'all') {
        if (techFilter === 'unassigned' && t.assigned_to !== null) return false;
        if (techFilter !== 'unassigned' && t.assigned_to !== techFilter) return false;
      }
      if (dateFrom && t.created_at.slice(0, 10) < dateFrom) return false;
      if (dateTo && t.created_at.slice(0, 10) > dateTo) return false;

      if (search.trim()) {
        const q = search.toLowerCase();
        const haystack = [
          t.code,
          t.customer?.name,
          t.equipment_ref,
          t.problem_desc,
          t.site_city,
          t.assignee?.full_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [
    tasks,
    tab,
    profile?.id,
    statusFilter,
    priorityFilter,
    techFilter,
    dateFrom,
    dateTo,
    search,
  ]);

  const exportCSV = () => {
    const headers = [
      'Código',
      'Cliente',
      'Equipo',
      'Estado',
      'Prioridad',
      'Técnico',
      'Ciudad',
      'Fecha Apertura',
      'Fecha Cierre',
    ];
    const rows = filteredTasks.map((t) => [
      t.code,
      t.customer?.name || '',
      t.equipment_ref || '',
      TASK_STATUS_META[t.status].label,
      TASK_PRIORITY_META[t.priority].label,
      t.assignee?.full_name || 'Sin asignar',
      t.site_city || t.customer?.city || '',
      new Date(t.created_at).toLocaleString('es-ES'),
      t.completed_at ? new Date(t.completed_at).toLocaleString('es-ES') : '',
    ]);

    const csv = [headers, ...rows]
      .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
      .join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VistaSatPRO_partes_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!profile) return null;

  const technicians = profiles.filter((p) => p.role === 'technician' && p.is_active);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {/* Cabecera */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-charcoal">
            {isCoord ? 'Gestión de Partes de Trabajo' : 'Mis Partes de Trabajo'}
          </h1>
          <p className="text-xs text-mid-grey mt-0.5">
            {filteredTasks.length} parte{filteredTasks.length === 1 ? '' : 's'} mostrado
            {filteredTasks.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isCoord && (
            <>
              <Button variant="secondary" size="sm" onClick={exportCSV}>
                <Download size={15} /> CSV
              </Button>
              <Link href="/tasks/new">
                <Button variant="accent" size="sm">
                  <Plus size={16} /> Nuevo Parte
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>

      {/* Tabs rápidas */}
      <div className="flex items-center justify-between gap-2 border-b border-border pb-2 overflow-x-auto">
        <div className="flex gap-2">
          {isCoord && (
            <button
              onClick={() => setTab('all')}
              className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
                tab === 'all'
                  ? 'bg-navy text-white'
                  : 'bg-white text-mid-grey border border-border'
              }`}
            >
              Todos ({tasks.length})
            </button>
          )}
          <button
            onClick={() => setTab('mine')}
            className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
              tab === 'mine'
                ? 'bg-navy text-white'
                : 'bg-white text-mid-grey border border-border'
            }`}
          >
            Mis Tareas ({tasks.filter((t) => t.assigned_to === profile.id).length})
          </button>
          <button
            onClick={() => setTab('unassigned')}
            className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors ${
              tab === 'unassigned'
                ? 'bg-navy text-white'
                : 'bg-white text-mid-grey border border-border'
            }`}
          >
            Sin Asignar (
            {tasks.filter((t) => t.assigned_to === null && t.status === 'pending').length})
          </button>
        </div>

        <div className="hidden md:flex items-center gap-1 bg-white border border-border p-1">
          <button
            onClick={() => setViewMode('cards')}
            className={`p-1.5 ${viewMode === 'cards' ? 'bg-navy text-white' : 'text-mid-grey'}`}
            aria-label="Vista tarjetas"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`p-1.5 ${viewMode === 'table' ? 'bg-navy text-white' : 'text-mid-grey'}`}
            aria-label="Vista tabla"
          >
            <TableIcon size={16} />
          </button>
        </div>
      </div>

      {/* Buscador + Botón filtros */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            size={17}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-mid-grey"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar código, cliente, equipo..."
            className="w-full pl-10 pr-3 py-2.5 bg-white border border-border focus:outline-none focus:ring-2 focus:ring-navy"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className={`px-4 py-2.5 border text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 min-h-[44px] ${
            showFilters
              ? 'bg-navy text-white border-navy'
              : 'bg-white text-charcoal border-border'
          }`}
        >
          <Filter size={15} /> Filtros
        </button>
      </div>

      {/* Panel de filtros */}
      {showFilters && (
        <div className="bg-white rounded-md shadow-card p-4 border border-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase text-mid-grey mb-1">
              Estado
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
              className="w-full px-3 py-2 bg-bg-input border border-border text-sm"
            >
              <option value="all">Todos los estados</option>
              {Object.entries(TASK_STATUS_META).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase text-mid-grey mb-1">
              Prioridad
            </label>
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as TaskPriority | 'all')}
              className="w-full px-3 py-2 bg-bg-input border border-border text-sm"
            >
              <option value="all">Todas las prioridades</option>
              {Object.entries(TASK_PRIORITY_META).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>

          {isCoord && (
            <div>
              <label className="block text-[11px] font-bold uppercase text-mid-grey mb-1">
                Técnico
              </label>
              <select
                value={techFilter}
                onChange={(e) => setTechFilter(e.target.value)}
                className="w-full px-3 py-2 bg-bg-input border border-border text-sm"
              >
                <option value="all">Todos los técnicos</option>
                <option value="unassigned">Sin asignar</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold uppercase text-mid-grey mb-1">
                Desde
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-2 py-2 bg-bg-input border border-border text-xs"
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
                className="w-full px-2 py-2 bg-bg-input border border-border text-xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* Resultados */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 bg-white rounded-md animate-pulse shadow-card" />
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="bg-white rounded-md p-8 text-center shadow-card">
          <p className="font-bold text-charcoal">No se encontraron partes</p>
          <p className="text-sm text-mid-grey mt-1">
            Prueba a limpiar los filtros o cambiar de pestaña.
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="bg-white rounded-md shadow-card overflow-x-auto border border-border/60">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-navy text-white text-xs uppercase tracking-wider">
                <th className="p-3">Código</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Equipo</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Prioridad</th>
                <th className="p-3">Técnico</th>
                <th className="p-3">Apertura</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {filteredTasks.map((t) => (
                <tr key={t.id} className="hover:bg-off-white transition-colors">
                  <td className="p-3 font-bold text-navy">
                    <Link href={`/tasks/${t.id}`} className="hover:underline">
                      {t.code}
                    </Link>
                  </td>
                  <td className="p-3 font-semibold text-charcoal">{t.customer?.name}</td>
                  <td className="p-3 text-dark-grey">{t.equipment_ref || '—'}</td>
                  <td className="p-3">
                    <StatusBadge status={t.status} />
                  </td>
                  <td className="p-3">
                    <PriorityBadge priority={t.priority} />
                  </td>
                  <td className="p-3 text-dark-grey">
                    {t.assignee?.full_name || 'Sin asignar'}
                  </td>
                  <td className="p-3 text-xs text-mid-grey">
                    {new Date(t.created_at).toLocaleDateString('es-ES')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTasks.map((t) => (
            <TaskCard key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  );
}
