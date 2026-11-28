import { describe, expect, it } from 'vitest';
import { generateTaskPDF } from '@/lib/pdf-generator';
import {
  buildPdfFilename,
  formatDurationLabel,
  formatHistoryEventForPdf,
  getSignatureTimestamp,
  sanitizePdfText,
} from '@/lib/pdf-helpers';
import type { Profile, Task, TaskHistoryItem, TaskType } from '@/types/database';

const coord: Profile = {
  id: 'u-1',
  email: 'coord@test.com',
  full_name: 'Laura Navarro',
  phone: '+34 600 111 222',
  avatar_url: null,
  role: 'coordinator',
  notification_level: 'all',
  is_active: true,
  created_at: '2026-01-01T08:00:00.000Z',
  updated_at: '2026-01-01T08:00:00.000Z',
};

const tech: Profile = {
  ...coord,
  id: 'u-2',
  email: 'tech@test.com',
  full_name: 'Javier Ruiz',
  role: 'technician',
};

function makeTask(taskType: TaskType = 'rma_incident'): Task {
  return {
    id: `task-${taskType}`,
    code: 'VS-2026-0100',
    task_type: taskType,
    customer_id: 'cust-1',
    site_contact_name: 'Dra. Beatriz Gómez',
    site_contact_phone: '+34 915 234 890',
    site_address: 'Av. Constitución, 48',
    site_city: 'Madrid',
    equipment_ref: 'Ricoh IM C3000',
    equipment_sn: 'SN-9901',
    problem_desc: 'Atasco en unidad fusora y revisión completa.',
    priority: 'high',
    status: 'completed',
    assigned_to: tech.id,
    assigned_at: '2026-01-01T09:10:00.000Z',
    resolution_notes: null,
    resolution: taskType === 'installation' ? null : 'Sustituido rodillo fusor y limpiado sensor.',
    resolution_updated_at: taskType === 'installation' ? null : '2026-01-01T11:20:00.000Z',
    resolution_updated_by: taskType === 'installation' ? null : tech.id,
    materials_used: [
      { id: 'm1', name: 'Rodillo fusor superior', ref: 'RC-FUS-01', qty: 1 },
      { id: 'm2', name: 'Kit limpieza sensor', ref: 'KL-09', qty: 2 },
    ],
    meter_bw: taskType === 'cxc_incident' ? 45000 : null,
    meter_color: taskType === 'cxc_incident' ? 12300 : null,
    scheduled_date: taskType === 'installation' ? '2026-01-02T10:00:00.000Z' : null,
    merchandise_check_done: taskType === 'installation' ? true : null,
    merchandise_check_notes: taskType === 'installation' ? 'Embalaje perfecto.' : null,
    merchandise_checked_at: taskType === 'installation' ? '2026-01-01T10:00:00.000Z' : null,
    physical_work_order_attached: taskType === 'installation' ? false : null,
    client_signature_url: null,
    signer_name: 'Beatriz Gómez',
    pdf_url: null,
    completed_at: '2026-01-01T11:30:00.000Z',
    estimated_duration: 90,
    due_date: '2026-01-01T18:00:00.000Z',
    created_by: coord.id,
    created_at: '2026-01-01T09:00:00.000Z',
    updated_at: '2026-01-01T11:30:00.000Z',
    customer: {
      id: 'cust-1',
      name: 'Clínica Dental Vistalegre',
      tax_id: 'B87654321',
      address: 'Av. Constitución, 48',
      city: 'Madrid',
      postal_code: '28019',
      country: 'España',
      contact_name: 'Beatriz Gómez',
      contact_phone: '+34 915 234 890',
      contact_email: 'recepcion@clinicavistalegre.es',
      notes: null,
      is_active: true,
      created_by: coord.id,
      created_at: '2026-01-01T08:00:00.000Z',
      updated_at: '2026-01-01T08:00:00.000Z',
    },
    assignee: tech,
    creator: coord,
  };
}

const sampleHistory: TaskHistoryItem[] = [
  {
    id: 'h1',
    task_id: 'task-rma_incident',
    actor_id: coord.id,
    event_type: 'created',
    field_name: null,
    old_value: null,
    new_value: 'VS-2026-0100',
    note: 'Incidencia RMA creada',
    metadata: {},
    created_at: '2026-01-01T09:00:00.000Z',
    actor: coord,
  },
  {
    id: 'h2',
    task_id: 'task-rma_incident',
    actor_id: tech.id,
    event_type: 'status_changed',
    field_name: 'status',
    old_value: 'pending',
    new_value: 'completed',
    note: null,
    metadata: {},
    created_at: '2026-01-01T11:30:00.000Z',
    actor: tech,
  },
  {
    id: 'h3',
    task_id: 'task-rma_incident',
    actor_id: tech.id,
    event_type: 'note_added',
    field_name: 'technical_notes',
    old_value: null,
    new_value: null,
    note: 'Revisado termistor y comprobada temperatura nominal de fusión.',
    metadata: {},
    created_at: '2026-01-01T10:30:00.000Z',
    actor: tech,
  },
  {
    id: 'h4',
    task_id: 'task-rma_incident',
    actor_id: tech.id,
    event_type: 'signature_captured',
    field_name: 'client_signature_url',
    old_value: null,
    new_value: 'Beatriz Gómez',
    note: null,
    metadata: {},
    created_at: '2026-01-01T11:28:00.000Z',
    actor: tech,
  },
];

