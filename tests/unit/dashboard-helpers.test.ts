import { describe, expect, it } from 'vitest';
import {
  computeDashboardMetrics,
  computeResolutionStatsByType,
  filterTasksByKpi,
  getScheduledInstallations,
  getUnscheduledInstallations,
  sortOpenTasksByPriorityAndAge,
} from '@/lib/dashboard-helpers';
import type { Task } from '@/types/database';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    code: 'VS-2026-0001',
    task_type: 'rma_incident',
    customer_id: 'cust-1',
    site_contact_name: null,
    site_contact_phone: null,
    site_address: null,
    site_city: null,
    equipment_ref: 'Equipo test',
    equipment_sn: null,
    problem_desc: 'Avería test',
    priority: 'medium',
    status: 'pending',
    assigned_to: 'tech-1',
    assigned_at: null,
    resolution_notes: null,
    materials_used: [],
    client_signature_url: null,
    signer_name: null,
    pdf_url: null,
    completed_at: null,
    estimated_duration: null,
    due_date: null,
    scheduled_date: null,
    created_by: 'admin-1',
    created_at: '2026-11-20T10:00:00.000Z',
    updated_at: '2026-11-20T10:00:00.000Z',
    ...overrides,
  };
}

describe('dashboard-helpers', () => {
  it('ordena partes abiertos por prioridad y antigüedad de apertura', () => {
    const tasks: Task[] = [
      makeTask({ id: 'low-old', priority: 'low', created_at: '2026-11-10T08:00:00Z' }),
      makeTask({ id: 'high-new', priority: 'high', created_at: '2026-11-22T08:00:00Z' }),
      makeTask({ id: 'urgent-new', priority: 'urgent', created_at: '2026-11-21T08:00:00Z' }),
      makeTask({ id: 'high-old', priority: 'high', created_at: '2026-11-15T08:00:00Z' }),
      makeTask({ id: 'done', priority: 'urgent', status: 'completed' }),
    ];

    const sorted = sortOpenTasksByPriorityAndAge(tasks);
    expect(sorted.map((t) => t.id)).toEqual([
      'urgent-new',
      'high-old',
      'high-new',
      'low-old',
    ]);
  });

  it('separa y ordena instalaciones citadas y sin fecha correctamente', () => {
    const tasks: Task[] = [
      makeTask({
        id: 'inst-sched-late',
        task_type: 'installation',
        scheduled_date: '2026-12-05T10:00:00Z',
      }),
      makeTask({
        id: 'inst-sched-soon',
        task_type: 'installation',
        scheduled_date: '2026-12-01T09:00:00Z',
      }),
      makeTask({
        id: 'inst-unsched-new',
        task_type: 'installation',
        scheduled_date: null,
        created_at: '2026-11-25T10:00:00Z',
      }),
      makeTask({
        id: 'inst-unsched-old',
        task_type: 'installation',
        scheduled_date: null,
        created_at: '2026-11-18T10:00:00Z',
      }),
      makeTask({
        id: 'inst-completed',
        task_type: 'installation',
        status: 'completed',
        scheduled_date: '2026-11-29T10:00:00Z',
      }),
    ];

    expect(getScheduledInstallations(tasks).map((t) => t.id)).toEqual([
      'inst-sched-soon',
      'inst-sched-late',
    ]);
    expect(getUnscheduledInstallations(tasks).map((t) => t.id)).toEqual([
      'inst-unsched-old',
      'inst-unsched-new',
    ]);
  });

  it('calcula métricas globales de los 4 estados y tiempos medios por tipo', () => {
    const tasks: Task[] = [
      makeTask({ id: '1', status: 'pending', priority: 'urgent' }),
      makeTask({ id: '2', status: 'in_progress', priority: 'high' }),
      makeTask({
        id: '3',
        task_type: 'cxc_incident',
        status: 'completed',
        created_at: '2026-11-20T08:00:00Z',
        completed_at: '2026-11-20T12:00:00Z',
      }),
      makeTask({
        id: '4',
        task_type: 'installation',
        status: 'completed',
        created_at: '2026-11-20T08:00:00Z',
        completed_at: '2026-11-20T10:00:00Z',
      }),
      makeTask({ id: '5', status: 'cancelled' }),
    ];

    const metrics = computeDashboardMetrics(tasks);
    expect(metrics.total).toBe(5);
    expect(metrics.pendingCount).toBe(1);
    expect(metrics.inProgressCount).toBe(1);
    expect(metrics.completedCount).toBe(2);
    expect(metrics.activeCount).toBe(2);
    expect(metrics.urgentHighCount).toBe(2);
    expect(metrics.closeRate).toBe(40);
    expect(metrics.avgHours).toBe(3);

    const byType = computeResolutionStatsByType(tasks);
    expect(byType.global.count).toBe(2);
    expect(byType.global.avgHours).toBe(3);
    const cxc = byType.byType.find((b) => b.taskType === 'cxc_incident');
    const inst = byType.byType.find((b) => b.taskType === 'installation');
    expect(cxc?.avgHours).toBe(4);
    expect(inst?.avgHours).toBe(2);

    expect(filterTasksByKpi(tasks, 'pending').map((t) => t.id)).toEqual(['1']);
    expect(filterTasksByKpi(tasks, 'in_progress').map((t) => t.id)).toEqual(['2']);
  });
});
