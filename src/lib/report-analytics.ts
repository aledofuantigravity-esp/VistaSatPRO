import {
  computeResolutionStatsByType,
  formatDurationHours,
  isOpenTask,
} from '@/lib/dashboard-helpers';
import { getSlaStatus } from '@/lib/sla';
import {
  normalizeTaskStatus,
  resolveTaskType,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  TASK_TYPE_META,
  type PartCatalogItem,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from '@/types/database';

export type ReportPdfVariant = 'internal' | 'client';

export interface ReportFiltersSummary {
  dateFrom?: string;
  dateTo?: string;
  typeLabel?: string;
  technicianName?: string;
  customerName?: string;
  statusLabel?: string;
  isSingleCustomer?: boolean;
}

export interface ReportTimelineBucket {
  label: string;
  opened: number;
  closed: number;
}

export interface ReportTypeStat {
  taskType: TaskType;
  label: string;
  shortLabel: string;
  total: number;
  open: number;
  completed: number;
  pct: number;
  avgFormatted: string;
  avgHours: number | null;
}

export interface ReportStatusStat {
  status: TaskStatus;
  label: string;
  count: number;
  pct: number;
}

export interface ReportPriorityStat {
  priority: TaskPriority;
  label: string;
  count: number;
  openCount: number;
  pct: number;
}

export interface ReportConsumedPart {
  name: string;
  ref?: string;
  qty: number;
  taskCount: number;
  unitCost: number | null;
  estimatedCost: number | null;
}

export interface ReportInstallProduct {
  name: string;
  qty: number;
  taskCount: number;
}

export interface ReportInstallationsSummary {
  total: number;
  open: number;
  completed: number;
  scheduled: number;
  unscheduled: number;
  merchandiseChecked: number;
  merchandisePending: number;
  merchandiseCheckedPct: number;
  physicalOrderAttached: number;
  physicalOrderPct: number;
  products: ReportInstallProduct[];
  totalProductUnits: number;
}

export interface ReportCriticalTask {
  code: string;
  customerName: string;
  taskTypeLabel: string;
  priority: TaskPriority;
  priorityLabel: string;
  slaLabel: string;
  isOverdue: boolean;
  technicianName: string;
  ageLabel: string;
}

export interface ReportCustomerRow {
  name: string;
  total: number;
  open: number;
  closed: number;
  pct: number;
}

export interface ReportTechRow {
  name: string;
  total: number;
  open: number;
  completed: number;
  rate: number;
  avgHours: string;
}

export interface ReportAnalytics {
  kpis: {
    total: number;
    open: number;
    pending: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    closeRate: number;
    avgHoursFormatted: string;
    closedWithDurationCount: number;
    urgentHighOpenCount: number;
    unassignedCount: number;
    slaTrackedCount: number;
    slaOnTrackCount: number;
    slaOverdueCount: number;
    slaDueTodayCount: number;
    slaCompliancePct: number | null;
    totalMaterialUnits: number;
    totalEstimatedPartsCost: number;
    hasEstimatedCost: boolean;
    totalInstallProductsUnits: number;
  };
  timeline: ReportTimelineBucket[];
  timelineGranularityLabel: string;
  byType: ReportTypeStat[];
  byStatus: ReportStatusStat[];
  byPriority: ReportPriorityStat[];
  criticalTasks: ReportCriticalTask[];
  installationsSummary: ReportInstallationsSummary;
  consumedParts: ReportConsumedPart[];
  topCustomers: ReportCustomerRow[];
  techStats: ReportTechRow[];
  insights: string[];
}

const MONTH_SHORT_ES = [
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];

function startOfDayTs(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function startOfWeekMonday(d: Date): Date {
  const day = d.getDay(); // 0=Dom..6=Sáb
  const diffToMon = day === 0 ? -6 : 1 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + diffToMon);
}

function buildTimeline(
  tasks: Task[],
  filters: ReportFiltersSummary
): { buckets: ReportTimelineBucket[]; granularityLabel: string } {
  const validDates = tasks
    .map((t) => Date.parse(t.created_at))
    .filter((ts) => Number.isFinite(ts));

  const now = new Date();
  let minDate = filters.dateFrom
    ? new Date(`${filters.dateFrom}T00:00:00`)
    : validDates.length > 0
    ? new Date(Math.min(...validDates))
    : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);

  let maxDate = filters.dateTo
    ? new Date(`${filters.dateTo}T23:59:59`)
    : validDates.length > 0
    ? new Date(Math.max(...validDates, now.getTime()))
    : now;

  if (Number.isNaN(minDate.getTime())) {
    minDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13);
  }
  if (Number.isNaN(maxDate.getTime()) || maxDate < minDate) {
    maxDate = new Date(minDate.getTime());
  }

  const spanDays = Math.max(
    1,
    Math.ceil((startOfDayTs(maxDate) - startOfDayTs(minDate)) / 86_400_000) + 1
  );

  // <= 21 días: evolución diaria (máx 14 días)
  if (spanDays <= 21) {
    const numDays = Math.min(14, Math.max(7, spanDays));
    const endDay = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate());
    const map = new Map<string, ReportTimelineBucket>();
    const keys: string[] = [];

    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date(endDay.getFullYear(), endDay.getMonth(), endDay.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`;
      const label = `${String(d.getDate()).padStart(2, '0')}/${String(
        d.getMonth() + 1
      ).padStart(2, '0')}`;
      keys.push(key);
      map.set(key, { label, opened: 0, closed: 0 });
    }

    for (const t of tasks) {
      const openKey = t.created_at.slice(0, 10);
      const openBucket = map.get(openKey);
      if (openBucket) openBucket.opened += 1;

      if (t.completed_at) {
        const closeKey = t.completed_at.slice(0, 10);
        const closeBucket = map.get(closeKey);
        if (closeBucket) closeBucket.closed += 1;
      }
    }

    return {
      buckets: keys.map((k) => map.get(k)!),
      granularityLabel: 'Evolución diaria (Aperturas vs Cierres)',
    };
  }

  // <= 120 días: evolución semanal (máx 12 semanas)
  if (spanDays <= 120) {
    const numWeeks = Math.min(12, Math.max(4, Math.ceil(spanDays / 7)));
    const endWeek = startOfWeekMonday(maxDate);
    const map = new Map<string, ReportTimelineBucket>();
    const keys: string[] = [];

    for (let i = numWeeks - 1; i >= 0; i--) {
      const w = new Date(endWeek.getFullYear(), endWeek.getMonth(), endWeek.getDate() - i * 7);
      const key = `${w.getFullYear()}-${String(w.getMonth() + 1).padStart(2, '0')}-${String(
        w.getDate()
      ).padStart(2, '0')}`;
      const label = `${String(w.getDate()).padStart(2, '0')}/${String(
        w.getMonth() + 1
      ).padStart(2, '0')}`;
      keys.push(key);
      map.set(key, { label, opened: 0, closed: 0 });
    }

    const weekKeyOf = (iso: string): string | null => {
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return null;
      const w = startOfWeekMonday(d);
      return `${w.getFullYear()}-${String(w.getMonth() + 1).padStart(2, '0')}-${String(
        w.getDate()
      ).padStart(2, '0')}`;
    };

    for (const t of tasks) {
      const ok = weekKeyOf(t.created_at);
      if (ok && map.has(ok)) map.get(ok)!.opened += 1;
      if (t.completed_at) {
        const ck = weekKeyOf(t.completed_at);
        if (ck && map.has(ck)) map.get(ck)!.closed += 1;
      }
    }

    return {
      buckets: keys.map((k) => map.get(k)!),
      granularityLabel: 'Evolución semanal (Aperturas vs Cierres)',
    };
  }

  // > 120 días: evolución mensual (máx 12 meses)
  const totalMonths =
    (maxDate.getFullYear() - minDate.getFullYear()) * 12 +
    (maxDate.getMonth() - minDate.getMonth()) +
    1;
  const numMonths = Math.min(12, Math.max(3, totalMonths));
  const map = new Map<string, ReportTimelineBucket>();
  const keys: string[] = [];

  for (let i = numMonths - 1; i >= 0; i--) {
    const m = new Date(maxDate.getFullYear(), maxDate.getMonth() - i, 1);
    const key = `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`;
    const label = `${MONTH_SHORT_ES[m.getMonth()]} ${String(m.getFullYear()).slice(-2)}`;
    keys.push(key);
    map.set(key, { label, opened: 0, closed: 0 });
  }

  for (const t of tasks) {
    const ok = t.created_at.slice(0, 7);
    if (map.has(ok)) map.get(ok)!.opened += 1;
    if (t.completed_at) {
      const ck = t.completed_at.slice(0, 7);
      if (map.has(ck)) map.get(ck)!.closed += 1;
    }
  }

  return {
    buckets: keys.map((k) => map.get(k)!),
    granularityLabel: 'Evolución mensual (Aperturas vs Cierres)',
  };
}

/**
 * Calcula toda la analítica, KPIs, SLA, evolución temporal, instalaciones, costes y
 * conclusiones clave de un conjunto de partes para el PDF de Informes.
 */
export function computeReportAnalytics(input: {
  tasks: Task[];
  partsCatalog?: PartCatalogItem[];
  techStats?: Array<{
    name: string;
    total: number;
    completed: number;
    rate: number;
    avgHours: string;
  }>;
  topCustomers?: Array<{ name: string; total: number; open: number }>;
  filters: ReportFiltersSummary;
  variant: ReportPdfVariant;
}): ReportAnalytics {
  const { tasks, partsCatalog = [], filters, variant } = input;
  const total = tasks.length;

  let pending = 0;
  let inProgress = 0;
  let completed = 0;
  let cancelled = 0;
  let urgentHighOpenCount = 0;
  let unassignedCount = 0;

  let slaTrackedCount = 0;
  let slaOnTrackCount = 0;
  let slaOverdueCount = 0;
  let slaDueTodayCount = 0;

  const durationHoursList: number[] = [];

  for (const t of tasks) {
    const st = normalizeTaskStatus(t.status);
    if (st === 'pending') pending += 1;
    else if (st === 'in_progress') inProgress += 1;
    else if (st === 'completed') completed += 1;
    else if (st === 'cancelled') cancelled += 1;

    const open = st !== 'completed' && st !== 'cancelled';
    if (open) {
      if (t.priority === 'urgent' || t.priority === 'high') {
        urgentHighOpenCount += 1;
      }
      if (!t.assigned_to) {
        unassignedCount += 1;
      }
    }

    if (st === 'completed' && t.completed_at) {
      const startMs = Date.parse(t.created_at);
      const endMs = Date.parse(t.completed_at);
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs) {
        durationHoursList.push(Math.max(0.05, (endMs - startMs) / 3_600_000));
      }
    }

    // SLA tracking
    if (t.due_date) {
      slaTrackedCount += 1;
      if (st === 'completed' && t.completed_at) {
        if (Date.parse(t.completed_at) <= Date.parse(t.due_date)) {
          slaOnTrackCount += 1;
        } else {
          slaOverdueCount += 1;
        }
      } else if (open) {
        const sla = getSlaStatus(t);
        if (sla?.state === 'overdue') {
          slaOverdueCount += 1;
        } else if (sla?.state === 'due_today') {
          slaDueTodayCount += 1;
          slaOnTrackCount += 1;
        } else {
          slaOnTrackCount += 1;
        }
      } else {
        slaOnTrackCount += 1;
      }
    }
  }

  const openCount = pending + inProgress;
  const closeRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const avgHours =
    durationHoursList.length > 0
      ? durationHoursList.reduce((acc, h) => acc + h, 0) / durationHoursList.length
      : null;
  const avgHoursFormatted = formatDurationHours(avgHours);
  const slaCompliancePct =
    slaTrackedCount > 0 ? Math.round((slaOnTrackCount / slaTrackedCount) * 100) : null;

  // Evolución temporal
  const { buckets: timeline, granularityLabel: timelineGranularityLabel } = buildTimeline(
    tasks,
    filters
  );

  // Por tipo + tiempos medios
  const resStats = computeResolutionStatsByType(tasks);
  const typeOrder: TaskType[] = ['installation', 'rma_incident', 'cxc_incident', 'task'];
  const byType: ReportTypeStat[] = typeOrder.map((tt) => {
    const subset = tasks.filter((t) => resolveTaskType(t) === tt);
    const subOpen = subset.filter(isOpenTask).length;
    const subDone = subset.filter((t) => normalizeTaskStatus(t.status) === 'completed').length;
    const rStat = resStats.byType.find((b) => b.taskType === tt);
    return {
      taskType: tt,
      label: TASK_TYPE_META[tt].label,
      shortLabel: TASK_TYPE_META[tt].shortLabel,
      total: subset.length,
      open: subOpen,
      completed: subDone,
      pct: total > 0 ? Math.round((subset.length / total) * 100) : 0,
      avgFormatted: rStat?.formatted || 'Sin cierres',
      avgHours: rStat?.avgHours ?? null,
    };
  });

  // Por estado
  const statusOrder: TaskStatus[] = ['pending', 'in_progress', 'completed', 'cancelled'];
  const statusCounts: Record<TaskStatus, number> = {
    pending,
    in_progress: inProgress,
    completed,
    cancelled,
  };
  const byStatus: ReportStatusStat[] = statusOrder.map((st) => ({
    status: st,
    label: TASK_STATUS_META[st].label,
    count: statusCounts[st],
    pct: total > 0 ? Math.round((statusCounts[st] / total) * 100) : 0,
  }));

  // Por prioridad
  const prioOrder: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];
  const byPriority: ReportPriorityStat[] = prioOrder.map((p) => {
    const subset = tasks.filter((t) => t.priority === p);
    return {
      priority: p,
      label: TASK_PRIORITY_META[p].label,
      count: subset.length,
      openCount: subset.filter(isOpenTask).length,
      pct: total > 0 ? Math.round((subset.length / total) * 100) : 0,
    };
  });

  // Focos críticos (abiertos urgentes o SLA en riesgo/vencido)
  const criticalTasks: ReportCriticalTask[] = tasks
    .filter((t) => {
      if (!isOpenTask(t)) return false;
      const sla = getSlaStatus(t);
      return t.priority === 'urgent' || sla?.state === 'overdue' || sla?.state === 'due_today';
    })
    .map((t) => {
      const sla = getSlaStatus(t);
      const isOverdue = sla?.state === 'overdue';
      const ageHours = Math.max(0.1, (Date.now() - Date.parse(t.created_at)) / 3_600_000);
      return {
        code: t.code,
        customerName: t.customer?.name || 'Cliente',
        taskTypeLabel: TASK_TYPE_META[resolveTaskType(t)].shortLabel,
        priority: t.priority,
        priorityLabel: TASK_PRIORITY_META[t.priority].label,
        slaLabel: sla ? sla.shortLabel : 'Sin SLA',
        isOverdue,
        technicianName: t.assignee?.full_name || 'Sin asignar',
        ageLabel: formatDurationHours(ageHours),
        sortWeight: (isOverdue ? 0 : sla?.state === 'due_today' ? 1 : 2) * 10 + (t.priority === 'urgent' ? 0 : 1),
        createdAt: t.created_at,
      };
    })
    .sort((a, b) => a.sortWeight - b.sortWeight || a.createdAt.localeCompare(b.createdAt))
    .slice(0, 12)
    .map(({ sortWeight: _sw, createdAt: _ca, ...rest }) => {
      void _sw;
      void _ca;
      return rest;
    });

  // Resumen de Instalaciones y Productos a Instalar
  const instTasks = tasks.filter((t) => resolveTaskType(t) === 'installation');
  const instOpen = instTasks.filter(isOpenTask).length;
  const instCompleted = instTasks.filter((t) => normalizeTaskStatus(t.status) === 'completed').length;
  const instScheduled = instTasks.filter((t) => isOpenTask(t) && Boolean(t.scheduled_date)).length;
  const instUnscheduled = instTasks.filter((t) => isOpenTask(t) && !t.scheduled_date).length;
  const merchChecked = instTasks.filter((t) => t.merchandise_check_done === true).length;
  const merchPending = Math.max(0, instTasks.length - merchChecked);
  const physAttached = instTasks.filter((t) => t.physical_work_order_attached === true).length;

  const productAgg = new Map<string, { name: string; qty: number; taskIds: Set<string> }>();
  let totalInstallProductsUnits = 0;
  for (const t of instTasks) {
    for (const p of t.installation_products || []) {
      const cleanName = p.name.trim();
      if (!cleanName) continue;
      const qty = Math.max(1, Math.floor(Number(p.qty) || 1));
      totalInstallProductsUnits += qty;
      const key = cleanName.toLowerCase();
      const entry = productAgg.get(key) || {
        name: cleanName,
        qty: 0,
        taskIds: new Set<string>(),
      };
      entry.qty += qty;
      entry.taskIds.add(t.id);
      productAgg.set(key, entry);
    }
  }

  const installProducts: ReportInstallProduct[] = Array.from(productAgg.values())
    .map((item) => ({
      name: item.name,
      qty: item.qty,
      taskCount: item.taskIds.size,
    }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 12);

  const installationsSummary: ReportInstallationsSummary = {
    total: instTasks.length,
    open: instOpen,
    completed: instCompleted,
    scheduled: instScheduled,
    unscheduled: instUnscheduled,
    merchandiseChecked: merchChecked,
    merchandisePending: merchPending,
    merchandiseCheckedPct:
      instTasks.length > 0 ? Math.round((merchChecked / instTasks.length) * 100) : 0,
    physicalOrderAttached: physAttached,
    physicalOrderPct:
      instTasks.length > 0 ? Math.round((physAttached / instTasks.length) * 100) : 0,
    products: installProducts,
    totalProductUnits: totalInstallProductsUnits,
  };

  // Repuestos consumidos + cruce con Catálogo de Repuestos para coste estimado
  const catalogByRef = new Map<string, PartCatalogItem>();
  const catalogByName = new Map<string, PartCatalogItem>();
  for (const cat of partsCatalog) {
    if (cat.ref?.trim()) {
      catalogByRef.set(cat.ref.trim().toLowerCase(), cat);
    }
    catalogByName.set(cat.name.trim().toLowerCase(), cat);
  }

  const partAgg = new Map<
    string,
    { name: string; ref?: string; qty: number; taskIds: Set<string> }
  >();
  let totalMaterialUnits = 0;

  for (const t of tasks) {
    for (const m of t.materials_used || []) {
      const cleanName = m.name.trim();
      if (!cleanName) continue;
      const qty = Math.max(1, Math.floor(Number(m.qty) || 1));
      totalMaterialUnits += qty;
      const key = `${cleanName.toLowerCase()}::${(m.ref || '').trim().toLowerCase()}`;
      const existing = partAgg.get(key) || {
        name: cleanName,
        ref: m.ref?.trim() || undefined,
        qty: 0,
        taskIds: new Set<string>(),
      };
      existing.qty += qty;
      existing.taskIds.add(t.id);
      partAgg.set(key, existing);
    }
  }

  let totalEstimatedPartsCost = 0;
  let hasEstimatedCost = false;

  const consumedParts: ReportConsumedPart[] = Array.from(partAgg.values())
    .map((item) => {
      const match =
        (item.ref ? catalogByRef.get(item.ref.toLowerCase()) : undefined) ||
        catalogByName.get(item.name.toLowerCase());
      const unitCost =
        match && match.unit_cost !== null && Number.isFinite(Number(match.unit_cost))
          ? Number(match.unit_cost)
          : null;
      const estimatedCost = unitCost !== null ? unitCost * item.qty : null;
      if (estimatedCost !== null) {
        totalEstimatedPartsCost += estimatedCost;
        hasEstimatedCost = true;
      }
      return {
        name: item.name,
        ref: item.ref,
        qty: item.qty,
        taskCount: item.taskIds.size,
        unitCost,
        estimatedCost,
      };
    })
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 12);

  // Top clientes & Rendimiento técnico
  const topCustomers: ReportCustomerRow[] = (input.topCustomers || []).map((c) => ({
    name: c.name,
    total: c.total,
    open: c.open,
    closed: Math.max(0, c.total - c.open),
    pct: total > 0 ? Math.round((c.total / total) * 100) : 0,
  }));

  const techStats: ReportTechRow[] = (input.techStats || []).map((r) => ({
    name: r.name,
    total: r.total,
    open: Math.max(0, r.total - r.completed),
    completed: r.completed,
    rate: r.rate,
    avgHours: r.avgHours,
  }));

  // Conclusiones automáticas (sin IA, 100% deterministas)
  const insights: string[] = [];
  if (total === 0) {
    insights.push('No se han registrado partes de trabajo en el alcance filtrado.');
  } else {
    insights.push(
      `Se analizaron ${total} parte(s): ${completed} completado(s) (${closeRate}% de tasa de cierre) y ${openCount} activo(s).`
    );

    const typeSeg = (typeKey: TaskType, prefix: string) => {
      const entry = byType.find((item) => item.taskType === typeKey);
      return `${prefix} ${entry && entry.avgHours !== null ? entry.avgFormatted : '—'}`;
    };
    if (durationHoursList.length > 0) {
      insights.push(
        `Tiempos medios de cierre: ${typeSeg('cxc_incident', 'CXC')}, ${typeSeg('rma_incident', 'RMA')}, ${typeSeg('installation', 'Instalaciones')}, ${typeSeg('task', 'Tareas')}.`
      );
    }

    if (slaTrackedCount > 0 && slaCompliancePct !== null) {
      insights.push(
        slaOverdueCount > 0
          ? `Cumplimiento SLA del ${slaCompliancePct}% sobre ${slaTrackedCount} parte(s) con plazo; atención a ${slaOverdueCount} parte(s) vencido(s).`
          : `Cumplimiento SLA del ${slaCompliancePct}% (${slaTrackedCount} parte(s) con plazo, sin vencimientos en el período).`
      );
    }

    if (criticalTasks.length > 0 && variant === 'internal') {
      insights.push(
        `Existen ${criticalTasks.length} foco(s) crítico(s) abierto(s) (prioridad Urgente o SLA en riesgo/vencido) que requieren seguimiento prioritario.`
      );
    }

    const slowestType = [...byType]
      .filter((b) => b.avgHours !== null && b.completed > 0)
      .sort((a, b) => (b.avgHours ?? 0) - (a.avgHours ?? 0))[0];
    if (slowestType) {
      insights.push(
        `El tipo de intervención con mayor tiempo medio de cierre es "${slowestType.label}" (${slowestType.avgFormatted} en ${slowestType.completed} cierre(s)).`
      );
    }

    if (variant === 'internal' && topCustomers.length > 0 && !filters.isSingleCustomer) {
      const leadCust = topCustomers[0];
      insights.push(
        `Mayor concentración de demanda en ${leadCust.name} con ${leadCust.total} parte(s) (${leadCust.pct}% del volumen total).`
      );
    } else if (installationsSummary.total > 0) {
      insights.push(
        `En Instalaciones (${installationsSummary.total}), el cotejo de mercancía alcanza el ${installationsSummary.merchandiseCheckedPct}% y se contabilizan ${totalInstallProductsUnits} unidad(es) de producto(s).`
      );
    }
  }

  return {
    kpis: {
      total,
      open: openCount,
      pending,
      inProgress,
      completed,
      cancelled,
      closeRate,
      avgHoursFormatted,
      closedWithDurationCount: durationHoursList.length,
      urgentHighOpenCount,
      unassignedCount,
      slaTrackedCount,
      slaOnTrackCount,
      slaOverdueCount,
      slaDueTodayCount,
      slaCompliancePct,
      totalMaterialUnits,
      totalEstimatedPartsCost,
      hasEstimatedCost,
      totalInstallProductsUnits,
    },
    timeline,
    timelineGranularityLabel,
    byType,
    byStatus,
    byPriority,
    criticalTasks,
    installationsSummary,
    consumedParts,
    topCustomers,
    techStats,
    insights: insights.slice(0, 5),
  };
}
