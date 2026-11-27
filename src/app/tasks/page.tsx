'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BookmarkPlus,
  Clock,
  Download,
  Filter,
  LayoutGrid,
  Plus,
  RotateCcw,
  Search,
  Table as TableIcon,
  Trash2,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { PriorityBadge, StatusBadge, TaskTypeBadge } from '@/components/ui/Badge';
import { TaskCard } from '@/components/ui/TaskCard';
import { useAuth } from '@/hooks/useAuth';
import { downloadCsv } from '@/lib/csv';
import { listProfiles, listTasks, restoreTask } from '@/lib/data-service';
import { isOpenTask, type DashboardKpiFilter } from '@/lib/dashboard-helpers';
import { getSlaStatus } from '@/lib/sla';
import {
  normalizeTaskStatus,
  resolveTaskType,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  TASK_TYPE_META,
  type Profile,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from '@/types/database';

type TaskTab = 'mine' | 'unassigned' | 'overdue' | 'all' | 'trash';

interface SavedFilterPreset {
  id: string;
  name: string;
  tab: TaskTab;
  typeFilter?: TaskType | 'all';
  statusFilter: TaskStatus | 'all';
  priorityFilter: TaskPriority | 'all';
  techFilter: string;
  dateFrom: string;
  dateTo: string;
  search: string;
}

const ACTIVE_FILTERS_KEY = 'vistasat_tasks_filters_v1';
const SAVED_PRESETS_KEY = 'vistasat_tasks_saved_filters_v1';

const KPI_PRESET_LABELS: Record<DashboardKpiFilter, string> = {
  pending: 'Pendientes',
  in_progress: 'En Proceso',
  urgent_high: 'Urgentes y Prioridad Alta',
  sla_risk: 'SLA en Riesgo (Vencidos / Hoy)',
  completed: 'Completadas',
};

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

  const [tab, setTab] = useState<TaskTab>(() => (isCoord ? 'all' : 'mine'));
  const [typeFilter, setTypeFilter] = useState<TaskType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [techFilter, setTechFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [kpiPreset, setKpiPreset] = useState<DashboardKpiFilter | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  // Filtros favoritos (M8)
  const [presets, setPresets] = useState<SavedFilterPreset[]>([]);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [filtersHydrated, setFiltersHydrated] = useState(false);

  // Cargar filtros guardados y query ?filter=...
  useEffect(() => {
    const hydrate = () => {
      try {
        const rawPresets = localStorage.getItem(SAVED_PRESETS_KEY);
        if (rawPresets) {
          setPresets(JSON.parse(rawPresets) as SavedFilterPreset[]);
        }
      } catch {
        // Silencioso
      }

      const params = new URLSearchParams(window.location.search);
      const urlPreset = params.get('preset');
      const urlScope = params.get('scope');
      if (
        urlPreset === 'pending' ||
        urlPreset === 'in_progress' ||
        urlPreset === 'urgent_high' ||
        urlPreset === 'sla_risk' ||
        urlPreset === 'completed'
      ) {
        setTab(urlScope === 'mine' || !isCoord ? 'mine' : 'all');
        setTypeFilter('all');
        setStatusFilter('all');
        setPriorityFilter('all');
        setTechFilter('all');
        setDateFrom('');
        setDateTo('');
        setSearch('');
        setKpiPreset(urlPreset);
        setFiltersHydrated(true);
        return;
      }

      const urlFilter = params.get('filter');
      if (
        urlFilter === 'mine' ||
        urlFilter === 'unassigned' ||
        urlFilter === 'overdue' ||
        urlFilter === 'trash' ||
        urlFilter === 'all'
      ) {
        setTab(urlFilter);
        setFiltersHydrated(true);
        return;
      }

      try {
        const rawActive = localStorage.getItem(ACTIVE_FILTERS_KEY);
        if (rawActive) {
          const parsed = JSON.parse(rawActive) as Partial<SavedFilterPreset>;
          if (parsed.tab) setTab(parsed.tab);
          if (parsed.typeFilter) setTypeFilter(parsed.typeFilter);
          if (parsed.statusFilter) setStatusFilter(parsed.statusFilter);
          if (parsed.priorityFilter) setPriorityFilter(parsed.priorityFilter);
          if (parsed.techFilter) setTechFilter(parsed.techFilter);
          if (typeof parsed.dateFrom === 'string') setDateFrom(parsed.dateFrom);
          if (typeof parsed.dateTo === 'string') setDateTo(parsed.dateTo);
          if (typeof parsed.search === 'string') setSearch(parsed.search);
        }
      } catch {
        // Silencioso
      }
      setFiltersHydrated(true);
    };
    const t = setTimeout(hydrate, 0);
    return () => clearTimeout(t);
  }, [isCoord]);

  // Persistir filtros activos en localStorage
  useEffect(() => {
    if (!filtersHydrated) return;
    try {
      localStorage.setItem(
        ACTIVE_FILTERS_KEY,
        JSON.stringify({
          tab,
          typeFilter,
          statusFilter,
          priorityFilter,
          techFilter,
          dateFrom,
          dateTo,
          search,
        })
      );
    } catch {
      // Silencioso
    }
  }, [filtersHydrated, tab, typeFilter, statusFilter, priorityFilter, techFilter, dateFrom, dateTo, search]);

  const profileId = profile?.id;
  const profileRole = profile?.role;

  const load = useCallback(async () => {
    if (!profileId || !profileRole) return;
    await Promise.resolve();
    setLoading(true);
    try {
      const viewer = { id: profileId, role: profileRole } as Profile;
      const [t, p] = await Promise.all([
        listTasks(viewer, { includeDeleted: true }),
        isCoord ? listProfiles() : Promise.resolve([]),
      ]);
      setTasks(t);
      setProfiles(p);
    } finally {
      setLoading(false);
    }
  }, [profileId, profileRole, isCoord]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    const handler = () => void load();
    window.addEventListener('vistasat:demo-updated', handler);
    return () => {
      clearTimeout(t);
      window.removeEventListener('vistasat:demo-updated', handler);
    };
  }, [load]);

  const activeTasks = useMemo(() => tasks.filter((t) => !t.deleted_at), [tasks]);
  const trashedTasks = useMemo(() => tasks.filter((t) => Boolean(t.deleted_at)), [tasks]);
  const overdueTasks = useMemo(
    () => activeTasks.filter((t) => getSlaStatus(t)?.state === 'overdue'),
    [activeTasks]
  );

  const filteredTasks = useMemo(() => {
    const source = tab === 'trash' ? trashedTasks : activeTasks;
    return source.filter((t) => {
      if (tab === 'mine' && t.assigned_to !== profile?.id) return false;
      if (
        tab === 'unassigned' &&
        (t.assigned_to !== null || normalizeTaskStatus(t.status) !== 'pending')
      ) {
        return false;
      }
      if (tab === 'overdue' && getSlaStatus(t)?.state !== 'overdue') return false;

      const normalizedStatus = normalizeTaskStatus(t.status);
      if (kpiPreset === 'pending' && normalizedStatus !== 'pending') {
        return false;
      }
      if (kpiPreset === 'in_progress' && normalizedStatus !== 'in_progress') {
        return false;
      }
      if (
        kpiPreset === 'urgent_high' &&
        (!isOpenTask(t) || (t.priority !== 'urgent' && t.priority !== 'high'))
      ) {
        return false;
      }
      if (kpiPreset === 'sla_risk') {
        const slaState = getSlaStatus(t)?.state;
        if (!isOpenTask(t) || (slaState !== 'overdue' && slaState !== 'due_today')) {
          return false;
        }
      }
      if (kpiPreset === 'completed' && normalizedStatus !== 'completed') {
        return false;
      }

      if (typeFilter !== 'all' && resolveTaskType(t) !== typeFilter) return false;
      if (statusFilter !== 'all' && normalizedStatus !== statusFilter) return false;
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
          t.equipment_sn,
          t.problem_desc,
          t.site_city,
          t.assignee?.full_name,
          t.deleter?.full_name,
          t.deletion_reason,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [
    activeTasks,
    trashedTasks,
    tab,
    kpiPreset,
    typeFilter,
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
      'Límite SLA',
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
      t.due_date ? new Date(t.due_date).toLocaleString('es-ES') : '',
      new Date(t.created_at).toLocaleString('es-ES'),
      t.completed_at ? new Date(t.completed_at).toLocaleString('es-ES') : '',
    ]);

    downloadCsv(
      `VistaSatPRO_partes_${new Date().toISOString().slice(0, 10)}.csv`,
      headers,
      rows
    );
  };

  if (!profile) return null;

  const technicians = profiles.filter((p) => p.role === 'technician' && p.is_active);
  const hasActiveFilterCriteria =
    Boolean(kpiPreset) ||
    typeFilter !== 'all' ||
    statusFilter !== 'all' ||
    priorityFilter !== 'all' ||
    techFilter !== 'all' ||
    Boolean(dateFrom) ||
    Boolean(dateTo) ||
    Boolean(search.trim());

  const clearFilters = () => {
    setKpiPreset(null);
    setTypeFilter('all');
    setStatusFilter('all');
    setPriorityFilter('all');
    setTechFilter('all');
    setDateFrom('');
    setDateTo('');
    setSearch('');
  };

  const handleSavePreset = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = presetName.trim();
    if (!clean) return;
    const newPreset: SavedFilterPreset = {
      id: `preset-${Date.now()}`,
      name: clean,
      tab,
      typeFilter,
      statusFilter,
      priorityFilter,
      techFilter,
      dateFrom,
      dateTo,
      search,
    };
    const next = [...presets, newPreset];
    setPresets(next);
    try {
      localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(next));
    } catch {
      // Silencioso
    }
    setPresetName('');
    setSavingPreset(false);
  };

  const applyPreset = (p: SavedFilterPreset) => {
    setTab(p.tab);
    setTypeFilter(p.typeFilter || 'all');
    setStatusFilter(p.statusFilter);
    setPriorityFilter(p.priorityFilter);
    setTechFilter(p.techFilter);
    setDateFrom(p.dateFrom);
    setDateTo(p.dateTo);
    setSearch(p.search);
  };

  const removePreset = (id: string) => {
    const next = presets.filter((p) => p.id !== id);
    setPresets(next);
    try {
      localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(next));
    } catch {
      // Silencioso
    }
  };

  const handleRestore = async (taskId: string, code: string) => {
    setRestoringId(taskId);
    try {
      await restoreTask(taskId, profile);
      setFeedbackBanner(`Parte ${code} restaurado y devuelto a la lista activa.`);
      setTimeout(() => setFeedbackBanner(null), 4000);
      await load();
    } catch (err) {
      setFeedbackBanner(
        err instanceof Error ? err.message : 'No se pudo restaurar el parte.'
      );
      setTimeout(() => setFeedbackBanner(null), 4000);
    } finally {
      setRestoringId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {feedbackBanner && (
        <div className="p-3 bg-navy text-white text-xs font-bold border-l-4 border-magenta shadow-card">
          {feedbackBanner}
        </div>
      )}

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
          <Link href="/customers">
            <Button variant="secondary" size="sm">
              Clientes
            </Button>
          </Link>
          {isCoord && (
            <Button variant="secondary" size="sm" onClick={exportCSV}>
              <Download size={15} /> CSV
            </Button>
          )}
          <Link href="/tasks/new">
            <Button variant="accent" size="sm">
              <Plus size={16} /> Nueva Tarea
            </Button>
          </Link>
        </div>
      </div>

      {/* Tabs rápidas */}
      <div className="flex items-center justify-between gap-2 border-b border-border pb-2 overflow-x-auto">
        <div className="flex gap-2">
          {isCoord && (
            <button
              onClick={() => {
                setKpiPreset(null);
                setTab('all');
              }}
              className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${
                tab === 'all'
                  ? 'bg-navy text-white'
                  : 'bg-white dark:bg-surface text-mid-grey border border-border'
              }`}
            >
              Todos ({activeTasks.length})
            </button>
          )}
          <button
            onClick={() => {
              setKpiPreset(null);
              setTab('mine');
            }}
            className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${
              tab === 'mine'
                ? 'bg-navy text-white'
                : 'bg-white dark:bg-surface text-mid-grey border border-border'
            }`}
          >
            Mis Tareas ({activeTasks.filter((t) => t.assigned_to === profile.id).length})
          </button>
          <button
            onClick={() => {
              setKpiPreset(null);
              setTab('unassigned');
            }}
            className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${
              tab === 'unassigned'
                ? 'bg-navy text-white'
                : 'bg-white dark:bg-surface text-mid-grey border border-border'
            }`}
          >
            Sin Asignar (
            {activeTasks.filter((t) => t.assigned_to === null && t.status === 'pending').length})
          </button>
          <button
            onClick={() => {
              setKpiPreset(null);
              setTab('overdue');
            }}
            className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap inline-flex items-center gap-1 ${
              tab === 'overdue'
                ? 'bg-danger text-white'
                : 'bg-white dark:bg-surface text-mid-grey border border-border hover:text-danger'
            }`}
          >
            <Clock size={13} /> Vencidos ({overdueTasks.length})
          </button>
          <button
            onClick={() => {
              setKpiPreset(null);
              setTab('trash');
            }}
            className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
              tab === 'trash'
                ? 'bg-danger text-white'
                : 'bg-white dark:bg-surface text-mid-grey border border-border hover:text-danger'
            }`}
          >
            <Trash2 size={13} /> Papelera ({trashedTasks.length})
          </button>
        </div>

        <div className="hidden md:flex items-center gap-1 bg-white dark:bg-surface border border-border p-1">
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

      {kpiPreset && (
        <div className="flex items-center justify-between gap-2 p-2.5 bg-navy/5 dark:bg-sky-500/15 border border-navy/25 dark:border-sky-400/30 rounded-sm text-xs">
          <span className="font-bold text-navy dark:text-sky-300">
            Filtro rápido desde Panel General: {KPI_PRESET_LABELS[kpiPreset]}
          </span>
          <button
            type="button"
            onClick={() => setKpiPreset(null)}
            className="inline-flex items-center gap-1 px-2 py-1 font-bold text-mid-grey hover:text-charcoal bg-white dark:bg-surface border border-border rounded-xs"
          >
            <X size={13} /> Quitar filtro
          </button>
        </div>
      )}

      {/* Buscador + Botón filtros + Guardar favorito */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[210px]">
          <Search
            size={17}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-mid-grey"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar código, cliente, equipo..."
            className="w-full pl-10 pr-3 py-2.5 bg-white dark:bg-surface border border-border text-charcoal focus:outline-none focus:ring-2 focus:ring-navy"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className={`px-4 py-2.5 border text-xs font-bold uppercase tracking-wider inline-flex items-center gap-1.5 min-h-[44px] ${
            showFilters
              ? 'bg-navy text-white border-navy'
              : 'bg-white dark:bg-surface text-charcoal border-border'
          }`}
        >
          <Filter size={15} /> Filtros
        </button>
        <button
          type="button"
          onClick={() => setSavingPreset(!savingPreset)}
          className="px-3 py-2.5 border border-border bg-white dark:bg-surface text-xs font-bold text-navy dark:text-sky-300 inline-flex items-center gap-1.5 min-h-[44px] hover:bg-off-white"
          title="Guardar filtro actual como favorito"
        >
          <BookmarkPlus size={15} /> Guardar vista
        </button>
      </div>

      {/* Formulario rápido guardar filtro favorito (M8) */}
      {savingPreset && (
        <form
          onSubmit={handleSavePreset}
          className="bg-white dark:bg-surface border border-border rounded-sm p-3 flex flex-wrap items-center gap-2"
        >
          <input
            type="text"
            required
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Nombre del filtro favorito (ej. Urgentes Madrid)..."
            className="flex-1 min-w-[200px] px-3 py-2 bg-bg-input border border-border text-xs text-charcoal"
          />
          <Button type="submit" size="sm" variant="primary">
            Guardar favorito
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSavingPreset(false)}>
            Cancelar
          </Button>
        </form>
      )}

      {/* Chips de filtros favoritos guardados + limpiar */}
      {(presets.length > 0 || hasActiveFilterCriteria) && (
        <div className="flex flex-wrap items-center gap-2">
          {presets.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white dark:bg-surface border border-border rounded-full text-xs font-semibold text-charcoal"
            >
              <button
                type="button"
                onClick={() => applyPreset(p)}
                className="hover:text-magenta font-bold"
              >
                ★ {p.name}
              </button>
              <button
                type="button"
                onClick={() => removePreset(p.id)}
                className="text-mid-grey hover:text-danger"
                aria-label={`Eliminar favorito ${p.name}`}
              >
                <X size={12} />
              </button>
            </span>
          ))}
          {hasActiveFilterCriteria && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-bold text-magenta hover:underline px-2 py-1"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      )}

      {/* Panel de filtros */}
      {showFilters && (
        <div className="bg-white dark:bg-surface rounded-md shadow-card p-4 border border-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase text-mid-grey mb-1">
              Tipo de tarea
            </label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TaskType | 'all')}
              className="w-full px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
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
              Estado
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
              className="w-full px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
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
              className="w-full px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
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
                className="w-full px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
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
                className="w-full px-2 py-2 bg-bg-input border border-border text-xs text-charcoal"
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
                className="w-full px-2 py-2 bg-bg-input border border-border text-xs text-charcoal"
              />
            </div>
          </div>
        </div>
      )}

      {tab === 'trash' && (
        <div className="p-3 bg-danger/10 border-l-4 border-danger text-xs text-charcoal flex items-start gap-2">
          <AlertTriangle size={16} className="text-danger flex-shrink-0 mt-0.5" />
          <div>
            <strong>Papelera de partes eliminados:</strong> Todos los partes borrados conservan
            su historial cronológico completo y quién los eliminó. Puedes inspeccionarlos o
            restaurarlos en cualquier momento.
          </div>
        </div>
      )}

      {/* Resultados */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-44 bg-white dark:bg-surface rounded-md animate-pulse shadow-card" />
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="bg-white dark:bg-surface rounded-md p-8 text-center shadow-card">
          <p className="font-bold text-charcoal">
            {tab === 'trash' ? 'La papelera está vacía' : 'No se encontraron partes'}
          </p>
          <p className="text-sm text-mid-grey mt-1">
            {tab === 'trash'
              ? 'No hay ningún parte eliminado en este momento.'
              : 'Prueba a limpiar los filtros o cambiar de pestaña.'}
          </p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="bg-white dark:bg-surface rounded-md shadow-card overflow-x-auto border border-border/60">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-navy text-white text-xs uppercase tracking-wider">
                <th className="p-3">Código / Tipo</th>
                <th className="p-3">Cliente</th>
                <th className="p-3">Equipo</th>
                <th className="p-3">Estado</th>
                <th className="p-3">Prioridad / SLA</th>
                <th className="p-3">{tab === 'trash' ? 'Eliminado por' : 'Técnico'}</th>
                <th className="p-3">{tab === 'trash' ? 'Acción' : 'Apertura'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-sm">
              {filteredTasks.map((t) => {
                const sla = getSlaStatus(t);
                return (
                  <tr key={t.id} className="hover:bg-off-white transition-colors">
                    <td className="p-3 font-bold text-navy dark:text-sky-300">
                      <div className="flex flex-col gap-1 items-start">
                        <Link href={`/tasks/${t.id}`} className="hover:underline">
                          {t.code}
                        </Link>
                        <TaskTypeBadge taskType={resolveTaskType(t)} />
                      </div>
                    </td>
                    <td className="p-3 font-semibold text-charcoal">{t.customer?.name}</td>
                    <td className="p-3 text-dark-grey">{t.equipment_ref || '—'}</td>
                    <td className="p-3">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <PriorityBadge priority={t.priority} />
                        {sla && (
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-xs ${sla.badgeClass}`}
                          >
                            {sla.shortLabel}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-dark-grey text-xs">
                      {tab === 'trash' ? (
                        <div>
                          <span className="font-bold text-danger block">
                            {t.deleter?.full_name || 'Usuario'}
                          </span>
                          <span className="text-mid-grey">
                            {t.deleted_at ? new Date(t.deleted_at).toLocaleString('es-ES') : ''}
                          </span>
                          {t.deletion_reason && (
                            <span className="block text-[11px] italic text-dark-grey">
                              &ldquo;{t.deletion_reason}&rdquo;
                            </span>
                          )}
                        </div>
                      ) : (
                        t.assignee?.full_name || 'Sin asignar'
                      )}
                    </td>
                    <td className="p-3 text-xs text-mid-grey">
                      {tab === 'trash' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          isLoading={restoringId === t.id}
                          onClick={() => handleRestore(t.id, t.code)}
                        >
                          <RotateCcw size={14} /> Restaurar
                        </Button>
                      ) : (
                        new Date(t.created_at).toLocaleDateString('es-ES')
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredTasks.map((t) =>
            tab === 'trash' ? (
              <div key={t.id} className="space-y-0">
                <TaskCard task={t} />
                <div className="bg-danger/10 border border-t-0 border-danger/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs rounded-b-md">
                  <div className="min-w-0">
                    <p className="font-bold text-danger">
                      Eliminado por {t.deleter?.full_name || 'Usuario'} ·{' '}
                      {t.deleted_at ? new Date(t.deleted_at).toLocaleString('es-ES') : ''}
                    </p>
                    {t.deletion_reason && (
                      <p className="text-dark-grey italic truncate">
                        Motivo: {t.deletion_reason}
                      </p>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    isLoading={restoringId === t.id}
                    onClick={() => handleRestore(t.id, t.code)}
                  >
                    <RotateCcw size={14} /> Restaurar
                  </Button>
                </div>
              </div>
            ) : (
              <TaskCard key={t.id} task={t} />
            )
          )}
        </div>
      )}
    </div>
  );
}
