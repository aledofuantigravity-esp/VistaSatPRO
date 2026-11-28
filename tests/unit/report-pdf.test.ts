import { describe, expect, it } from 'vitest';
import { computeReportAnalytics } from '@/lib/report-analytics';
import {
  buildReportPdfFilename,
  generateReportPDF,
  type ReportPdfInput,
} from '@/lib/report-pdf-generator';
import type { PartCatalogItem, Task } from '@/types/database';

const catalog: PartCatalogItem[] = [
  {
    id: 'cat-1',
    name: 'Rodillo fusor superior',
    ref: 'RC-FUS-01',
    category: 'Fusión',
    unit_cost: 80,
    notes: null,
    is_active: true,
    created_by: null,
    created_at: '2026-10-01T08:00:00.000Z',
    updated_at: '2026-10-01T08:00:00.000Z',
  },
];

const sampleTasks: Task[] = [
  {
    id: 't-1',
    code: 'VS-2026-0010',
    task_type: 'rma_incident',
    customer_id: 'c-1',
    site_contact_name: 'Ana',
    site_contact_phone: '600000001',
    site_address: 'Calle Mayor 1',
    site_city: 'Madrid',
    equipment_ref: 'Ricoh IM C3000',
    equipment_sn: 'SN-10',
    problem_desc: 'Atasco en unidad fusora',
    priority: 'urgent',
    status: 'in_progress',
    assigned_to: 'u-tech-1',
    assigned_at: '2026-11-10T09:00:00.000Z',
    resolution_notes: null,
    materials_used: [{ id: 'm1', name: 'Rodillo fusor superior', ref: 'RC-FUS-01', qty: 2 }],
    client_signature_url: null,
    signer_name: null,
    pdf_url: null,
    completed_at: null,
    estimated_duration: 60,
    due_date: '2026-11-12T10:00:00.000Z', // Vencido respecto a fecha actual
    created_by: 'u-coord',
    created_at: '2026-11-10T08:00:00.000Z',
    updated_at: '2026-11-10T09:00:00.000Z',
    customer: {
      id: 'c-1',
      name: 'Hotel Mirador Norte',
      tax_id: 'B11111111',
      address: 'Calle Mayor 1',
      city: 'Madrid',
      postal_code: '28001',
      country: 'España',
      contact_name: 'Ana',
      contact_phone: '600000001',
      contact_email: 'ana@mirador.es',
      notes: null,
      is_active: true,
      created_by: null,
      created_at: '2026-10-01T08:00:00.000Z',
      updated_at: '2026-10-01T08:00:00.000Z',
    },
    assignee: {
      id: 'u-tech-1',
      email: 'tech@test.com',
      full_name: 'Javier Ruiz',
      phone: null,
      avatar_url: null,
      role: 'technician',
      notification_level: 'all',
      is_active: true,
      created_at: '2026-10-01T08:00:00.000Z',
      updated_at: '2026-10-01T08:00:00.000Z',
    },
  },
  {
    id: 't-2',
    code: 'VS-2026-0011',
    task_type: 'installation',
    customer_id: 'c-2',
    site_contact_name: 'Carlos',
    site_contact_phone: '600000002',
    site_address: 'Av. Europa 20',
    site_city: 'Valencia',
    equipment_ref: 'Ricoh IM C3500',
    equipment_sn: 'SN-11',
    problem_desc: 'Instalación completa planta 1',
    priority: 'medium',
    status: 'completed',
    assigned_to: 'u-tech-1',
    assigned_at: '2026-11-14T08:00:00.000Z',
    resolution_notes: null,
    materials_used: [],
    installation_products: [
      { id: 'ip-1', name: 'Multifuncion Ricoh IM C3500', qty: 2 },
      { id: 'ip-2', name: 'Finisher SR3260', qty: 1 },
    ],
    scheduled_date: '2026-11-16',
    merchandise_check_done: true,
    physical_work_order_attached: true,
    client_signature_url: null,
    signer_name: 'Carlos',
    pdf_url: null,
    completed_at: '2026-11-16T14:00:00.000Z',
    estimated_duration: 180,
    due_date: '2026-11-20T18:00:00.000Z',
    created_by: 'u-coord',
    created_at: '2026-11-14T08:00:00.000Z',
    updated_at: '2026-11-16T14:00:00.000Z',
    customer: {
      id: 'c-2',
      name: 'Clinica Dental Vistalegre',
      tax_id: 'B22222222',
      address: 'Av. Europa 20',
      city: 'Valencia',
      postal_code: '46001',
      country: 'España',
      contact_name: 'Carlos',
      contact_phone: '600000002',
      contact_email: 'carlos@clinica.es',
      notes: null,
      is_active: true,
      created_by: null,
      created_at: '2026-10-01T08:00:00.000Z',
      updated_at: '2026-10-01T08:00:00.000Z',
    },
    assignee: {
      id: 'u-tech-1',
      email: 'tech@test.com',
      full_name: 'Javier Ruiz',
      phone: null,
      avatar_url: null,
      role: 'technician',
      notification_level: 'all',
      is_active: true,
      created_at: '2026-10-01T08:00:00.000Z',
      updated_at: '2026-10-01T08:00:00.000Z',
    },
  },
];

