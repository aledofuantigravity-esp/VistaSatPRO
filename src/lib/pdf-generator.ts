import { jsPDF } from 'jspdf';
import {
  type Task,
  type TaskHistoryItem,
  TASK_STATUS_META,
  TASK_PRIORITY_META,
} from '@/types/database';

/**
 * Genera y descarga un PDF corporativo con el resumen completo del parte de trabajo.
 * Incluye cabecera Vistalegre (#002169 + #CF095E), datos del cliente/equipo,
 * materiales empleados, notas técnicas, historial cronológico y firma digital.
 */
export function generateTaskPDF(task: Task, history: TaskHistoryItem[]): Blob {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 0;

  // ─── Cabecera corporativa Navy #002169 ────────────────────────────────────
  doc.setFillColor(0, 33, 105);
  doc.rect(0, 0, pageWidth, 34, 'F');

  // Franja acento Magenta #CF095E
  doc.setFillColor(207, 9, 94);
  doc.rect(0, 34, pageWidth, 2.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('VistaSatPRO', 14, 16);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('PARTE DE ASISTENCIA TÉCNICA (SAT)', 14, 24);

  // Código del parte en derecha
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(task.code, pageWidth - 14, 16, { align: 'right' });

  const statusLabel = TASK_STATUS_META[task.status]?.label ?? task.status;
  const priorityLabel = TASK_PRIORITY_META[task.priority]?.label ?? task.priority;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Estado: ${statusLabel} · Prioridad: ${priorityLabel}`, pageWidth - 14, 24, {
    align: 'right',
  });

  y = 46;

  // Helper para títulos de sección
  const addSectionTitle = (title: string) => {
    if (y > 265) {
      doc.addPage();
      y = 20;
    }
    doc.setFillColor(248, 247, 247);
    doc.rect(14, y - 5, pageWidth - 28, 8, 'F');
    doc.setDrawColor(0, 33, 105);
    doc.setLineWidth(0.8);
    doc.line(14, y - 5, 14, y + 3);
    doc.setTextColor(0, 33, 105);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(title.toUpperCase(), 18, y + 0.5);
    y += 10;
  };

  const addRow = (label: string, value: string | null | undefined) => {
    if (!value) return;
    if (y > 272) {
      doc.addPage();
      y = 20;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(53, 55, 64);
    doc.text(`${label}:`, 14, y);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(34, 34, 34);
    const lines = doc.splitTextToSize(value, pageWidth - 68);
    doc.text(lines, 54, y);
    y += lines.length * 4.8 + 2;
  };

  // ─── 1. Datos del Cliente y Ubicación ────────────────────────────────────
  addSectionTitle('1. Datos del Cliente y Servicio');
  addRow('Cliente', task.customer?.name || 'Cliente no especificado');
  addRow('CIF / NIF', task.customer?.tax_id);
  addRow('Contacto sitio', task.site_contact_name || task.customer?.contact_name);
  addRow('Teléfono', task.site_contact_phone || task.customer?.contact_phone);
  addRow(
    'Dirección',
    [task.site_address || task.customer?.address, task.site_city || task.customer?.city]
      .filter(Boolean)
      .join(', ')
  );
  addRow('Técnico asignado', task.assignee?.full_name || 'Sin asignar');
  addRow('Fecha apertura', new Date(task.created_at).toLocaleString('es-ES'));
  if (task.completed_at) {
    addRow('Fecha cierre', new Date(task.completed_at).toLocaleString('es-ES'));
  }

  y += 3;

  // ─── 2. Equipo y Avería ──────────────────────────────────────────────────
  addSectionTitle('2. Equipo y Descripción del Problema');
  addRow('Equipo / Modelo', task.equipment_ref);
  addRow('Nº de Serie', task.equipment_sn);
  addRow('Descripción', task.problem_desc);
  if (task.resolution_notes) {
    addRow('Notas resolución', task.resolution_notes);
  }

  y += 3;

  // ─── 3. Materiales y Piezas Empleadas ────────────────────────────────────
  if (task.materials_used && task.materials_used.length > 0) {
    addSectionTitle('3. Materiales y Repuestos Utilizados');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(102, 102, 102);
    doc.text('Descripción', 14, y);
    doc.text('Referencia', 120, y);
    doc.text('Cant.', pageWidth - 14, y, { align: 'right' });
    y += 2;
    doc.setDrawColor(221, 221, 221);
    doc.setLineWidth(0.3);
    doc.line(14, y, pageWidth - 14, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(34, 34, 34);
    for (const mat of task.materials_used) {
      if (y > 272) {
        doc.addPage();
        y = 20;
      }
      doc.text(mat.name, 14, y);
      doc.text(mat.ref || '-', 120, y);
      doc.text(String(mat.qty), pageWidth - 14, y, { align: 'right' });
      y += 6;
    }
    y += 3;
  }

  // ─── 4. Trazabilidad Cronológica ─────────────────────────────────────────
  if (history.length > 0) {
    addSectionTitle('4. Historial de Actuaciones (Audit Trail)');
    const chronological = [...history].sort((a, b) =>
      a.created_at.localeCompare(b.created_at)
    );
    doc.setFontSize(8.2);
    for (const item of chronological) {
      if (y > 272) {
        doc.addPage();
        y = 20;
      }
      const ts = new Date(item.created_at).toLocaleString('es-ES');
      const actor = item.actor?.full_name || 'Sistema';
      const detail = item.note
        ? item.note
        : item.old_value || item.new_value
        ? `${item.event_type}: ${item.old_value ?? '—'} → ${item.new_value ?? '—'}`
        : item.event_type;

      doc.setFont('helvetica', 'bold');
      doc.setTextColor(0, 33, 105);
      doc.text(`${ts} · ${actor}`, 14, y);
      y += 4;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(53, 55, 64);
      const lines = doc.splitTextToSize(detail, pageWidth - 32);
      doc.text(lines, 18, y);
      y += lines.length * 4 + 2.5;
    }
    y += 3;
  }

  // ─── 5. Firma Digital del Cliente ────────────────────────────────────────
  if (task.client_signature_url) {
    if (y > 235) {
      doc.addPage();
      y = 20;
    }
    addSectionTitle('5. Conformidad y Firma del Cliente');
    if (task.signer_name) {
      addRow('Firmante', task.signer_name);
    }
    try {
      doc.setDrawColor(221, 221, 221);
      doc.rect(14, y, 80, 32);
      doc.addImage(task.client_signature_url, 'PNG', 16, y + 2, 76, 28);
      y += 36;
    } catch {
      addRow('Firma', 'Firma registrada digitalmente');
    }
  }

  // Pie de página
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(155, 155, 155);
    doc.text(
      `VistaSatPRO · Documento generado el ${new Date().toLocaleString('es-ES')} · Pág. ${i}/${pageCount}`,
      pageWidth / 2,
      290,
      { align: 'center' }
    );
  }

  return doc.output('blob');
}

async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function downloadTaskPDF(task: Task, history: TaskHistoryItem[]) {
  let preparedTask = task;
  if (task.client_signature_url && !task.client_signature_url.startsWith('data:')) {
    try {
      const sigDataUrl = await urlToDataUrl(task.client_signature_url);
      preparedTask = { ...task, client_signature_url: sigDataUrl };
    } catch {
      // Si falla la descarga, genera el PDF sin romper
    }
  }
  const blob = generateTaskPDF(preparedTask, history);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${task.code}_parte_SAT.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export interface ReportPdfInput {
  filters: {
    dateFrom?: string;
    dateTo?: string;
    technicianName?: string;
    customerName?: string;
    statusLabel?: string;
  };
  kpis: {
    total: number;
    completed: number;
    open: number;
    closeRate: number;
    avgHours: string;
  };
  techStats: Array<{
    name: string;
    total: number;
    completed: number;
    rate: number;
    avgHours: string;
  }>;
  topCustomers: Array<{
    name: string;
    total: number;
    open: number;
  }>;
  tasks: Task[];
}

/**
 * Genera y descarga un informe operativo SAT en formato PDF con filtros, KPIs y tablas.
 */
export function downloadReportPDF(input: ReportPdfInput): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 0;

  // Cabecera corporativa
  doc.setFillColor(0, 33, 105);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setFillColor(207, 9, 94);
  doc.rect(0, 32, pageWidth, 2.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('VistaSatPRO', 14, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('INFORME OPERATIVO DE SERVICIO TÉCNICO (SAT)', 14, 23);

  doc.setFontSize(9);
  doc.text(
    `Generado: ${new Date().toLocaleDateString('es-ES')}`,
    pageWidth - 14,
    23,
    { align: 'right' }
  );

  y = 43;

  const ensureSpace = (needed = 16) => {
    if (y + needed > 276) {
      doc.addPage();
      y = 20;
    }
  };

  const addSection = (title: string) => {
    ensureSpace(16);
    doc.setFillColor(248, 247, 247);
    doc.rect(14, y - 5, pageWidth - 28, 8, 'F');
    doc.setDrawColor(0, 33, 105);
    doc.setLineWidth(0.8);
    doc.line(14, y - 5, 14, y + 3);
    doc.setTextColor(0, 33, 105);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(title.toUpperCase(), 18, y + 0.5);
    y += 10;
  };

  // Resumen de filtros
  addSection('1. Alcance y Filtros Aplicados');
  const filterParts = [
    input.filters.dateFrom ? `Desde: ${input.filters.dateFrom}` : 'Desde: inicio',
    input.filters.dateTo ? `Hasta: ${input.filters.dateTo}` : 'Hasta: hoy',
    `Técnico: ${input.filters.technicianName || 'Todos'}`,
    `Cliente: ${input.filters.customerName || 'Todos'}`,
    `Estado: ${input.filters.statusLabel || 'Todos'}`,
  ];
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(53, 55, 64);
  const filterLines = doc.splitTextToSize(filterParts.join(' · '), pageWidth - 28);
  doc.text(filterLines, 14, y);
  y += filterLines.length * 4.8 + 4;

  // KPIs
  addSection('2. Resumen Ejecutivo del Período');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(34, 34, 34);
  doc.text(
    `Total partes: ${input.kpis.total}   |   Completados: ${input.kpis.completed}   |   Abiertos: ${input.kpis.open}   |   Tasa cierre: ${input.kpis.closeRate}%   |   Tiempo medio: ${input.kpis.avgHours}h`,
    14,
    y
  );
  y += 10;

  // Rendimiento por técnico
  if (input.techStats.length > 0) {
    addSection('3. Rendimiento por Técnico');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(102, 102, 102);
    doc.text('Técnico', 14, y);
    doc.text('Totales', 105, y, { align: 'right' });
    doc.text('Cerrados', 132, y, { align: 'right' });
    doc.text('Tasa', 158, y, { align: 'right' });
    doc.text('Ø Resol.', pageWidth - 14, y, { align: 'right' });
    y += 2;
    doc.setDrawColor(221, 221, 221);
    doc.line(14, y, pageWidth - 14, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(34, 34, 34);
    for (const row of input.techStats) {
      ensureSpace(8);
      doc.text(row.name.slice(0, 40), 14, y);
      doc.text(String(row.total), 105, y, { align: 'right' });
      doc.text(String(row.completed), 132, y, { align: 'right' });
      doc.text(`${row.rate}%`, 158, y, { align: 'right' });
      doc.text(row.avgHours === '—' ? '—' : `${row.avgHours}h`, pageWidth - 14, y, {
        align: 'right',
      });
      y += 6;
    }
    y += 4;
  }

  // Top clientes
  if (input.topCustomers.length > 0) {
    addSection('4. Volumen por Cliente (Top 10)');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(102, 102, 102);
    doc.text('Cliente', 14, y);
    doc.text('Total Partes', 150, y, { align: 'right' });
    doc.text('Abiertos', pageWidth - 14, y, { align: 'right' });
    y += 2;
    doc.line(14, y, pageWidth - 14, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(34, 34, 34);
    for (const row of input.topCustomers) {
      ensureSpace(8);
      doc.text(row.name.slice(0, 55), 14, y);
      doc.text(String(row.total), 150, y, { align: 'right' });
      doc.text(String(row.open), pageWidth - 14, y, { align: 'right' });
      y += 6;
    }
    y += 4;
  }

  // Detalle de partes filtrados (máx 40)
  if (input.tasks.length > 0) {
    addSection(`5. Listado de Partes (${Math.min(40, input.tasks.length)} de ${input.tasks.length})`);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(102, 102, 102);
    doc.text('Código', 14, y);
    doc.text('Cliente', 42, y);
    doc.text('Estado', 112, y);
    doc.text('Técnico', 145, y);
    doc.text('Fecha', pageWidth - 14, y, { align: 'right' });
    y += 2;
    doc.line(14, y, pageWidth - 14, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(34, 34, 34);
    for (const t of input.tasks.slice(0, 40)) {
      ensureSpace(7);
      doc.text(t.code, 14, y);
      doc.text((t.customer?.name || 'Cliente').slice(0, 30), 42, y);
      doc.text(TASK_STATUS_META[t.status]?.label || t.status, 112, y);
      doc.text((t.assignee?.full_name || 'Sin asignar').slice(0, 22), 145, y);
      doc.text(new Date(t.created_at).toLocaleDateString('es-ES'), pageWidth - 14, y, {
        align: 'right',
      });
      y += 5.5;
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(155, 155, 155);
    doc.text(
      `VistaSatPRO · Informe Operativo SAT · Pág. ${i}/${pageCount}`,
      pageWidth / 2,
      290,
      { align: 'center' }
    );
  }

  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `VistaSatPRO_informe_SAT_${new Date().toISOString().slice(0, 10)}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
