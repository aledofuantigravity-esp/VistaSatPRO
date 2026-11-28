'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  BookmarkPlus,
  CheckSquare,
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
import { PriorityBadge, StatusBadge, TaskTypeBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { TaskCard } from '@/components/ui/TaskCard';
import { useAuth } from '@/hooks/useAuth';
import { downloadCsv } from '@/lib/csv';
import { isOpenTask, type DashboardKpiFilter } from '@/lib/dashboard-helpers';
import { bulkUpdateTasks, listProfiles, listTasks, restoreTask } from '@/lib/data-service';
import { getSlaStatus } from '@/lib/sla';
import { useAppCache } from '@/store/app-cache';
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
const PAGE_SIZE = 30;

const KPI_PRESET_LABELS: Record<DashboardKpiFilter, string> = {
  pending: 'Pendientes',
  in_progress: 'En Proceso',
  urgent_high: 'Urgentes y Prioridad Alta',
  sla_risk: 'SLA en Riesgo (Vencidos / Hoy)',
  completed: 'Completadas',
};

export default function TasksPage() {
  return <TasksContent />;
}

function TasksContent() {
  const { profile } = useAuth();
  const cachedTasks = useAppCache((s) => s.tasks);
  const tasksLoadedAt = useAppCache((s) => s.tasksLoadedAt);
  const cachedProfiles = useAppCache((s) => s.profiles);

  const [tasks, setTasks] = useState<Task[]>(cachedTasks);
  const [profiles, setProfiles] = useState<Profile[]>(cachedProfiles);
  const [loading, setLoading] = useState(!tasksLoadedAt);

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

  // Paginación incremental
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  // Selección y acciones en lote (solo Admin/Coordinador en pestañas activas)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTech, setBulkTech] = useState<string>('');
  const [bulkPriority, setBulkPriority] = useState<TaskPriority | ''>('');
  const [applyingBulk, setApplyingBulk] = useState(false);

  // Filtros favoritos y carga diferida de Papelera
  const [presets, setPresets] = useState<SavedFilterPreset[]>([]);
  const [savingPreset, setSavingPreset] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [trashLoaded, setTrashLoaded] = useState(false);
  const deferredSearch = useDeferredValue(search);

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

  useEffect(() => {
    if (!filtersHydrated) return;
    const t = setTimeout(() => {
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
    }, 250);
    return () => clearTimeout(t);
  }, [
    filtersHydrated,
    tab,
    typeFilter,
    statusFilter,
    priorityFilter,
    techFilter,
    dateFrom,
    dateTo,
    search,
  ]);

  const profileId = profile?.id;
  const profileRole = profile?.role;
  const needDeleted = tab === 'trash' || trashLoaded;

  const load = useCallback(
    async (silent = false) => {
      if (!profileId || !profileRole) return;
      await Promise.resolve();
      const hasCached = useAppCache.getState().tasksLoadedAt !== null;
      if (!silent && !hasCached) setLoading(true);
      try {
        const viewer = { id: profileId, role: profileRole } as Profile;
        const shouldLoadProfs =
          isCoord && useAppCache.getState().profiles.length === 0;
        const [t, p] = await Promise.all([
          listTasks(viewer, { includeDeleted: needDeleted, force: silent }),
          shouldLoadProfs
            ? listProfiles({ force: silent })
            : Promise.resolve(useAppCache.getState().profiles),
        ]);
        setTasks(t);
        setProfiles(p);
        if (needDeleted) setTrashLoaded(true);
      } finally {
        setLoading(false);
      }
    },
    [profileId, profileRole, isCoord, needDeleted]
  );

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    const handler = () => void load(true);
    window.addEventListener('vistasat:demo-updated', handler);
    window.addEventListener('vistasat:offline-synced', handler);
    return () => {
      clearTimeout(t);
      window.removeEventListener('vistasat:demo-updated', handler);
      window.removeEventListener('vistasat:offline-synced', handler);
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
      if (kpiPreset === 'pending' && normalizedStatus !== 'pending') return false;
      if (kpiPreset === 'in_progress' && normalizedStatus !== 'in_progress') return false;
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
      if (kpiPreset === 'completed' && normalizedStatus !== 'completed') return false;

      if (typeFilter !== 'all' && resolveTaskType(t) !== typeFilter) return false;
      if (statusFilter !== 'all' && normalizedStatus !== statusFilter) return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (techFilter !== 'all') {
        if (techFilter === 'unassigned' && t.assigned_to !== null) return false;
        if (techFilter !== 'unassigned' && t.assigned_to !== techFilter) return false;
      }
      if (dateFrom && t.created_at.slice(0, 10) < dateFrom) return false;
      if (dateTo && t.created_at.slice(0, 10) > dateTo) return false;

      if (deferredSearch.trim()) {
        const q = deferredSearch.toLowerCase();
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
    deferredSearch,
  ]);

  const paginatedTasks = useMemo(
    () => filteredTasks.slice(0, visibleCount),
    [filteredTasks, visibleCount]
  );

  const exportTasksCsv = (sourceList: Task[], suffix = '') => {
    const headers = [
      'Código',
      'Tipo',
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
    const rows = sourceList.map((t) => [
      t.code,
      TASK_TYPE_META[resolveTaskType(t)].label,
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
      `VistaSatPRO_partes${suffix}_${new Date().toISOString().slice(0, 10)}.csv`,
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

  const resetPaginationAndSelection = () => {
    setVisibleCount(PAGE_SIZE);
    setSelectedIds(new Set());
  };

  const clearFilters = () => {
    setKpiPreset(null);
    setTypeFilter('all');
    setStatusFilter('all');
    setPriorityFilter('all');
    setTechFilter('all');
    setDateFrom('');
    setDateTo('');
    setSearch('');
    resetPaginationAndSelection();
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
    resetPaginationAndSelection();
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
      await load(true);
    } catch (err) {
      setFeedbackBanner(err instanceof Error ? err.message : 'No se pudo restaurar el parte.');
      setTimeout(() => setFeedbackBanner(null), 4000);
    } finally {
      setRestoringId(null);
    }
  };

  const toggleSelect = (taskId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  };

  const toggleSelectVisible = () => {
    const allVisibleSelected =
      paginatedTasks.length > 0 && paginatedTasks.every((t) => selectedIds.has(t.id));
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedTasks.map((t) => t.id)));
    }
  };

  const handleApplyBulk = async () => {
    if (selectedIds.size === 0) return;
    const patch: { assigned_to?: string | null; priority?: TaskPriority } = {};
    if (bulkTech !== '') {
      patch.assigned_to = bulkTech === '__unassigned__' ? null : bulkTech;
    }
    if (bulkPriority !== '') {
      patch.priority = bulkPriority;
    }
    if (Object.keys(patch).length === 0) return;

    setApplyingBulk(true);
    try {
      const ids = Array.from(selectedIds);
      const count = await bulkUpdateTasks(ids, patch, profile);
      setSelectedIds(new Set());
      setBulkTech('');
      setBulkPriority('');
      setFeedbackBanner(
        `Actualización en lote aplicada a ${count} parte${count === 1 ? '' : 's'}.`
      );
      setTimeout(() => setFeedbackBanner(null), 4000);
      await load(true);
    } catch (err) {
      setFeedbackBanner(
        err instanceof Error ? err.message : 'Error aplicando la actualización en lote.'
      );
      setTimeout(() => setFeedbackBanner(null), 4000);
    } finally {
      setApplyingBulk(false);
    }
  };

  const canBulkAct = isCoord && tab !== 'trash';
  const remainingCount = Math.max(0, filteredTasks.length - paginatedTasks.length);

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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => exportTasksCsv(filteredTasks)}
            >
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
                resetPaginationAndSelection();
              }}
              className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${
                tab === 'all'
                  ? 'bg-navy text-white'
                  : 'bg-white text-mid-grey border border-border'
              }`}
            >
              Todos ({activeTasks.length})
            </button>
          )}
          <button
            onClick={() => {
              setKpiPreset(null);
              setTab('mine');
              resetPaginationAndSelection();
            }}
            className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${
              tab === 'mine'
                ? 'bg-navy text-white'
                : 'bg-white text-mid-grey border border-border'
            }`}
          >
            Mis Tareas ({activeTasks.filter((t) => t.assigned_to === profile.id).length})
          </button>
          <button
            onClick={() => {
              setKpiPreset(null);
              setTab('unassigned');
              resetPaginationAndSelection();
            }}
            className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap ${
              tab === 'unassigned'
                ? 'bg-navy text-white'
                : 'bg-white text-mid-grey border border-border'
            }`}
          >
            Sin Asignar (
            {activeTasks.filter((t) => t.assigned_to === null && t.status === 'pending').length})
          </button>
          <button
            onClick={() => {
              setKpiPreset(null);
              setTab('overdue');
              resetPaginationAndSelection();
            }}
            className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap inline-flex items-center gap-1 ${
              tab === 'overdue'
                ? 'bg-danger text-white'
                : 'bg-white text-mid-grey border border-border hover:text-danger'
            }`}
          >
            <Clock size={13} /> Vencidos ({overdueTasks.length})
          </button>
          <button
            onClick={() => {
              setKpiPreset(null);
              setTab('trash');
              resetPaginationAndSelection();
            }}
            className={`px-3 py-2 text-xs font-bold uppercase tracking-wider transition-colors whitespace-nowrap inline-flex items-center gap-1.5 ${
              tab === 'trash'
                ? 'bg-danger text-white'
                : 'bg-white text-mid-grey border border-border hover:text-danger'
            }`}
          >
            <Trash2 size={13} /> Papelera{trashLoaded ? ` (${trashedTasks.length})` : ''}
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

      {kpiPreset && (
        <div className="flex items-center justify-between gap-2 p-2.5 bg-navy/5 border border-navy/25 rounded-sm text-xs">
          <span className="font-bold text-navy">
            Filtro rápido desde Panel General: {KPI_PRESET_LABELS[kpiPreset]}
          </span>
          <button
            type="button"
            onClick={() => setKpiPreset(null)}
            className="inline-flex items-center gap-1 px-2 py-1 font-bold text-mid-grey hover:text-charcoal bg-white border border-border rounded-xs"
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
            onChange={(e) => {
              setSearch(e.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder="Buscar código, cliente, equipo..."
            className="w-full pl-10 pr-3 py-2.5 bg-white border border-border text-charcoal focus:outline-none focus:ring-2 focus:ring-navy"
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
        <button
          type="button"
          onClick={() => setSavingPreset(!savingPreset)}
          className="px-3 py-2.5 border border-border bg-white text-xs font-bold text-navy inline-flex items-center gap-1.5 min-h-[44px] hover:bg-off-white"
          title="Guardar filtro actual como favorito"
        >
          <BookmarkPlus size={15} /> Guardar vista
        </button>
        {canBulkAct && paginatedTasks.length > 0 && (
          <button
            type="button"
            onClick={toggleSelectVisible}
            className="px-3 py-2.5 border border-border bg-white text-xs font-bold text-charcoal inline-flex items-center gap-1.5 min-h-[44px] hover:bg-off-white"
          >
            <CheckSquare size={15} className="text-magenta" />
            {paginatedTasks.every((t) => selectedIds.has(t.id))
              ? 'Deseleccionar'
              : 'Seleccionar lote'}
          </button>
        )}
      </div>

      {/* Barra de acciones en lote */}
      {canBulkAct && selectedIds.size > 0 && (
        <div className="bg-navy text-white rounded-md p-3.5 shadow-card flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs font-bold">
            <CheckSquare size={16} className="text-magenta" />
            <span>
              {selectedIds.size} parte{selectedIds.size === 1 ? '' : 's'} seleccionado
              {selectedIds.size === 1 ? '' : 's'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={bulkTech}
              onChange={(e) => setBulkTech(e.target.value)}
              className="px-2.5 py-1.5 bg-white text-charcoal text-xs font-semibold rounded-xs"
              aria-label="Reasignar técnico en lote"
            >
              <option value="">Reasignar técnico...</option>
              <option value="__unassigned__">Sin asignar</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>

            <select
              value={bulkPriority}
              onChange={(e) => setBulkPriority(e.target.value as TaskPriority | '')}
              className="px-2.5 py-1.5 bg-white text-charcoal text-xs font-semibold rounded-xs"
              aria-label="Cambiar prioridad en lote"
            >
              <option value="">Cambiar prioridad...</option>
              {Object.entries(TASK_PRIORITY_META).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>

            <Button
              type="button"
              size="sm"
              variant="accent"
              isLoading={applyingBulk}
              disabled={bulkTech === '' && bulkPriority === ''}
              onClick={handleApplyBulk}
            >
              Aplicar lote
            </Button>

            <button
              type="button"
              onClick={() =>
                exportTasksCsv(
                  filteredTasks.filter((t) => selectedIds.has(t.id)),
                  '_seleccion'
                )
              }
              className="px-2.5 py-1.5 bg-white/15 hover:bg-white/25 text-xs font-bold rounded-xs inline-flex items-center gap-1"
            >
              <Download size={13} /> CSV selección
            </button>

            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="p-1.5 text-white/80 hover:text-white"
              aria-label="Limpiar selección"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Formulario rápido guardar filtro favorito */}
      {savingPreset && (
        <form
          onSubmit={handleSavePreset}
          className="bg-white border border-border rounded-sm p-3 flex flex-wrap items-center gap-2"
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
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-border rounded-full text-xs font-semibold text-charcoal"
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
        <div className="bg-white rounded-md shadow-card p-4 border border-border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase text-mid-grey mb-1">
              Tipo de tarea
            </label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value as TaskType | 'all');
                setVisibleCount(PAGE_SIZE);
              }}
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
              onChange={(e) => {
                setStatusFilter(e.target.value as TaskStatus | 'all');
                setVisibleCount(PAGE_SIZE);
              }}
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
              onChange={(e) => {
                setPriorityFilter(e.target.value as TaskPriority | 'all');
                setVisibleCount(PAGE_SIZE);
              }}
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
                onChange={(e) => {
                  setTechFilter(e.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
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
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
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
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setVisibleCount(PAGE_SIZE);
                }}
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
            <div key={i} className="h-44 bg-white rounded-md animate-pulse shadow-card" />
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="bg-white rounded-md p-8 text-center shadow-card">
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
        <div className="bg-white rounded-md shadow-card overflow-x-auto border border-border/60">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-navy text-white text-xs uppercase tracking-wider">
                {canBulkAct && (
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      checked={
                        paginatedTasks.length > 0 &&
                        paginatedTasks.every((t) => selectedIds.has(t.id))
                      }
                      onChange={toggleSelectVisible}
                      aria-label="Seleccionar todos los partes visibles"
                      className="accent-magenta"
                    />
                  </th>
                )}
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
              {paginatedTasks.map((t) => {
                const sla = getSlaStatus(t);
                const isSelected = selectedIds.has(t.id);
                return (
                  <tr
                    key={t.id}
                    className={`hover:bg-off-white transition-colors ${
                      isSelected ? 'bg-navy/5' : ''
                    }`}
                  >
                    {canBulkAct && (
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(t.id)}
                          aria-label={`Seleccionar parte ${t.code}`}
                          className="accent-magenta"
                        />
                      </td>
                    )}
                    <td className="p-3 font-bold text-navy">
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
          {paginatedTasks.map((t) =>
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
              <TaskCard
                key={t.id}
                task={t}
                selectable={canBulkAct}
                selected={selectedIds.has(t.id)}
                onToggleSelect={() => toggleSelect(t.id)}
              />
            )
          )}
        </div>
      )}

      {/* Botón de paginación incremental */}
      {remainingCount > 0 && (
        <div className="pt-2 flex justify-center">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}
          >
            Cargar más partes ({remainingCount} restante{remainingCount === 1 ? '' : 's'})
          </Button>
        </div>
      )}
    </div>
  );
}
