import { jsPDF } from 'jspdf';
import {
  buildPdfFilename,
  formatDurationLabel,
  formatHistoryEventForPdf,
  getSignatureTimestamp,
  sanitizePdfText,
  type PdfVariant,
} from '@/lib/pdf-helpers';
import { getSlaStatus } from '@/lib/sla';
import {
  calculateElapsedDaysAndHours,
  formatDateOnlyEs,
  formatFullDayDateTime,
  getEffectiveClosedAt,
} from '@/lib/task-dates';
import {
  extractTechnicalNotes,
  getLastResolutionAudit,
  isResolutionRequiredForClosure,
} from '@/lib/task-notes';
import {
  type Attachment,
  type Task,
  type TaskHistoryItem,
  getTaskStatusLabel,
  resolveTaskType,
  TASK_PRIORITY_META,
  TASK_TYPE_META,
} from '@/types/database';

export type { PdfVariant };

export interface PdfImageItem {
  dataUrl: string;
  format: 'JPEG' | 'PNG';
  width: number;
  height: number;
  label: string;
  capturedAt?: string;
}

export interface GenerateTaskPdfOptions {
  variant?: PdfVariant;
  logoDataUrl?: string | null;
  orderAttachments?: Attachment[];
}

type RgbTuple = readonly [number, number, number];

// Paleta corporativa VistaSatPRO (sincronizada con globals.css)
const COLOR = {
  NAVY: [0, 33, 105] as RgbTuple,
  NAVY_DARK: [31, 42, 68] as RgbTuple,
  MAGENTA: [207, 9, 94] as RgbTuple,
  PETROL: [0, 72, 118] as RgbTuple,
  CHARCOAL: [34, 34, 34] as RgbTuple,
  DARK_GREY: [53, 55, 64] as RgbTuple,
  MID_GREY: [102, 102, 102] as RgbTuple,
  LIGHT_GREY: [155, 155, 155] as RgbTuple,
  OFF_WHITE: [248, 247, 247] as RgbTuple,
  SOFT_NAVY: [238, 242, 249] as RgbTuple,
  BORDER: [221, 221, 221] as RgbTuple,
  WHITE: [255, 255, 255] as RgbTuple,
  SUCCESS: [26, 122, 74] as RgbTuple,
  SUCCESS_BG: [232, 246, 239] as RgbTuple,
  WARNING: [180, 106, 8] as RgbTuple,
  WARNING_BG: [254, 243, 199] as RgbTuple,
  DANGER: [212, 0, 0] as RgbTuple,
  DANGER_BG: [254, 226, 226] as RgbTuple,
  INFO: [14, 116, 169] as RgbTuple,
  INFO_BG: [224, 242, 254] as RgbTuple,
  NEUTRAL_BG: [235, 237, 242] as RgbTuple,
};

function getStatusBadgeColors(status: string): { bg: RgbTuple; text: RgbTuple } {
  if (status === 'completed') return { bg: COLOR.SUCCESS_BG, text: COLOR.SUCCESS };
  if (status === 'in_progress') return { bg: COLOR.INFO_BG, text: COLOR.INFO };
  if (status === 'cancelled') return { bg: COLOR.NEUTRAL_BG, text: COLOR.MID_GREY };
  return { bg: COLOR.WARNING_BG, text: COLOR.WARNING };
}

function getPriorityBadgeColors(priority: string): { bg: RgbTuple; text: RgbTuple } {
  if (priority === 'urgent') return { bg: COLOR.DANGER_BG, text: COLOR.DANGER };
  if (priority === 'high') return { bg: COLOR.WARNING_BG, text: COLOR.WARNING };
  if (priority === 'medium') return { bg: COLOR.INFO_BG, text: COLOR.INFO };
  return { bg: COLOR.NEUTRAL_BG, text: COLOR.DARK_GREY };
}