describe('pdf-helpers y generateTaskPDF', () => {
  it('genera nombres de archivo diferenciados por tipo y variante', () => {
    expect(buildPdfFilename(makeTask('rma_incident'), 'client')).toBe(
      'VS-2026-0100_parte_SAT_cliente.pdf'
    );
    expect(buildPdfFilename(makeTask('rma_incident'), 'internal')).toBe(
      'VS-2026-0100_parte_SAT_interno.pdf'
    );
    expect(buildPdfFilename(makeTask('installation'), 'client')).toBe(
      'VS-2026-0100_parte_instalacion_cliente.pdf'
    );
    expect(buildPdfFilename(makeTask('cxc_incident'), 'internal')).toBe(
      'VS-2026-0100_parte_CXC_interno.pdf'
    );
    expect(buildPdfFilename(makeTask('task'), 'client')).toBe(
      'VS-2026-0100_parte_tarea_cliente.pdf'
    );
  });

  it('formatea duraciones, historial en español y sanea texto WinAnsi', () => {
    expect(formatDurationLabel('2026-01-01T09:00:00.000Z', '2026-01-01T11:30:00.000Z')).toBe(
      '2 h 30 min'
    );
    expect(formatDurationLabel('2026-01-01T09:00:00.000Z', '2026-01-01T09:45:00.000Z')).toBe(
      '45 min'
    );
    expect(sanitizePdfText('Pendiente → Completada')).toBe('Pendiente -> Completada');
    expect(formatHistoryEventForPdf(sampleHistory[1]).text).toBe(
      'Estado: Pendiente -> Completada'
    );
    expect(getSignatureTimestamp(sampleHistory)).toBe('2026-01-01T11:28:00.000Z');
  });

  it('genera Blobs PDF válidos en variantes client e internal para los 4 tipos de parte', async () => {
    const types: TaskType[] = ['rma_incident', 'cxc_incident', 'installation', 'task'];
    for (const type of types) {
      const t = makeTask(type);
      const clientBlob = generateTaskPDF(t, sampleHistory, [], [], { variant: 'client' });
      const internalBlob = generateTaskPDF(t, sampleHistory, [], [], { variant: 'internal' });

      const clientHead = await clientBlob.slice(0, 5).text();
      const internalHead = await internalBlob.slice(0, 5).text();
      expect(clientHead).toBe('%PDF-');
      expect(internalHead).toBe('%PDF-');
      expect(internalBlob.size).toBeGreaterThan(clientBlob.size);
    }
  });

  it('incluye Productos a Instalar en PDF cliente e interno solo para partes de instalación', async () => {
    const emptyInst = makeTask('installation');
    emptyInst.installation_products = [];
    const clientWithout = generateTaskPDF(emptyInst, sampleHistory, [], [], { variant: 'client' });
    const internalWithout = generateTaskPDF(emptyInst, sampleHistory, [], [], {
      variant: 'internal',
    });

    const withProducts = makeTask('installation');
    withProducts.installation_products = [
      { id: 'p1', name: 'Multifuncion Ricoh IM C3500', qty: 2 },
      { id: 'p2', name: 'Finisher SR3260', qty: 1 },
    ];
    const clientWith = generateTaskPDF(withProducts, sampleHistory, [], [], { variant: 'client' });
    const internalWith = generateTaskPDF(withProducts, sampleHistory, [], [], {
      variant: 'internal',
    });

    const clientText = await clientWith.text();
    const internalText = await internalWith.text();

    expect(clientWith.size).toBeGreaterThan(clientWithout.size);
    expect(internalWith.size).toBeGreaterThan(internalWithout.size);
    expect(clientText).toContain('PRODUCTOS A INSTALAR');
    expect(internalText).toContain('PRODUCTOS A INSTALAR');
    expect(clientText).toContain('Multifuncion Ricoh IM C3500');
    expect(internalText).toContain('Finisher SR3260');

    // En otros tipos de parte nunca debe renderizarse Productos a Instalar aunque existiera dato
    for (const nonInstType of ['rma_incident', 'cxc_incident', 'task'] as TaskType[]) {
      const otherTask = makeTask(nonInstType);
      otherTask.installation_products = [{ id: 'px', name: 'Producto Residual', qty: 3 }];
      const otherClient = await generateTaskPDF(otherTask, sampleHistory, [], [], {
        variant: 'client',
      }).text();
      const otherInternal = await generateTaskPDF(otherTask, sampleHistory, [], [], {
        variant: 'internal',
      }).text();
      expect(otherClient).not.toContain('PRODUCTOS A INSTALAR');
      expect(otherInternal).not.toContain('PRODUCTOS A INSTALAR');
    }
  });
});