function makeReportInput(variant: 'internal' | 'client', singleCustomer = false): ReportPdfInput {
  return {
    variant,
    generatedBy: 'Laura Navarro',
    filters: {
      dateFrom: '2026-11-01',
      dateTo: '2026-11-30',
      typeLabel: 'Todos',
      technicianName: 'Todos',
      customerName: singleCustomer ? 'Hotel Mirador Norte' : 'Todos',
      statusLabel: 'Todos',
      isSingleCustomer: singleCustomer,
    },
    partsCatalog: catalog,
    techStats: [
      {
        name: 'Javier Ruiz',
        total: 2,
        completed: 1,
        rate: 50,
        avgHours: '54.0',
      },
    ],
    topCustomers: [
      { name: 'Hotel Mirador Norte', total: 1, open: 1 },
      { name: 'Clinica Dental Vistalegre', total: 1, open: 0 },
    ],
    tasks: sampleTasks,
  };
}

describe('report-analytics y report-pdf-generator', () => {
  it('calcula analítica SLA, instalaciones, productos y coste estimado desde catálogo', () => {
    const analytics = computeReportAnalytics({
      tasks: sampleTasks,
      partsCatalog: catalog,
      techStats: [{ name: 'Javier Ruiz', total: 2, completed: 1, rate: 50, avgHours: '54.0' }],
      topCustomers: [
        { name: 'Hotel Mirador Norte', total: 1, open: 1 },
        { name: 'Clinica Dental Vistalegre', total: 1, open: 0 },
      ],
      filters: { isSingleCustomer: false },
      variant: 'internal',
    });

    expect(analytics.kpis.total).toBe(2);
    expect(analytics.kpis.completed).toBe(1);
    expect(analytics.kpis.open).toBe(1);
    expect(analytics.kpis.closeRate).toBe(50);
    expect(analytics.kpis.slaTrackedCount).toBe(2);
    expect(analytics.kpis.slaOverdueCount).toBe(1);
    expect(analytics.kpis.slaCompliancePct).toBe(50);
    expect(analytics.kpis.totalMaterialUnits).toBe(2);
    expect(analytics.kpis.hasEstimatedCost).toBe(true);
    expect(analytics.kpis.totalEstimatedPartsCost).toBe(160);
    expect(analytics.kpis.totalInstallProductsUnits).toBe(3);

    expect(analytics.installationsSummary.total).toBe(1);
    expect(analytics.installationsSummary.merchandiseCheckedPct).toBe(100);
    expect(analytics.installationsSummary.products).toHaveLength(2);
    expect(analytics.criticalTasks).toHaveLength(1);
    expect(analytics.criticalTasks[0].code).toBe('VS-2026-0010');
    expect(analytics.insights.length).toBeGreaterThanOrEqual(3);
  });

  it('genera PDF ejecutivo interno completo y versión limpia para cliente', async () => {
    const internalInput = makeReportInput('internal', false);
    const clientInput = makeReportInput('client', true);

    expect(buildReportPdfFilename(internalInput)).toContain('VistaSatPRO_informe_SAT_interno_');
    expect(buildReportPdfFilename(clientInput)).toContain(
      'VistaSatPRO_informe_SAT_cliente_hotel_mirador_norte_'
    );

    const internalBlob = generateReportPDF(internalInput);
    const clientBlob = generateReportPDF(clientInput);

    expect(await internalBlob.slice(0, 5).text()).toBe('%PDF-');
    expect(await clientBlob.slice(0, 5).text()).toBe('%PDF-');
    expect(internalBlob.size).toBeGreaterThan(clientBlob.size);

    const internalText = await internalBlob.text();
    const clientText = await clientBlob.text();

    expect(internalText).toContain('INFORME EJECUTIVO INTERNO');
    expect(internalText).toContain('TIEMPO MEDIO POR TIPO');
    expect(internalText).toContain('CXC:');
    expect(internalText).toContain('RMA:');
    expect(internalText).toContain('Inst.:');
    expect(internalText).toContain('Tarea:');
    expect(internalText).not.toContain('TIEMPO MEDIO RESOLUCI');
    expect(internalText).toContain('FOCOS');
    expect(internalText).toContain('COSTE EST.');
    expect(internalText).toContain('160,00 EUR');
    expect(internalText).toContain('Multifuncion Ricoh IM C3500');

    expect(clientText).toContain('INFORME PARA CLIENTE');
    expect(clientText).toContain('TIEMPO MEDIO POR TIPO');
    expect(clientText).toContain('CXC:');
    expect(clientText).toContain('RMA:');
    expect(clientText).toContain('Inst.:');
    expect(clientText).toContain('Tarea:');
    expect(clientText).not.toContain('TIEMPO MEDIO RESOLUCI');
    expect(clientText).not.toContain('COSTE EST.');
    expect(clientText).not.toContain('VOLUMEN POR CLIENTE');
    expect(clientText).not.toContain('RENDIMIENTO POR T');
  });
});
