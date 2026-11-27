import { describe, expect, it } from 'vitest';
import {
  extractTechnicalNotes,
  getLastResolutionAudit,
  isResolutionRequiredForClosure,
  validateTaskClosureRequirements,
} from '@/lib/task-notes';
import type { Profile, Task, TaskHistoryItem } from '@/types/database';

const techProfile: Profile = {
  id: 'u-tech',
  email: 'tech@test.com',
  full_name: 'Javier Ruiz',
  phone: null,
  avatar_url: null,
  role: 'technician',
  notification_level: 'all',
  is_active: true,
  created_at: '2026-01-01T09:00:00.000Z',
  updated_at: '2026-01-01T09:00:00.000Z',
};

const coordProfile: Profile = {
  ...techProfile,
  id: 'u-coord',
  email: 'coord@test.com',
  full_name: 'Laura Navarro',
  role: 'coordinator',
};

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    code: 'VS-2026-0001',
    task_type: 'rma_incident',
    customer_id: 'cust-1',
    site_contact_name: null,
    site_contact_phone: null,
    site_address: null,
    site_city: null,
    equipment_ref: 'Ricoh IM C3000',
    equipment_sn: 'SN-123',
    problem_desc: 'Avería test',
    priority: 'medium',
    status: 'in_progress',
    assigned_to: 'u-tech',
    assigned_at: '2026-01-01T09:15:00.000Z',
    resolution_notes: null,
    resolution: null,
    materials_used: [],
    client_signature_url: null,
    signer_name: null,
    pdf_url: null,
    completed_at: null,
    estimated_duration: null,
    created_by: 'u-coord',
    created_at: '2026-01-01T09:00:00.000Z',
    updated_at: '2026-01-01T09:15:00.000Z',
    ...overrides,
  };
}

describe('task-notes helpers', () => {
  it('extrae notas de historial ordenadas de más reciente a primera con autor y fecha', () => {
    const task = buildTask();
    const history: TaskHistoryItem[] = [
      {
        id: 'h-1',
        task_id: 'task-1',
        actor_id: 'u-tech',
        event_type: 'note_added',
        field_name: 'technical_notes',
        old_value: null,
        new_value: null,
        note: 'Primera revisión en equipo',
        metadata: {},
        created_at: '2026-01-01T10:00:00.000Z',
        actor: techProfile,
      },
      {
        id: 'h-status',
        task_id: 'task-1',
        actor_id: 'u-tech',
        event_type: 'status_changed',
        field_name: 'status',
        old_value: 'pending',
        new_value: 'in_progress',
        note: null,
        metadata: {},
        created_at: '2026-01-01T10:05:00.000Z',
        actor: techProfile,
      },
      {
        id: 'h-2',
        task_id: 'task-1',
        actor_id: 'u-coord',
        event_type: 'note_added',
        field_name: 'technical_notes',
        old_value: null,
        new_value: null,
        note: 'Solicitado fusor de repuesto',
        metadata: {},
        created_at: '2026-01-01T11:30:00.000Z',
        actor: coordProfile,
      },
    ];

    const notes = extractTechnicalNotes(task, history, [
      {
        id: 'off-1',
        text: 'Nota tomada offline en sótano',
        authorName: 'Javier Ruiz',
        createdAt: '2026-01-01T12:00:00.000Z',
        pendingSync: true,
      },
    ]);

    expect(notes).toHaveLength(3);
    expect(notes[0]).toMatchObject({
      text: 'Nota tomada offline en sótano',
      authorName: 'Javier Ruiz',
      pendingSync: true,
    });
    expect(notes[1]).toMatchObject({
      text: 'Solicitado fusor de repuesto',
      authorName: 'Laura Navarro',
    });
    expect(notes[2]).toMatchObject({
      text: 'Primera revisión en equipo',
      authorName: 'Javier Ruiz',
    });
  });

  it('usa resolution_notes como respaldo legacy si aún no existen note_added en historial', () => {
    const task = buildTask({
      resolution_notes: 'Nota heredada anterior',
      assignee: techProfile,
    });
    const notes = extractTechnicalNotes(task, []);
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toBe('Nota heredada anterior');
    expect(notes[0].authorName).toBe('Javier Ruiz');
    expect(notes[0].legacy).toBe(true);
  });

  it('exige resolución en RMA, CXC y Tareas, pero NO en Instalaciones', () => {
    expect(isResolutionRequiredForClosure('rma_incident')).toBe(true);
    expect(isResolutionRequiredForClosure('cxc_incident')).toBe(true);
    expect(isResolutionRequiredForClosure('task')).toBe(true);
    expect(isResolutionRequiredForClosure('installation')).toBe(false);

    expect(validateTaskClosureRequirements(buildTask({ task_type: 'rma_incident' }))).toMatch(
      /obligatorio indicar la resolución/i
    );
    expect(validateTaskClosureRequirements(buildTask({ task_type: 'task' }), '   ')).toMatch(
      /obligatorio indicar la resolución/i
    );
    expect(
      validateTaskClosureRequirements(
        buildTask({ task_type: 'cxc_incident', equipment_sn: null }),
        'Reparado'
      )
    ).toMatch(/Nº de Serie/i);
    expect(
      validateTaskClosureRequirements(
        buildTask({ task_type: 'cxc_incident', equipment_sn: 'SN-OK' }),
        ''
      )
    ).toMatch(/obligatorio indicar la resolución/i);
    expect(
      validateTaskClosureRequirements(
        buildTask({ task_type: 'rma_incident' }),
        'Sustituida placa base y verificado arranque'
      )
    ).toBeNull();
    expect(
      validateTaskClosureRequirements(buildTask({ task_type: 'installation', resolution: null }))
    ).toBeNull();
  });

  it('devuelve auditoría de resolución desde historial o campos del parte', () => {
    const task = buildTask({
      resolution: 'Equipo reparado',
      resolution_updated_at: '2026-01-01T12:10:00.000Z',
      resolution_updater: coordProfile,
    });
    const history: TaskHistoryItem[] = [
      {
        id: 'h-res',
        task_id: 'task-1',
        actor_id: 'u-tech',
        event_type: 'field_updated',
        field_name: 'resolution',
        old_value: null,
        new_value: 'Equipo reparado',
        note: 'Resolución registrada: Equipo reparado',
        metadata: {},
        created_at: '2026-01-01T12:15:00.000Z',
        actor: techProfile,
      },
    ];
    expect(getLastResolutionAudit(task, history)).toEqual({
      authorName: 'Javier Ruiz',
      updatedAt: '2026-01-01T12:15:00.000Z',
    });
    expect(getLastResolutionAudit(task, [])).toEqual({
      authorName: 'Laura Navarro',
      updatedAt: '2026-01-01T12:10:00.000Z',
    });
  });
});