function formatDateTimeEs(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

/**
 * Genera el PDF corporativo del parte adaptado al tipo de tarea y a la variante:
 * - 'client': versión limpia para cliente (sin notas internas ni audit trail completo)
 * - 'internal': versión completa SAT (incluye Notas Técnicas, SLA e Historial Cronológico)
 */
export function generateTaskPDF(
  task: Task,
  history: TaskHistoryItem[],
  photos: PdfImageItem[] = [],
  physicalWorkOrderPhotos: PdfImageItem[] = [],
  options: GenerateTaskPdfOptions = {}
): Blob {
  const variant: PdfVariant = options.variant || 'internal';
  const logoDataUrl = options.logoDataUrl || null;
  const orderAttachments = options.orderAttachments || [];

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const M = 14;
  const CW = pageWidth - M * 2; // 182 mm
  const MAX_Y = 276;

  const taskType = resolveTaskType(task);
  const typeLabel = TASK_TYPE_META[taskType]?.label ?? taskType;
  const statusLabel = getTaskStatusLabel(task.status);
  const priorityLabel = TASK_PRIORITY_META[task.priority]?.label ?? task.priority;
  const customerName = sanitizePdfText(task.customer?.name || 'Cliente no especificado');

  const headerSubtitle =
    taskType === 'installation'
      ? 'PARTE DE INSTALACIÓN PROFESIONAL'
      : taskType === 'cxc_incident'
      ? 'PARTE DE INCIDENCIA CXC'
      : taskType === 'task'
      ? 'PARTE DE SEGUIMIENTO DE TAREA'
      : 'PARTE DE ASISTENCIA TÉCNICA (INCIDENCIA RMA)';

  let y = 0;
  let sectionNum = 1;

  const setColorFill = (rgb: RgbTuple) => doc.setFillColor(rgb[0], rgb[1], rgb[2]);
  const setColorDraw = (rgb: RgbTuple) => doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  const setColorText = (rgb: RgbTuple) => doc.setTextColor(rgb[0], rgb[1], rgb[2]);

  const drawContinuationHeader = () => {
    setColorFill(COLOR.NAVY);
    doc.rect(0, 0, pageWidth, 11, 'F');
    setColorFill(COLOR.MAGENTA);
    doc.rect(0, 11, pageWidth, 1.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    setColorText(COLOR.WHITE);
    doc.text(sanitizePdfText(`VistaSatPRO · ${typeLabel}`), M, 7.2);

    doc.setFont('helvetica', 'normal');
    doc.text(
      sanitizePdfText(
        `${task.code} · ${variant === 'client' ? 'Copia Cliente' : 'Uso Interno SAT'}`
      ),
      pageWidth - M,
      7.2,
      { align: 'right' }
    );
  };

  const addContinuationPage = () => {
    doc.addPage();
    drawContinuationHeader();
    y = 18;
  };

  const ensureSpace = (needed = 16) => {
    if (y + needed > MAX_Y) {
      addContinuationPage();
    }
  };

  const addSectionTitle = (title: string) => {
    ensureSpace(16);
    const numbered = sanitizePdfText(`${sectionNum++}. ${title}`).toUpperCase();
    setColorFill(COLOR.OFF_WHITE);
    doc.rect(M, y - 5, CW, 8.2, 'F');
    setColorFill(COLOR.NAVY);
    doc.rect(M, y - 5, 1.4, 8.2, 'F');
    setColorFill(COLOR.MAGENTA);
    doc.rect(M, y + 1, 1.4, 2.2, 'F');

    setColorText(COLOR.NAVY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(numbered, M + 4.5, y + 0.6);
    y += 10.5;
  };

  const drawBadge = (
    text: string,
    x: number,
    baselineY: number,
    bg: RgbTuple,
    fg: RgbTuple,
    alignRight = false
  ): number => {
    const clean = sanitizePdfText(text).toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    const padX = 3.2;
    const textW = doc.getTextWidth(clean);
    const pillW = textW + padX * 2;
    const drawX = alignRight ? x - pillW : x;
    setColorFill(bg);
    doc.roundedRect(drawX, baselineY - 4, pillW, 5.6, 1.4, 1.4, 'F');
    setColorText(fg);
    doc.text(clean, drawX + padX, baselineY - 0.1);
    return pillW;
  };

  // ─── 1. CABECERA PRINCIPAL (PÁGINA 1) ──────────────────────────────────────
  setColorFill(COLOR.NAVY);
  doc.rect(0, 0, pageWidth, 38, 'F');
  setColorFill(COLOR.MAGENTA);
  doc.rect(0, 38, pageWidth, 2.4, 'F');

  let brandX = M;
  if (logoDataUrl) {
    try {
      setColorFill(COLOR.WHITE);
      doc.roundedRect(M, 7.5, 14, 14, 2.2, 2.2, 'F');
      doc.addImage(logoDataUrl, 'PNG', M + 1.2, 8.7, 11.6, 11.6);
      brandX = M + 17.5;
    } catch {
      brandX = M;
    }
  }

  setColorText(COLOR.WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18.5);
  doc.text('VistaSatPRO', brandX, 14.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.text(sanitizePdfText(headerSubtitle), brandX, 21);

  // Píldora de edición (Copia Cliente vs Informe Interno SAT)
  const editionText =
    variant === 'client' ? 'COPIA PARA CLIENTE' : 'INFORME INTERNO SAT';
  drawBadge(
    editionText,
    brandX,
    30.2,
    variant === 'client' ? COLOR.SUCCESS_BG : COLOR.MAGENTA,
    variant === 'client' ? COLOR.SUCCESS : COLOR.WHITE,
    false
  );

  // Caja código del parte en derecha
  setColorFill(COLOR.NAVY_DARK);
  doc.setDrawColor(64, 86, 138);
  doc.setLineWidth(0.35);
  doc.roundedRect(pageWidth - M - 48, 6.8, 48, 13.5, 1.8, 1.8, 'FD');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(195, 208, 236);
  doc.text('CÓDIGO DE PARTE', pageWidth - M - 24, 11.2, { align: 'center' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.2);
  setColorText(COLOR.WHITE);
  doc.text(sanitizePdfText(task.code), pageWidth - M - 24, 17.6, { align: 'center' });

  // Badges de Prioridad y Estado debajo del código
  const prioColors = getPriorityBadgeColors(task.priority);
  const statusColors = getStatusBadgeColors(task.status);
  const prioW = drawBadge(
    `Prioridad: ${priorityLabel}`,
    pageWidth - M,
    29.8,
    prioColors.bg,
    prioColors.text,
    true
  );
  drawBadge(
    statusLabel,
    pageWidth - M - prioW - 2.5,
    29.8,
    statusColors.bg,
    statusColors.text,
    true
  );

  y = 46;

  // ─── 2. BANDA DE KPIs RÁPIDOS DEL PARTE ───────────────────────────────────
  const kpiGap = 3;
  const kpiW = (CW - kpiGap * 3) / 4; // 43.25 mm
  const kpiH = 18;
  const sla = getSlaStatus(task);

  const slaAccent: RgbTuple = sla
    ? sla.state === 'overdue'
      ? COLOR.DANGER
      : sla.state === 'due_today'
      ? COLOR.WARNING
      : COLOR.SUCCESS
    : task.status === 'completed' && task.due_date && task.completed_at
    ? Date.parse(task.completed_at) <= Date.parse(task.due_date)
      ? COLOR.SUCCESS
      : COLOR.WARNING
    : COLOR.MID_GREY;

  const slaValue = sla
    ? sla.shortLabel
    : task.status === 'completed' && task.due_date && task.completed_at
    ? Date.parse(task.completed_at) <= Date.parse(task.due_date)
      ? 'SLA Cumplido'
      : 'Fuera de SLA'
    : 'Sin límite SLA';

  const kpis: Array<{
    accent: RgbTuple;
    label: string;
    value: string;
    sub: string;
    valueColor?: RgbTuple;
  }> = [
    {
      accent: COLOR.NAVY,
      label: 'TIPO DE PARTE',
      value: typeLabel,
      sub: `Prioridad ${priorityLabel}`,
    },
    {
      accent: COLOR.PETROL,
      label: task.completed_at ? 'TIEMPO DE CIERRE' : 'TIEMPO ABIERTO',
      value: formatDurationLabel(task.created_at, task.completed_at),
      sub: task.estimated_duration ? `Est.: ${task.estimated_duration} min` : 'Sin estimación',
    },
    variant === 'internal'
      ? {
          accent: slaAccent,
          label: 'CUMPLIMIENTO SLA',
          value: slaValue,
          sub: task.due_date ? `Límite: ${formatDateTimeEs(task.due_date)}` : 'Sin fecha límite',
          valueColor: slaAccent,
        }
      : {
          accent: COLOR.INFO,
          label:
            taskType === 'installation' && task.scheduled_date
              ? 'FECHA ACORDADA'
              : task.completed_at
              ? 'FECHA DE CIERRE'
              : 'FECHA APERTURA',
          value:
            taskType === 'installation' && task.scheduled_date
              ? formatDateOnlyEs(task.scheduled_date, 'short')
              : task.completed_at
              ? formatDateTimeEs(task.completed_at)
              : formatDateTimeEs(task.created_at),
          sub: `Apertura: ${formatDateTimeEs(task.created_at)}`,
        },
    {
      accent: COLOR.MAGENTA,
      label: 'EVIDENCIAS Y CIERRE',
      value: `${photos.length} foto${photos.length === 1 ? '' : 's'} · ${
        task.materials_used?.length || 0
      } pieza${(task.materials_used?.length || 0) === 1 ? '' : 's'}`,
      sub: task.client_signature_url ? 'Firmado por cliente' : 'Pendiente de firma',
      valueColor: task.client_signature_url ? COLOR.SUCCESS : COLOR.CHARCOAL,
    },
  ];

  kpis.forEach((kpi, idx) => {
    const x = M + idx * (kpiW + kpiGap);
    setColorFill(COLOR.WHITE);
    setColorDraw(COLOR.BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(x, y, kpiW, kpiH, 1.2, 1.2, 'FD');

    setColorFill(kpi.accent);
    doc.rect(x, y, kpiW, 1.8, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    setColorText(COLOR.MID_GREY);
    doc.text(sanitizePdfText(kpi.label), x + 2.8, y + 5.6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    setColorText(kpi.valueColor || COLOR.NAVY);
    const valLines = doc.splitTextToSize(sanitizePdfText(kpi.value), kpiW - 5.6);
    doc.text(valLines[0] || '—', x + 2.8, y + 10.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.1);
    setColorText(COLOR.MID_GREY);
    const subLines = doc.splitTextToSize(sanitizePdfText(kpi.sub), kpiW - 5.6);
    doc.text(subLines[0] || '', x + 2.8, y + 15.2);
  });

  y += kpiH + 6;

  // ─── 3. TARJETAS EN 2 COLUMNAS: CLIENTE Y SERVICIO ─────────────────────────
  interface InfoRow {
    label: string;
    value: string;
    bold?: boolean;
  }

  const fullAddress = sanitizePdfText(
    [task.site_address || task.customer?.address, task.site_city || task.customer?.city]
      .filter(Boolean)
      .join(', ')
  );

  const clientRows: InfoRow[] = [
    { label: 'Cliente', value: customerName, bold: true },
    ...(task.customer?.tax_id
      ? [{ label: 'CIF / NIF', value: sanitizePdfText(task.customer.tax_id) }]
      : []),
    ...(fullAddress ? [{ label: 'Dirección', value: fullAddress }] : []),
    ...(task.site_contact_name || task.customer?.contact_name
      ? [
          {
            label: 'Contacto',
            value: sanitizePdfText(task.site_contact_name || task.customer?.contact_name || ''),
          },
        ]
      : []),
    ...(task.site_contact_phone || task.customer?.contact_phone
      ? [
          {
            label: 'Teléfono',
            value: sanitizePdfText(task.site_contact_phone || task.customer?.contact_phone || ''),
          },
        ]
      : []),
    ...(task.customer?.contact_email
      ? [{ label: 'Email', value: sanitizePdfText(task.customer.contact_email) }]
      : []),
  ];

  const serviceRows: InfoRow[] = [
    {
      label: 'Técnico',
      value: sanitizePdfText(task.assignee?.full_name || 'Sin asignar'),
      bold: true,
    },
    ...(task.assignee?.phone
      ? [{ label: 'Tel. técnico', value: sanitizePdfText(task.assignee.phone) }]
      : []),
    { label: 'Apertura', value: formatDateTimeEs(task.created_at) },
    ...(variant === 'internal' && task.creator?.full_name
      ? [{ label: 'Abierto por', value: sanitizePdfText(task.creator.full_name) }]
      : []),
    ...(variant === 'internal' && task.assigned_at
      ? [{ label: 'Asignado el', value: formatDateTimeEs(task.assigned_at) }]
      : []),
    {
      label: 'Cierre',
      value: task.completed_at ? formatDateTimeEs(task.completed_at) : 'En curso',
    },
  ];

  const twoColGap = 4;
  const twoColW = (CW - twoColGap) / 2; // 89 mm
  const labelW = 22;
  const valMaxW = twoColW - labelW - 6;

  const measureInfoRows = (rows: InfoRow[]) => {
    doc.setFontSize(8.2);
    let h = 11; // cabecera 7.5 + margen top
    const measured = rows.map((row) => {
      doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
      const lines = doc.splitTextToSize(row.value || '—', valMaxW) as string[];
      const rowH = Math.max(1, lines.length) * 4 + 1.8;
      h += rowH;
      return { ...row, lines, rowH };
    });
    return { totalH: h + 2.5, measured };
  };

  const leftCol = measureInfoRows(clientRows);
  const rightCol = measureInfoRows(serviceRows);
  const infoBoxH = Math.max(leftCol.totalH, rightCol.totalH);

  ensureSpace(infoBoxH + 6);

  const drawInfoCard = (
    x: number,
    title: string,
    rows: Array<InfoRow & { lines: string[]; rowH: number }>
  ) => {
    setColorFill(COLOR.WHITE);
    setColorDraw(COLOR.BORDER);
    doc.setLineWidth(0.32);
    doc.roundedRect(x, y, twoColW, infoBoxH, 1.4, 1.4, 'FD');

    setColorFill(COLOR.OFF_WHITE);
    doc.rect(x + 0.2, y + 0.2, twoColW - 0.4, 7.2, 'F');
    setColorDraw(COLOR.BORDER);
    doc.line(x, y + 7.4, x + twoColW, y + 7.4);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setColorText(COLOR.NAVY);
    doc.text(sanitizePdfText(title).toUpperCase(), x + 3.2, y + 5.1);

    let cy = y + 12.2;
    for (const r of rows) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.9);
      setColorText(COLOR.MID_GREY);
      doc.text(`${r.label}:`, x + 3.2, cy);

      doc.setFont('helvetica', r.bold ? 'bold' : 'normal');
      doc.setFontSize(8.1);
      setColorText(COLOR.CHARCOAL);
      doc.text(r.lines, x + 3.2 + labelW, cy);
      cy += r.rowH;
    }
  };

  drawInfoCard(M, 'Datos del Cliente y Ubicación', leftCol.measured);
  drawInfoCard(M + twoColW + twoColGap, 'Datos del Servicio SAT', rightCol.measured);

  y += infoBoxH + 5;

  // ─── 3b. FECHAS DE APERTURA, CIERRE Y TIEMPO TRANSCURRIDO (DÍAS Y HORAS) ──
  const closedAtIso = getEffectiveClosedAt(task);
  const elapsedDaysHours = calculateElapsedDaysAndHours(task.created_at, closedAtIso);
  const datesGap = 3;
  const datesCardW = (CW - datesGap * 2) / 3;
  const datesCardH = 20.5;
  ensureSpace(datesCardH + 6);

  const dateCards: Array<{
    bg: RgbTuple;
    accent: RgbTuple;
    title: string;
    value: string;
    sub: string;
    valueColor: RgbTuple;
  }> = [
    {
      bg: COLOR.OFF_WHITE,
      accent: COLOR.NAVY,
      title: 'DÍA Y FECHA DE APERTURA',
      value: formatFullDayDateTime(task.created_at),
      sub: 'Registro inicial del parte',
      valueColor: COLOR.CHARCOAL,
    },
    {
      bg: closedAtIso
        ? COLOR.SUCCESS_BG
        : task.status === 'cancelled'
        ? COLOR.NEUTRAL_BG
        : COLOR.WARNING_BG,
      accent: closedAtIso
        ? COLOR.SUCCESS
        : task.status === 'cancelled'
        ? COLOR.MID_GREY
        : COLOR.WARNING,
      title: 'FECHA Y HORA DE CIERRE',
      value: closedAtIso
        ? formatFullDayDateTime(closedAtIso)
        : task.status === 'cancelled'
        ? 'Parte cancelado'
        : 'Pendiente de cierre',
      sub: closedAtIso ? 'Cierre completado' : 'Sin cierre definitivo',
      valueColor: closedAtIso
        ? COLOR.SUCCESS
        : task.status === 'cancelled'
        ? COLOR.MID_GREY
        : COLOR.WARNING,
    },
    {
      bg: COLOR.SOFT_NAVY,
      accent: COLOR.PETROL,
      title: closedAtIso ? 'TIEMPO APERTURA -> CIERRE' : 'TIEMPO DESDE APERTURA',
      value: elapsedDaysHours.formatted,
      sub: closedAtIso ? 'Días y horas hasta el cierre' : 'Días y horas transcurridos',
      valueColor: COLOR.NAVY,
    },
  ];

  dateCards.forEach((dc, idx) => {
    const dx = M + idx * (datesCardW + datesGap);
    setColorFill(dc.bg);
    setColorDraw(COLOR.BORDER);
    doc.setLineWidth(0.28);
    doc.roundedRect(dx, y, datesCardW, datesCardH, 1.2, 1.2, 'FD');

    setColorFill(dc.accent);
    doc.rect(dx, y, 1.4, datesCardH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    setColorText(COLOR.MID_GREY);
    doc.text(sanitizePdfText(dc.title), dx + 3.4, y + 4.8);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    setColorText(dc.valueColor);
    const valLines = (
      doc.splitTextToSize(sanitizePdfText(dc.value), datesCardW - 5.2) as string[]
    ).slice(0, 2);
    doc.text(valLines, dx + 3.4, y + 9.4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    setColorText(COLOR.MID_GREY);
    doc.text(sanitizePdfText(dc.sub), dx + 3.4, y + 17.5);
  });

  y += datesCardH + 6;

  // ─── 4. DETALLE OPERATIVO SEGÚN TIPO DE PARTE ──────────────────────────────
  addSectionTitle(
    taskType === 'installation'
      ? 'Equipo, Planificación y Cotejo de Mercancía'
      : taskType === 'cxc_incident'
      ? 'Equipo, Contadores y Resolución CXC'
      : taskType === 'task'
      ? 'Detalle y Resolución de la Tarea'
      : 'Equipo, Avería y Resolución'
  );

  // Recuadro Equipo y Nº de Serie (para RMA, CXC e Instalación)
  if (taskType !== 'task') {
    ensureSpace(16);
    setColorFill(COLOR.OFF_WHITE);
    setColorDraw(COLOR.BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(M, y, CW, 13.5, 1.2, 1.2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    setColorText(COLOR.MID_GREY);
    doc.text('EQUIPO / MODELO', M + 3.5, y + 4.5);
    doc.text(
      taskType === 'cxc_incident' ? 'Nº DE SERIE (OBLIGATORIO)' : 'Nº DE SERIE',
      M + CW / 2 + 4,
      y + 4.5
    );

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    setColorText(COLOR.CHARCOAL);
    doc.text(
      sanitizePdfText(task.equipment_ref || 'No especificado').slice(0, 48),
      M + 3.5,
      y + 10.2
    );
    setColorText(task.equipment_sn ? COLOR.NAVY : COLOR.MID_GREY);
    doc.text(
      sanitizePdfText(task.equipment_sn || 'Sin especificar').slice(0, 40),
      M + CW / 2 + 4,
      y + 10.2
    );

    y += 16.5;
  }

  // Tarjetas CXC (B/N, Color y Total)
  if (taskType === 'cxc_incident') {
    ensureSpace(20);
    const cxcGap = 3;
    const cxcW = (CW - cxcGap * 2) / 3;
    const totalCopies =
      task.meter_bw != null || task.meter_color != null
        ? (task.meter_bw || 0) + (task.meter_color || 0)
        : null;

    const cxcCards = [
      {
        label: 'COPIAS B/N',
        value: task.meter_bw != null ? task.meter_bw.toLocaleString('es-ES') : 'No registrado',
        bg: COLOR.OFF_WHITE,
        valColor: COLOR.CHARCOAL,
      },
      {
        label: 'COPIAS COLOR',
        value:
          task.meter_color != null ? task.meter_color.toLocaleString('es-ES') : 'No registrado',
        bg: COLOR.OFF_WHITE,
        valColor: COLOR.PETROL,
      },
      {
        label: 'TOTAL CONTADOR',
        value: totalCopies != null ? totalCopies.toLocaleString('es-ES') : '—',
        bg: COLOR.SOFT_NAVY,
        valColor: COLOR.NAVY,
      },
    ];

    cxcCards.forEach((card, idx) => {
      const cx = M + idx * (cxcW + cxcGap);
      setColorFill(card.bg);
      setColorDraw(COLOR.BORDER);
      doc.roundedRect(cx, y, cxcW, 14.5, 1.2, 1.2, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      setColorText(COLOR.MID_GREY);
      doc.text(card.label, cx + 3.5, y + 4.8);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      setColorText(card.valColor);
      doc.text(card.value, cx + 3.5, y + 11.2);
    });

    y += 17.5;
  }

  // Tarjetas específicas de Instalación + listado de pedidos adjuntos
  if (taskType === 'installation') {
    ensureSpace(23);
    const instGap = 3;
    const instW = (CW - instGap * 2) / 3;
    const instH = 18.5;

    // Tarjeta 1: Fecha acordada
    setColorFill(COLOR.OFF_WHITE);
    setColorDraw(COLOR.BORDER);
    doc.roundedRect(M, y, instW, instH, 1.2, 1.2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    setColorText(COLOR.MID_GREY);
    doc.text('FECHA ACORDADA', M + 3, y + 4.8);
    doc.setFontSize(8.8);
    setColorText(task.scheduled_date ? COLOR.NAVY : COLOR.WARNING);
    doc.text(
      task.scheduled_date ? formatDateOnlyEs(task.scheduled_date, 'short') : 'Pendiente de acordar',
      M + 3,
      y + 11.2
    );

    // Tarjeta 2: Cotejo de mercancía
    const c2x = M + instW + instGap;
    const cotejoBg =
      task.merchandise_check_done === true
        ? COLOR.SUCCESS_BG
        : task.merchandise_check_done === false
        ? COLOR.DANGER_BG
        : COLOR.WARNING_BG;
    const cotejoFg =
      task.merchandise_check_done === true
        ? COLOR.SUCCESS
        : task.merchandise_check_done === false
        ? COLOR.DANGER
        : COLOR.WARNING;
    const cotejoLabel =
      task.merchandise_check_done === true
        ? 'REALIZADO'
        : task.merchandise_check_done === false
        ? 'NO REALIZADO'
        : 'PENDIENTE';
    setColorFill(cotejoBg);
    setColorDraw(COLOR.BORDER);
    doc.roundedRect(c2x, y, instW, instH, 1.2, 1.2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    setColorText(COLOR.MID_GREY);
    doc.text('COTEJO DE MERCANCÍA', c2x + 3, y + 4.8);
    doc.setFontSize(9.2);
    setColorText(cotejoFg);
    doc.text(cotejoLabel, c2x + 3, y + 11);
    if (task.merchandise_checked_at) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      setColorText(COLOR.DARK_GREY);
      doc.text(formatDateTimeEs(task.merchandise_checked_at), c2x + 3, y + 15.6);
    }

    // Tarjeta 3: Parte de trabajo físico
    const c3x = M + (instW + instGap) * 2;
    const hasPhysical =
      physicalWorkOrderPhotos.length > 0 || task.physical_work_order_attached === true;
    const physicalNotAttached =
      !hasPhysical && (task.physical_work_order_attached === false || task.status === 'completed');
    const physBg = hasPhysical
      ? COLOR.SUCCESS_BG
      : physicalNotAttached
      ? COLOR.WARNING_BG
      : COLOR.OFF_WHITE;
    const physFg = hasPhysical
      ? COLOR.SUCCESS
      : physicalNotAttached
      ? COLOR.WARNING
      : COLOR.MID_GREY;
    const physLabel = hasPhysical
      ? 'ADJUNTADO'
      : physicalNotAttached
      ? 'NO ADJUNTADO'
      : 'PENDIENTE';

    setColorFill(physBg);
    setColorDraw(COLOR.BORDER);
    doc.roundedRect(c3x, y, instW, instH, 1.2, 1.2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    setColorText(COLOR.MID_GREY);
    doc.text('PARTE DE TRABAJO FÍSICO', c3x + 3, y + 4.8);
    doc.setFontSize(9.2);
    setColorText(physFg);
    doc.text(physLabel, c3x + 3, y + 11);
    if (physicalWorkOrderPhotos.length > 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      setColorText(COLOR.DARK_GREY);
      doc.text(
        `${physicalWorkOrderPhotos.length} doc. adjunto(s)`,
        c3x + 3,
        y + 15.6
      );
    }

    y += instH + 3.5;

    if (task.merchandise_check_notes?.trim()) {
      const checkNoteLines = doc.splitTextToSize(
        sanitizePdfText(`Obs. cotejo: ${task.merchandise_check_notes}`),
        CW - 8
      ) as string[];
      const noteH = checkNoteLines.length * 4.2 + 5;
      ensureSpace(noteH + 2);
      setColorFill(COLOR.OFF_WHITE);
      setColorDraw(COLOR.BORDER);
      doc.roundedRect(M, y, CW, noteH, 1, 1, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.1);
      setColorText(COLOR.DARK_GREY);
      doc.text(checkNoteLines, M + 4, y + 4.5);
      y += noteH + 3;
    }

    if (orderAttachments.length > 0) {
      const boxH = 8 + orderAttachments.length * 4.5;
      ensureSpace(boxH + 3);
      setColorFill(COLOR.SOFT_NAVY);
      setColorDraw(COLOR.BORDER);
      doc.roundedRect(M, y, CW, boxH, 1.2, 1.2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      setColorText(COLOR.NAVY);
      doc.text(`PEDIDOS DE INSTALACIÓN ADJUNTOS (${orderAttachments.length}):`, M + 3.5, y + 5);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      setColorText(COLOR.CHARCOAL);
      orderAttachments.forEach((ord, idx) => {
        doc.text(
          sanitizePdfText(`- ${ord.file_name} (${formatDateTimeEs(ord.created_at)})`),
          M + 5,
          y + 9.8 + idx * 4.5
        );
      });
      y += boxH + 3.5;
    }
  }

  // Caja Descripción del Problema / Solicitud / Tarea
  const descTitle =
    taskType === 'installation'
      ? 'SOLICITUD DE INSTALACIÓN'
      : taskType === 'task'
      ? 'DESCRIPCIÓN DE LA TAREA'
      : 'DESCRIPCIÓN DE LA INCIDENCIA / AVERÍA';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  const descLines = doc.splitTextToSize(
    sanitizePdfText(task.problem_desc || 'Sin descripción.'),
    CW - 10
  ) as string[];
  const descBoxH = 8.5 + descLines.length * 4.5 + 2.5;
  ensureSpace(descBoxH + 4);

  setColorFill(COLOR.OFF_WHITE);
  setColorDraw(COLOR.BORDER);
  doc.setLineWidth(0.28);
  doc.roundedRect(M, y, CW, descBoxH, 1.2, 1.2, 'FD');
  setColorFill(COLOR.PETROL);
  doc.rect(M, y, 1.5, descBoxH, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.3);
  setColorText(COLOR.PETROL);
  doc.text(descTitle, M + 4.5, y + 5.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  setColorText(COLOR.CHARCOAL);
  doc.text(descLines, M + 4.5, y + 10.2);

  y += descBoxH + 4;

  // Caja destacada de Resolución (obligatoria en RMA, CXC y Tareas; excluida en Instalaciones)
  if (isResolutionRequiredForClosure(taskType)) {
    const cleanResolution = task.resolution?.trim() ? sanitizePdfText(task.resolution) : '';
    const audit = getLastResolutionAudit(task, history);
    const resLines = doc.splitTextToSize(
      cleanResolution || 'Resolución pendiente de registrar por el equipo técnico.',
      CW - 10
    ) as string[];
    const resBoxH = 9 + resLines.length * 4.5 + 3;
    ensureSpace(resBoxH + 4);

    setColorFill(cleanResolution ? COLOR.SUCCESS_BG : COLOR.WARNING_BG);
    setColorDraw(COLOR.BORDER);
    doc.setLineWidth(0.28);
    doc.roundedRect(M, y, CW, resBoxH, 1.2, 1.2, 'FD');
    setColorFill(cleanResolution ? COLOR.SUCCESS : COLOR.WARNING);
    doc.rect(M, y, 1.5, resBoxH, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    setColorText(cleanResolution ? COLOR.SUCCESS : COLOR.WARNING);
    doc.text('RESOLUCIÓN DEL PROBLEMA', M + 4.5, y + 5.2);

    if (cleanResolution && audit) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      setColorText(COLOR.MID_GREY);
      doc.text(
        sanitizePdfText(`${audit.authorName} · ${formatDateTimeEs(audit.updatedAt)}`),
        M + CW - 4,
        y + 5.2,
        { align: 'right' }
      );
    }

    doc.setFont(cleanResolution ? 'helvetica' : 'helvetica', cleanResolution ? 'normal' : 'italic');
    doc.setFontSize(8.9);
    setColorText(COLOR.CHARCOAL);
    doc.text(resLines, M + 4.5, y + 10.4);

    y += resBoxH + 4;
  }

  y += 2;

  // ─── 5. NOTAS TÉCNICAS E INCIDENCIAS (SOLO INFORME INTERNO) ────────────────
  if (variant === 'internal') {
    const technicalNotes = extractTechnicalNotes(task, history);
    if (technicalNotes.length > 0) {
      addSectionTitle(`Notas Técnicas e Incidencias (${technicalNotes.length})`);

      technicalNotes.forEach((noteItem, idx) => {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        const noteLines = doc.splitTextToSize(sanitizePdfText(noteItem.text), CW - 9) as string[];
        const cardH = 8 + noteLines.length * 4.3 + 2.5;
        ensureSpace(cardH + 3);

        setColorFill(idx === 0 ? COLOR.SOFT_NAVY : COLOR.OFF_WHITE);
        setColorDraw(COLOR.BORDER);
        doc.setLineWidth(0.28);
        doc.roundedRect(M, y, CW, cardH, 1.2, 1.2, 'FD');
        if (idx === 0) {
          setColorFill(COLOR.NAVY);
          doc.rect(M, y, 1.4, cardH, 'F');
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        setColorText(COLOR.NAVY);
        doc.text(sanitizePdfText(noteItem.authorName), M + 4, y + 5.2);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.3);
        setColorText(COLOR.MID_GREY);
        doc.text(formatDateTimeEs(noteItem.createdAt), M + CW - 3.5, y + 5.2, {
          align: 'right',
        });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        setColorText(COLOR.CHARCOAL);
        doc.text(noteLines, M + 4, y + 10);

        y += cardH + 2.8;
      });

      y += 3;
    }
  }

  // ─── 6. TABLA DE MATERIALES Y REPUESTOS UTILIZADOS ─────────────────────────
  if (task.materials_used && task.materials_used.length > 0) {
    addSectionTitle('Materiales y Repuestos Utilizados');

    const colDescW = 108;
    const colRefW = 48;

    const drawMaterialsHeader = () => {
      setColorFill(COLOR.NAVY);
      doc.rect(M, y, CW, 7.2, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      setColorText(COLOR.WHITE);
      doc.text('DESCRIPCIÓN DEL MATERIAL / REPUESTO', M + 3, y + 4.8);
      doc.text('REFERENCIA', M + colDescW + 2, y + 4.8);
      doc.text('CANT.', pageWidth - M - 3, y + 4.8, { align: 'right' });
      y += 7.2;
    };

    drawMaterialsHeader();

    let totalUnits = 0;
    task.materials_used.forEach((mat, idx) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.4);
      const nameLines = doc.splitTextToSize(sanitizePdfText(mat.name), colDescW - 5) as string[];
      const refLines = doc.splitTextToSize(sanitizePdfText(mat.ref || '—'), colRefW - 4) as string[];
      const maxLines = Math.max(nameLines.length, refLines.length, 1);
      const rowH = maxLines * 4.2 + 3.2;

      if (y + rowH > MAX_Y) {
        addContinuationPage();
        drawMaterialsHeader();
      }

      setColorFill(idx % 2 === 0 ? COLOR.WHITE : COLOR.OFF_WHITE);
      setColorDraw(COLOR.BORDER);
      doc.setLineWidth(0.22);
      doc.rect(M, y, CW, rowH, 'FD');

      setColorText(COLOR.CHARCOAL);
      doc.text(nameLines, M + 3, y + 4.6);
      setColorText(COLOR.DARK_GREY);
      doc.text(refLines, M + colDescW + 2, y + 4.6);

      doc.setFont('helvetica', 'bold');
      setColorText(COLOR.NAVY);
      const qty = Math.max(1, Number(mat.qty) || 1);
      totalUnits += qty;
      doc.text(String(qty), pageWidth - M - 3, y + 4.6, { align: 'right' });

      y += rowH;
    });

    // Fila de totales
    ensureSpace(8);
    setColorFill(COLOR.SOFT_NAVY);
    setColorDraw(COLOR.BORDER);
    doc.rect(M, y, CW, 7, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setColorText(COLOR.NAVY);
    doc.text(
      `Total: ${task.materials_used.length} referencia(s)`,
      M + 3,
      y + 4.7
    );
    doc.text(`${totalUnits} ud.`, pageWidth - M - 3, y + 4.7, { align: 'right' });

    y += 12;
  }

  // ─── 7. HISTORIAL DE ACTUACIONES / AUDIT TRAIL (SOLO INFORME INTERNO) ──────
  if (variant === 'internal') {
    const timelineEvents = [...history]
      .filter((item) => item.event_type !== 'note_added')
      .sort((a, b) => a.created_at.localeCompare(b.created_at));

    if (timelineEvents.length > 0) {
      addSectionTitle('Historial Cronológico de Actuaciones (Audit Trail)');

      timelineEvents.forEach((item, idx) => {
        const formatted = formatHistoryEventForPdf(item);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.2);
        const detailLines = doc.splitTextToSize(formatted.text, CW - 12) as string[];
        const itemH = 4.6 + detailLines.length * 4 + 2.5;

        ensureSpace(itemH + 2);

        const dotX = M + 3.2;
        const dotY = y + 1.4;
        const dotColor: RgbTuple =
          formatted.tone === 'danger'
            ? COLOR.DANGER
            : formatted.tone === 'success'
            ? COLOR.SUCCESS
            : formatted.tone === 'warning'
            ? COLOR.WARNING
            : COLOR.NAVY;

        if (idx < timelineEvents.length - 1 && y + itemH + 4 <= MAX_Y) {
          setColorDraw(COLOR.BORDER);
          doc.setLineWidth(0.4);
          doc.line(dotX, dotY + 1.4, dotX, y + itemH);
        }

        setColorFill(dotColor);
        doc.circle(dotX, dotY, 1.35, 'F');

        const ts = formatDateTimeEs(item.created_at);
        const actor = sanitizePdfText(item.actor?.full_name || 'Sistema');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        setColorText(COLOR.NAVY);
        doc.text(`${ts} · ${actor}`, M + 8, y + 2.2);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.1);
        setColorText(
          formatted.tone === 'danger'
            ? COLOR.DANGER
            : formatted.tone === 'success'
            ? COLOR.SUCCESS
            : COLOR.DARK_GREY
        );
        doc.text(detailLines, M + 8, y + 6.4);

        y += itemH;
      });

      y += 4;
    }
  }

  // ─── 8. FOTOGRAFÍAS ADJUNTAS (1 GRANDE O REJILLA 2 COLUMNAS) ───────────────
  const drawSingleLargeImageSection = (
    title: string,
    items: PdfImageItem[],
    opts: { maxImgW: number; maxImgH: number; badgePrefix: string }
  ) => {
    if (items.length === 0) return;
    if (y > 215) addContinuationPage();
    addSectionTitle(title);

    items.forEach((img, i) => {
      const safeW = Math.max(1, img.width);
      const safeH = Math.max(1, img.height);
      const scale = Math.min(opts.maxImgW / safeW, opts.maxImgH / safeH);
      const drawW = Math.max(20, safeW * scale);
      const drawH = Math.max(20, safeH * scale);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.3);
      const captionLines = doc.splitTextToSize(
        sanitizePdfText(img.label || 'Fotografía adjunta'),
        CW - 10
      ) as string[];
      const headerH = 7;
      const cardH = headerH + 4 + drawH + 4 + captionLines.length * 4.1 + 3;

      if (y + cardH > MAX_Y) {
        addContinuationPage();
      }

      setColorDraw(COLOR.BORDER);
      setColorFill(COLOR.WHITE);
      doc.setLineWidth(0.32);
      doc.roundedRect(M, y, CW, cardH, 1.4, 1.4, 'FD');

      setColorFill(COLOR.OFF_WHITE);
      doc.rect(M + 0.2, y + 0.2, CW - 0.4, headerH, 'F');
      setColorDraw(COLOR.BORDER);
      doc.line(M, y + headerH, M + CW, y + headerH);

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      setColorText(COLOR.NAVY);
      doc.text(`${opts.badgePrefix} ${i + 1} de ${items.length}`, M + 3.5, y + 4.8);

      if (img.capturedAt) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.3);
        setColorText(COLOR.MID_GREY);
        doc.text(sanitizePdfText(img.capturedAt), M + CW - 3.5, y + 4.8, { align: 'right' });
      }

      const imgX = M + (CW - drawW) / 2;
      const imgY = y + headerH + 4;
      try {
        doc.addImage(img.dataUrl, img.format, imgX, imgY, drawW, drawH);
        setColorDraw(COLOR.BORDER);
        doc.setLineWidth(0.25);
        doc.rect(imgX, imgY, drawW, drawH);
      } catch {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        setColorText(COLOR.LIGHT_GREY);
        doc.text('No se pudo renderizar esta imagen', pageWidth / 2, imgY + drawH / 2, {
          align: 'center',
        });
      }

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.3);
      setColorText(COLOR.DARK_GREY);
      doc.text(captionLines, M + 4, imgY + drawH + 5.5);

      y += cardH + 5.5;
    });

    y += 2;
  };

  if (photos.length === 1) {
    drawSingleLargeImageSection(
      taskType === 'installation' ? 'Fotografías de la Instalación (1)' : 'Fotografías Adjuntas (1)',
      photos,
      { maxImgW: 166, maxImgH: 92, badgePrefix: 'Foto' }
    );
  } else if (photos.length >= 2) {
    if (y > 210) addContinuationPage();
    addSectionTitle(
      taskType === 'installation'
        ? `Fotografías de la Instalación (${photos.length})`
        : `Fotografías Adjuntas (${photos.length})`
    );

    const photoGap = 4;
    const cardW = (CW - photoGap) / 2; // 89 mm
    const imgBoxW = cardW - 6; // 83 mm
    const imgBoxH = 56;
    const headerH = 6.8;

    for (let i = 0; i < photos.length; i += 2) {
      const pair = photos.slice(i, i + 2);
      const preparedPair = pair.map((img, offset) => {
        const safeW = Math.max(1, img.width);
        const safeH = Math.max(1, img.height);
        const scale = Math.min(imgBoxW / safeW, imgBoxH / safeH);
        const drawW = Math.max(16, safeW * scale);
        const drawH = Math.max(16, safeH * scale);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.8);
        const captionLines = doc.splitTextToSize(
          sanitizePdfText(img.label || 'Fotografía adjunta'),
          cardW - 7
        ) as string[];
        return {
          img,
          index: i + offset + 1,
          drawW,
          drawH,
          captionLines,
          captionH: captionLines.length * 3.8 + 2.5,
        };
      });

      const maxCaptionH = Math.max(...preparedPair.map((p) => p.captionH));
      const rowCardH = headerH + 3 + imgBoxH + 3 + maxCaptionH + 2;

      if (y + rowCardH > MAX_Y) {
        addContinuationPage();
      }

      preparedPair.forEach((p, colIdx) => {
        const cx = M + colIdx * (cardW + photoGap);
        setColorFill(COLOR.WHITE);
        setColorDraw(COLOR.BORDER);
        doc.setLineWidth(0.3);
        doc.roundedRect(cx, y, cardW, rowCardH, 1.4, 1.4, 'FD');

        setColorFill(COLOR.OFF_WHITE);
        doc.rect(cx + 0.2, y + 0.2, cardW - 0.4, headerH, 'F');
        setColorDraw(COLOR.BORDER);
        doc.line(cx, y + headerH, cx + cardW, y + headerH);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        setColorText(COLOR.NAVY);
        doc.text(`Foto ${p.index} de ${photos.length}`, cx + 3, y + 4.7);

        if (p.img.capturedAt) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(6.9);
          setColorText(COLOR.MID_GREY);
          doc.text(sanitizePdfText(p.img.capturedAt), cx + cardW - 3, y + 4.7, {
            align: 'right',
          });
        }

        const imgX = cx + (cardW - p.drawW) / 2;
        const imgY = y + headerH + 3 + (imgBoxH - p.drawH) / 2;
        try {
          doc.addImage(p.img.dataUrl, p.img.format, imgX, imgY, p.drawW, p.drawH);
          setColorDraw(COLOR.BORDER);
          doc.setLineWidth(0.2);
          doc.rect(imgX, imgY, p.drawW, p.drawH);
        } catch {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(7.5);
          setColorText(COLOR.LIGHT_GREY);
          doc.text('No disponible', cx + cardW / 2, y + headerH + imgBoxH / 2, {
            align: 'center',
          });
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.8);
        setColorText(COLOR.DARK_GREY);
        doc.text(p.captionLines, cx + 3.5, y + headerH + 3 + imgBoxH + 4.2);
      });

      y += rowCardH + 4.5;
    }

    y += 2;
  }

  // ─── 9. PARTE DE TRABAJO FÍSICO (INSTALACIONES, ALTA NITIDEZ) ─────────────
  if (taskType === 'installation' && physicalWorkOrderPhotos.length > 0) {
    drawSingleLargeImageSection('Parte de Trabajo Físico', physicalWorkOrderPhotos, {
      maxImgW: 170,
      maxImgH: 185,
      badgePrefix: 'Parte físico',
    });
  }

  // ─── 10. CONFORMIDAD DEL CLIENTE Y VALIDACIÓN TÉCNICA (2 COLUMNAS) ──────────
  const sigBoxH = 50;
  ensureSpace(sigBoxH + 14);
  addSectionTitle('Conformidad y Validación del Servicio');

  const sigColGap = 4;
  const sigColW = (CW - sigColGap) / 2; // 89 mm
  const sigTimestamp = getSignatureTimestamp(history);

  // Columna izquierda: Firma del cliente
  setColorFill(COLOR.WHITE);
  setColorDraw(COLOR.BORDER);
  doc.setLineWidth(0.32);
  doc.roundedRect(M, y, sigColW, sigBoxH, 1.4, 1.4, 'FD');

  setColorFill(COLOR.OFF_WHITE);
  doc.rect(M + 0.2, y + 0.2, sigColW - 0.4, 7, 'F');
  doc.line(M, y + 7.2, M + sigColW, y + 7.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  setColorText(COLOR.NAVY);
  doc.text('CONFORMIDAD DEL CLIENTE', M + 3.2, y + 4.9);

  // Recuadro firma
  setColorFill(COLOR.OFF_WHITE);
  setColorDraw(COLOR.BORDER);
  doc.rect(M + 4, y + 9.5, sigColW - 8, 25, 'FD');

  if (task.client_signature_url) {
    try {
      doc.addImage(task.client_signature_url, 'PNG', M + 6, y + 10.5, sigColW - 12, 23);
    } catch {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8);
      setColorText(COLOR.MID_GREY);
      doc.text('Firma registrada digitalmente', M + sigColW / 2, y + 22.5, { align: 'center' });
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    setColorText(COLOR.LIGHT_GREY);
    doc.text('Sin firma digital registrada', M + sigColW / 2, y + 22.5, { align: 'center' });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  setColorText(COLOR.CHARCOAL);
  doc.text(
    sanitizePdfText(`Firmante: ${task.signer_name || 'Cliente'}`),
    M + 4,
    y + 39.2
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  setColorText(COLOR.MID_GREY);
  doc.text(
    sigTimestamp
      ? `Fecha firma: ${formatDateTimeEs(sigTimestamp)}`
      : 'Conforme con la actuación descrita en el parte.',
    M + 4,
    y + 43.8
  );

  // Columna derecha: Validación técnica SAT y sello de estado
  const rx = M + sigColW + sigColGap;
  setColorFill(COLOR.WHITE);
  setColorDraw(COLOR.BORDER);
  doc.setLineWidth(0.32);
  doc.roundedRect(rx, y, sigColW, sigBoxH, 1.4, 1.4, 'FD');

  setColorFill(COLOR.OFF_WHITE);
  doc.rect(rx + 0.2, y + 0.2, sigColW - 0.4, 7, 'F');
  doc.line(rx, y + 7.2, rx + sigColW, y + 7.2);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  setColorText(COLOR.NAVY);
  doc.text('VALIDACIÓN TÉCNICA SAT', rx + 3.2, y + 4.9);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  setColorText(COLOR.MID_GREY);
  doc.text('Técnico:', rx + 4, y + 13);
  setColorText(COLOR.CHARCOAL);
  doc.text(
    sanitizePdfText(task.assignee?.full_name || 'Sin asignar').slice(0, 32),
    rx + 22,
    y + 13
  );

  doc.setFont('helvetica', 'bold');
  setColorText(COLOR.MID_GREY);
  doc.text('Referencia:', rx + 4, y + 18.5);
  setColorText(COLOR.CHARCOAL);
  doc.text(sanitizePdfText(task.code), rx + 22, y + 18.5);

  doc.setFont('helvetica', 'bold');
  setColorText(COLOR.MID_GREY);
  doc.text('Cierre:', rx + 4, y + 24);
  doc.setFont('helvetica', 'normal');
  setColorText(COLOR.CHARCOAL);
  doc.text(
    task.completed_at ? formatDateTimeEs(task.completed_at) : 'Pendiente de cierre',
    rx + 22,
    y + 24
  );

  // Sello visual de estado
  const stampColors = getStatusBadgeColors(task.status);
  setColorFill(stampColors.bg);
  setColorDraw(stampColors.text);
  doc.setLineWidth(0.45);
  doc.roundedRect(rx + 4, y + 30.5, sigColW - 8, 13.5, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  setColorText(stampColors.text);
  doc.text(`ESTADO: ${statusLabel.toUpperCase()}`, rx + sigColW / 2, y + 38.8, {
    align: 'center',
  });

  // ─── 11. PIE DE PÁGINA CORPORATIVO EN TODAS LAS PÁGINAS ───────────────────
  const pageCount = doc.getNumberOfPages();
  const generatedLabel = formatDateTimeEs(new Date().toISOString());
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    setColorDraw(COLOR.BORDER);
    doc.setLineWidth(0.3);
    doc.line(M, 283.5, pageWidth - M, 283.5);
    setColorFill(COLOR.MAGENTA);
    doc.rect(M, 283.2, 26, 0.8, 'F');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    setColorText(COLOR.MID_GREY);
    doc.text(
      sanitizePdfText(
        `VistaSatPRO · ${task.code} · ${
          variant === 'client' ? 'Copia para Cliente' : 'Informe Interno SAT'
        }`
      ),
      M,
      288.8
    );
    doc.text(`Generado el ${generatedLabel} · Pág. ${i}/${pageCount}`, pageWidth - M, 288.8, {
      align: 'right',
    });
  }

  return doc.output('blob');
}

async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

/**
 * Descarga y normaliza una imagen para jsPDF:
 * - Preserva orientación EXIF y proporciones reales (naturalWidth × naturalHeight)
 * - Convierte WEBP/PNG/JPG a JPEG optimizado (máx. 1600 px) con fondo blanco
 */
async function prepareImageForPdf(
  url: string,
  label: string,
  capturedAt?: string
): Promise<PdfImageItem | null> {
  try {
    const rawDataUrl = await urlToDataUrl(url);
    if (!rawDataUrl.startsWith('data:image/')) return null;

    if (typeof document === 'undefined') {
      const format = rawDataUrl.includes('image/png') ? 'PNG' : 'JPEG';
      return { dataUrl: rawDataUrl, format, width: 1200, height: 900, label, capturedAt };
    }

    const img = await loadHtmlImage(rawDataUrl);
    const naturalW = img.naturalWidth || 1200;
    const naturalH = img.naturalHeight || 900;
    const maxDim = 1600;
    const ratio = Math.min(1, maxDim / Math.max(naturalW, naturalH));
    const targetW = Math.max(1, Math.round(naturalW * ratio));
    const targetH = Math.max(1, Math.round(naturalH * ratio));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      const format = rawDataUrl.includes('image/png') ? 'PNG' : 'JPEG';
      return { dataUrl: rawDataUrl, format, width: naturalW, height: naturalH, label, capturedAt };
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, targetW, targetH);
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const normalizedUrl = canvas.toDataURL('image/jpeg', 0.85);
    return {
      dataUrl: normalizedUrl,
      format: 'JPEG',
      width: targetW,
      height: targetH,
      label,
      capturedAt,
    };
  } catch {
    return null;
  }
}

function isImageAttachment(att: Attachment): boolean {
  if (att.mime_type) {
    return att.mime_type.startsWith('image/');
  }
  return /\.(jpe?g|png|webp|gif|bmp)$/i.test(att.file_name);
}

function isOrderAttachment(att: Attachment): boolean {
  return (
    att.attachment_kind === 'installation_order' ||
    Boolean(att.caption?.startsWith('[PEDIDO_INSTALACION]'))
  );
}

function isPhysicalOrderAttachment(att: Attachment): boolean {
  return (
    att.attachment_kind === 'physical_work_order' ||
    Boolean(att.caption?.startsWith('[PARTE_FISICO]'))
  );
}

export async function downloadTaskPDF(
  task: Task,
  history: TaskHistoryItem[],
  attachments: Attachment[] = [],
  variant: PdfVariant = 'internal'
) {
  let preparedTask = task;
  if (task.client_signature_url && !task.client_signature_url.startsWith('data:')) {
    try {
      const sigDataUrl = await urlToDataUrl(task.client_signature_url);
      preparedTask = { ...task, client_signature_url: sigDataUrl };
    } catch {
      // Si falla la descarga, genera el PDF sin romper
    }
  }

  let logoDataUrl: string | null = null;
  try {
    logoDataUrl = await urlToDataUrl('/icons/icon-192.png');
  } catch {
    logoDataUrl = null;
  }

  const orderAttachments = attachments.filter(isOrderAttachment);
  const generalImageAttachments = attachments.filter(
    (a) => !isOrderAttachment(a) && !isPhysicalOrderAttachment(a) && isImageAttachment(a)
  );
  const physicalImageAttachments = attachments.filter(
    (a) => isPhysicalOrderAttachment(a) && isImageAttachment(a)
  );

  const photos: PdfImageItem[] = [];
  for (const att of generalImageAttachments) {
    const capturedAt = att.created_at
      ? new Date(att.created_at).toLocaleString('es-ES', {
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : undefined;
    const prepared = await prepareImageForPdf(
      att.public_url,
      att.caption || att.file_name,
      capturedAt
    );
    if (prepared) photos.push(prepared);
  }

  const physicalWorkOrderPhotos: PdfImageItem[] = [];
  for (const att of physicalImageAttachments) {
    const capturedAt = att.created_at
      ? new Date(att.created_at).toLocaleString('es-ES', {
          dateStyle: 'short',
          timeStyle: 'short',
        })
      : undefined;
    const cleanCaption = att.caption?.replace(/^\[PARTE_FISICO\]\s*/, '') || 'Parte de trabajo físico';
    const prepared = await prepareImageForPdf(att.public_url, cleanCaption, capturedAt);
    if (prepared) physicalWorkOrderPhotos.push(prepared);
  }

  const blob = generateTaskPDF(preparedTask, history, photos, physicalWorkOrderPhotos, {
    variant,
    logoDataUrl,
    orderAttachments,
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildPdfFilename(task, variant);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

export interface ReportPdfInput {
  filters: {
    dateFrom?: string;
    dateTo?: string;
    typeLabel?: string;
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
  resolutionByType?: Array<{
    label: string;
    count: number;
    formatted: string;
  }>;
  topParts?: Array<{
    name: string;
    ref?: string;
    qty: number;
    taskCount: number;
  }>;
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
    `Tipo: ${input.filters.typeLabel || 'Todos'}`,
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
  y += 9;

  // Tiempos medios por tipo de parte
  if (input.resolutionByType && input.resolutionByType.length > 0) {
    ensureSpace(24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(0, 33, 105);
    doc.text('Tiempo medio de cierre por tipo de parte:', 14, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(34, 34, 34);
    for (const item of input.resolutionByType) {
      doc.text(
        `- ${item.label}: ${item.formatted} (${item.count} cierre${item.count === 1 ? '' : 's'})`,
        16,
        y
      );
      y += 4.8;
    }
    y += 4;
  }

  // Repuestos más consumidos
  if (input.topParts && input.topParts.length > 0) {
    addSection('Repuestos Más Consumidos');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(102, 102, 102);
    doc.text('Material / Repuesto', 14, y);
    doc.text('Ref.', 118, y);
    doc.text('Partes', 156, y, { align: 'right' });
    doc.text('Unid.', pageWidth - 14, y, { align: 'right' });
    y += 2;
    doc.setDrawColor(221, 221, 221);
    doc.line(14, y, pageWidth - 14, y);
    y += 5;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(34, 34, 34);
    for (const part of input.topParts.slice(0, 12)) {
      ensureSpace(8);
      doc.text(part.name.slice(0, 44), 14, y);
      doc.text((part.ref || '—').slice(0, 18), 118, y);
      doc.text(String(part.taskCount), 156, y, { align: 'right' });
      doc.text(String(part.qty), pageWidth - 14, y, { align: 'right' });
      y += 5.5;
    }
    y += 4;
  }

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
    doc.text('Media', pageWidth - 14, y, { align: 'right' });
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
      doc.text(getTaskStatusLabel(t.status), 112, y);
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
