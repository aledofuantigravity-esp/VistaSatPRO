import { jsPDF } from 'jspdf';
import { formatDurationLabel, sanitizePdfText } from '@/lib/pdf-helpers';
import {
  computeReportAnalytics,
  type ReportFiltersSummary,
  type ReportPdfVariant,
} from '@/lib/report-analytics';
import {
  getTaskStatusLabel,
  normalizeTaskStatus,
  resolveTaskType,
  TASK_PRIORITY_META,
  TASK_TYPE_META,
  type PartCatalogItem,
  type Task,
  type TaskType,
} from '@/types/database';

export type { ReportPdfVariant };

export interface ReportPdfInput {
  variant?: ReportPdfVariant;
  generatedBy?: string;
  logoDataUrl?: string | null;
  filters: ReportFiltersSummary;
  kpis?: {
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
  partsCatalog?: PartCatalogItem[];
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

type RgbTuple = readonly [number, number, number];

const COLOR = {
  NAVY: [0, 33, 105] as RgbTuple,
  NAVY_DARK: [31, 42, 68] as RgbTuple,
  MAGENTA: [207, 9, 94] as RgbTuple,
  PETROL: [0, 72, 118] as RgbTuple,
  PLUM: [94, 54, 84] as RgbTuple,
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
};

function formatCurrencyEur(amount: number): string {
  return `${amount.toFixed(2).replace('.', ',')} EUR`;
}

function slugifyFilenamePart(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 28);
}

/**
 * Construye el nombre de archivo de descarga según variante ('internal' | 'client') y filtro de cliente.
 */
export function buildReportPdfFilename(input: ReportPdfInput): string {
  const variant: ReportPdfVariant = input.variant || 'internal';
  const datePart = new Date().toISOString().slice(0, 10);
  if (variant === 'client') {
    const custSlug =
      input.filters.isSingleCustomer && input.filters.customerName
        ? `_${slugifyFilenamePart(input.filters.customerName)}`
        : '';
    return `VistaSatPRO_informe_SAT_cliente${custSlug}_${datePart}.pdf`;
  }
  return `VistaSatPRO_informe_SAT_interno_${datePart}.pdf`;
}

async function urlToDataUrlSafe(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Genera el Blob PDF ejecutivo o de cliente para los Informes Operativos SAT con gráficas vectoriales,
 * indicadores de SLA, instalaciones/productos, costes estimados de repuestos y anexo detallado.
 */
export function generateReportPDF(input: ReportPdfInput): Blob {
  const variant: ReportPdfVariant = input.variant || 'internal';
  const analytics = computeReportAnalytics({
    tasks: input.tasks,
    partsCatalog: input.partsCatalog,
    techStats: input.techStats,
    topCustomers: input.topCustomers,
    filters: input.filters,
    variant,
  });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const M = 14;
  const CW = pageWidth - M * 2; // 182 mm
  const MAX_Y = 276;

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
    doc.text('VistaSatPRO · Informe Operativo SAT', M, 7.2);

    doc.setFont('helvetica', 'normal');
    doc.text(
      variant === 'client' ? 'Informe de Servicio (Cliente)' : 'Informe Ejecutivo Interno',
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

  const ensureSpace = (needed = 18) => {
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
    doc.setFontSize(9.4);
    doc.text(numbered, M + 4.5, y + 0.6);
    y += 9.5;
  };

  const drawBadge = (
    text: string,
    x: number,
    baselineY: number,
    bg: RgbTuple,
    fg: RgbTuple
  ): number => {
    const clean = sanitizePdfText(text).toUpperCase();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.1);
    const padX = 3;
    const textW = doc.getTextWidth(clean);
    const pillW = textW + padX * 2;
    setColorFill(bg);
    doc.roundedRect(x, baselineY - 4, pillW, 5.5, 1.3, 1.3, 'F');
    setColorText(fg);
    doc.text(clean, x + padX, baselineY - 0.1);
    return pillW;
  };

  // ─── 1. CABECERA PRINCIPAL CORPORATIVA ────────────────────────────────────
  setColorFill(COLOR.NAVY);
  doc.rect(0, 0, pageWidth, 38, 'F');
  setColorFill(COLOR.MAGENTA);
  doc.rect(0, 38, pageWidth, 2.4, 'F');

  let brandX = M;
  if (input.logoDataUrl) {
    try {
      setColorFill(COLOR.WHITE);
      doc.roundedRect(M, 7.5, 14, 14, 2.2, 2.2, 'F');
      doc.addImage(input.logoDataUrl, 'PNG', M + 1.2, 8.7, 11.6, 11.6);
      brandX = M + 17.5;
    } catch {
      brandX = M;
    }
  }

  setColorText(COLOR.WHITE);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18.5);
  doc.text('VistaSatPRO', brandX, 14.2);

  const subtitle =
    variant === 'client' && input.filters.isSingleCustomer && input.filters.customerName
      ? `INFORME DE SERVICIO TÉCNICO — ${input.filters.customerName}`
      : 'INFORME OPERATIVO DE SERVICIO TÉCNICO (SAT)';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.4);
  doc.text(sanitizePdfText(subtitle).slice(0, 62), brandX, 20.6);

  drawBadge(
    variant === 'client' ? 'INFORME PARA CLIENTE' : 'INFORME EJECUTIVO INTERNO',
    brandX,
    29.8,
    variant === 'client' ? COLOR.SUCCESS_BG : COLOR.MAGENTA,
    variant === 'client' ? COLOR.SUCCESS : COLOR.WHITE
  );

  // Caja derecha: período + emisión + responsable
  const boxW = 58;
  const boxX = pageWidth - M - boxW;
  setColorFill(COLOR.NAVY_DARK);
  doc.setDrawColor(64, 86, 138);
  doc.setLineWidth(0.35);
  doc.roundedRect(boxX, 6.2, boxW, 25.5, 1.8, 1.8, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.6);
  doc.setTextColor(195, 208, 236);
  doc.text('PERÍODO ANALIZADO', boxX + 3, 10.6);

  const periodStr =
    input.filters.dateFrom || input.filters.dateTo
      ? `${input.filters.dateFrom || 'Inicio'} -> ${input.filters.dateTo || 'Hoy'}`
      : 'Histórico completo';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  setColorText(COLOR.WHITE);
  doc.text(sanitizePdfText(periodStr), boxX + 3, 15.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(210, 220, 240);
  doc.text(
    sanitizePdfText(
      `Emitido: ${new Date().toLocaleString('es-ES', {
        dateStyle: 'short',
        timeStyle: 'short',
      })}`
    ),
    boxX + 3,
    21.8
  );
  if (input.generatedBy) {
    doc.text(
      sanitizePdfText(`Por: ${input.generatedBy}`).slice(0, 32),
      boxX + 3,
      26.4
    );
  }

  y = 45.5;

  // ─── 1.2 CHIPS DE ALCANCE Y FILTROS APLICADOS ─────────────────────────────
  const filterItems = [
    `Tipo: ${input.filters.typeLabel || 'Todos'}`,
    ...(variant === 'internal' || (input.filters.technicianName && input.filters.technicianName !== 'Todos')
      ? [`Técnico: ${input.filters.technicianName || 'Todos'}`]
      : []),
    `Cliente: ${input.filters.customerName || 'Todos'}`,
    `Estado: ${input.filters.statusLabel || 'Todos'}`,
  ];

  setColorFill(COLOR.OFF_WHITE);
  setColorDraw(COLOR.BORDER);
  doc.setLineWidth(0.25);
  doc.roundedRect(M, y, CW, 10, 1.2, 1.2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  setColorText(COLOR.NAVY);
  doc.text('ALCANCE:', M + 3, y + 6.1);

  let chipX = M + 20;
  filterItems.forEach((txt) => {
    const clean = sanitizePdfText(txt);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    const chipW = Math.min(44, doc.getTextWidth(clean) + 5);
    if (chipX + chipW <= M + CW - 2) {
      setColorFill(COLOR.WHITE);
      setColorDraw(COLOR.BORDER);
      doc.roundedRect(chipX, y + 2, chipW, 6, 1, 1, 'FD');
      setColorText(COLOR.DARK_GREY);
      doc.text(clean.slice(0, 26), chipX + 2.5, y + 6.1);
      chipX += chipW + 2.5;
    }
  });

  y += 14.5;

  // ─── 2. PANEL DE 6 TARJETAS KPI (2 × 3) ───────────────────────────────────
  addSectionTitle('Resumen Ejecutivo e Indicadores Clave');

  const kpiGap = 3.5;
  const kpiW = (CW - kpiGap * 2) / 3;
  const kpiH = 19;
  const { kpis } = analytics;

  const kpiCards: Array<{
    accent: RgbTuple;
    label: string;
    value: string;
    sub: string;
    valueColor?: RgbTuple;
    progressPct?: number;
  }> = [
    {
      accent: COLOR.NAVY,
      label: 'TOTAL DE PARTES',
      value: String(kpis.total),
      sub: `${kpis.open} abierto(s) · ${kpis.completed} cerrado(s)`,
    },
    {
      accent: COLOR.PETROL,
      label: 'TASA DE CIERRE',
      value: `${kpis.closeRate}%`,
      sub: `${kpis.completed} de ${kpis.total} partes`,
      valueColor: kpis.closeRate >= 70 ? COLOR.SUCCESS : COLOR.NAVY,
      progressPct: kpis.closeRate,
    },
    {
      accent:
        kpis.slaCompliancePct === null
          ? COLOR.LIGHT_GREY
          : kpis.slaOverdueCount > 0
          ? COLOR.DANGER
          : COLOR.SUCCESS,
      label: 'CUMPLIMIENTO SLA',
      value: kpis.slaCompliancePct !== null ? `${kpis.slaCompliancePct}%` : 'Sin SLA',
      sub:
        kpis.slaTrackedCount > 0
          ? `${kpis.slaOverdueCount} venc. · ${kpis.slaDueTodayCount} vence hoy`
          : 'Sin fechas límite asignadas',
      valueColor:
        kpis.slaCompliancePct === null
          ? COLOR.MID_GREY
          : kpis.slaOverdueCount > 0
          ? COLOR.DANGER
          : COLOR.SUCCESS,
      progressPct: kpis.slaCompliancePct ?? undefined,
    },
    {
      accent: COLOR.INFO,
      label: 'TIEMPO MEDIO RESOLUCIÓN',
      value: kpis.avgHoursFormatted,
      sub: `Sobre ${kpis.closedWithDurationCount} cierre(s) con fecha`,
    },
    {
      accent: kpis.urgentHighOpenCount > 0 ? COLOR.DANGER : COLOR.SUCCESS,
      label: 'URGENTES / ALTA ABIERTOS',
      value: String(kpis.urgentHighOpenCount),
      sub:
        kpis.urgentHighOpenCount > 0
          ? `${kpis.unassignedCount} sin técnico asignado`
          : 'Sin incidencias críticas activas',
      valueColor: kpis.urgentHighOpenCount > 0 ? COLOR.DANGER : COLOR.SUCCESS,
    },
    {
      accent: COLOR.MAGENTA,
      label: 'MATERIALES Y PRODUCTOS',
      value: `${kpis.totalMaterialUnits + kpis.totalInstallProductsUnits} ud.`,
      sub:
        variant === 'internal' && kpis.hasEstimatedCost
          ? `Repuestos ~ ${formatCurrencyEur(kpis.totalEstimatedPartsCost)}`
          : `${kpis.totalMaterialUnits} repuesto(s) · ${kpis.totalInstallProductsUnits} prod. inst.`,
    },
  ];

  ensureSpace(kpiH * 2 + kpiGap + 6);
  kpiCards.forEach((card, idx) => {
    const col = idx % 3;
    const row = Math.floor(idx / 3);
    const x = M + col * (kpiW + kpiGap);
    const cy = y + row * (kpiH + kpiGap);

    setColorFill(COLOR.WHITE);
    setColorDraw(COLOR.BORDER);
    doc.setLineWidth(0.28);
    doc.roundedRect(x, cy, kpiW, kpiH, 1.2, 1.2, 'FD');

    setColorFill(card.accent);
    doc.rect(x, cy, kpiW, 1.8, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    setColorText(COLOR.MID_GREY);
    doc.text(sanitizePdfText(card.label), x + 3, cy + 5.6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    setColorText(card.valueColor || COLOR.CHARCOAL);
    doc.text(sanitizePdfText(card.value), x + 3, cy + 12.2);

    if (typeof card.progressPct === 'number') {
      const barX = x + 32;
      const barW = kpiW - 35;
      if (barW > 8) {
        setColorFill(COLOR.OFF_WHITE);
        doc.roundedRect(barX, cy + 9.2, barW, 2.4, 0.8, 0.8, 'F');
        setColorFill(card.accent);
        const fillW = Math.max(1.2, (Math.min(100, Math.max(0, card.progressPct)) / 100) * barW);
        doc.roundedRect(barX, cy + 9.2, fillW, 2.4, 0.8, 0.8, 'F');
      }
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    setColorText(COLOR.MID_GREY);
    doc.text(sanitizePdfText(card.sub).slice(0, 36), x + 3, cy + 16.6);
  });

  y += kpiH * 2 + kpiGap + 6;

  // ─── 3. GRÁFICAS VECTORIALES NATIVAS ──────────────────────────────────────
  addSectionTitle('Análisis Gráfico del Período');

  // 3.1 Evolución Temporal (Barras agrupadas: Abiertos vs Cerrados)
  const chartH = 48;
  ensureSpace(chartH + 8);
  setColorFill(COLOR.WHITE);
  setColorDraw(COLOR.BORDER);
  doc.setLineWidth(0.28);
  doc.roundedRect(M, y, CW, chartH, 1.4, 1.4, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  setColorText(COLOR.NAVY);
  doc.text(sanitizePdfText(analytics.timelineGranularityLabel), M + 4, y + 5.8);

  // Leyenda superior derecha
  const legX = M + CW - 48;
  setColorFill(COLOR.NAVY);
  doc.rect(legX, y + 3.2, 3, 3, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  setColorText(COLOR.DARK_GREY);
  doc.text('Abiertos', legX + 4.5, y + 5.6);

  setColorFill(COLOR.SUCCESS);
  doc.rect(legX + 22, y + 3.2, 3, 3, 'F');
  doc.text('Cerrados', legX + 26.5, y + 5.6);

  const plotX = M + 10;
  const plotY = y + 11;
  const plotW = CW - 14;
  const plotH = 26;
  const maxVal = Math.max(
    1,
    ...analytics.timeline.map((b) => Math.max(b.opened, b.closed))
  );

  // Rejilla horizontal
  for (let g = 0; g <= 2; g++) {
    const gy = plotY + plotH - (g / 2) * plotH;
    setColorDraw(COLOR.BORDER);
    doc.setLineWidth(0.18);
    doc.line(plotX, gy, plotX + plotW, gy);
    const val = Math.round((maxVal * g) / 2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    setColorText(COLOR.MID_GREY);
    doc.text(String(val), plotX - 1.5, gy + 1, { align: 'right' });
  }

  const bucketCount = Math.max(1, analytics.timeline.length);
  const groupW = plotW / bucketCount;
  const barW = Math.min(5.2, Math.max(1.8, (groupW - 2.5) / 2));

  analytics.timeline.forEach((b, idx) => {
    const gx = plotX + idx * groupW + groupW / 2;
    const openH = b.opened > 0 ? Math.max(1.2, (b.opened / maxVal) * plotH) : 0;
    const closeH = b.closed > 0 ? Math.max(1.2, (b.closed / maxVal) * plotH) : 0;

    if (openH > 0) {
      setColorFill(COLOR.NAVY);
      doc.rect(gx - barW - 0.3, plotY + plotH - openH, barW, openH, 'F');
      if (groupW >= 10) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        setColorText(COLOR.NAVY);
        doc.text(String(b.opened), gx - barW / 2 - 0.3, plotY + plotH - openH - 0.9, {
          align: 'center',
        });
      }
    }

    if (closeH > 0) {
      setColorFill(COLOR.SUCCESS);
      doc.rect(gx + 0.3, plotY + plotH - closeH, barW, closeH, 'F');
      if (groupW >= 10) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6);
        setColorText(COLOR.SUCCESS);
        doc.text(String(b.closed), gx + barW / 2 + 0.3, plotY + plotH - closeH - 0.9, {
          align: 'center',
        });
      }
    }

    // Etiqueta X (saltando intermedios si hay muchos buckets)
    const showLabel =
      bucketCount <= 10 || idx === 0 || idx === bucketCount - 1 || idx % 2 === 0;
    if (showLabel) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.2);
      setColorText(COLOR.MID_GREY);
      doc.text(sanitizePdfText(b.label), gx, plotY + plotH + 4.8, { align: 'center' });
    }
  });

  y += chartH + 4;

  // 3.2 Distribución por Tipo de Parte (Barra apilada 100% + tiempos medios)
  const typeBoxH = 33;
  ensureSpace(typeBoxH + 5);
  setColorFill(COLOR.WHITE);
  setColorDraw(COLOR.BORDER);
  doc.setLineWidth(0.28);
  doc.roundedRect(M, y, CW, typeBoxH, 1.4, 1.4, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  setColorText(COLOR.NAVY);
  doc.text('Distribución por Tipo de Parte y Tiempo Medio de Cierre', M + 4, y + 5.8);

  const TYPE_COLORS: Record<TaskType, RgbTuple> = {
    installation: COLOR.PETROL,
    rma_incident: COLOR.NAVY,
    cxc_incident: COLOR.MAGENTA,
    task: COLOR.PLUM,
  };

  const stackX = M + 4;
  const stackW = CW - 8;
  const stackY = y + 9;
  setColorFill(COLOR.OFF_WHITE);
  doc.roundedRect(stackX, stackY, stackW, 4.5, 1, 1, 'F');

  if (kpis.total > 0) {
    let curX = stackX;
    analytics.byType.forEach((bt) => {
      if (bt.total <= 0) return;
      const segW = (bt.total / kpis.total) * stackW;
      setColorFill(TYPE_COLORS[bt.taskType]);
      doc.rect(curX, stackY, segW, 4.5, 'F');
      curX += segW;
    });
  }

  const miniW = (CW - 8 - 9) / 4;
  analytics.byType.forEach((bt, idx) => {
    const mx = M + 4 + idx * (miniW + 3);
    const my = y + 16;
    setColorFill(COLOR.OFF_WHITE);
    setColorDraw(COLOR.BORDER);
    doc.setLineWidth(0.2);
    doc.roundedRect(mx, my, miniW, 13.5, 1, 1, 'FD');

    setColorFill(TYPE_COLORS[bt.taskType]);
    doc.rect(mx + 2, my + 2.5, 2.5, 2.5, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.1);
    setColorText(COLOR.CHARCOAL);
    doc.text(sanitizePdfText(bt.shortLabel), mx + 5.8, my + 4.6);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.2);
    setColorText(COLOR.NAVY);
    doc.text(`${bt.total} (${bt.pct}%)`, mx + 2, my + 9.2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    setColorText(COLOR.MID_GREY);
    doc.text(sanitizePdfText(`Media: ${bt.avgFormatted}`), mx + 2, my + 12.2);
  });

  y += typeBoxH + 4;

  // 3.3 Dos paneles paralelos: Estados | Prioridades + SLA
  const dualH = 38;
  ensureSpace(dualH + 5);
  const panelW = (CW - 4) / 2;

  const drawHorizontalBarsCard = (
    px: number,
    py: number,
    title: string,
    rows: Array<{ label: string; count: number; pct: number; color: RgbTuple; suffix?: string }>
  ) => {
    setColorFill(COLOR.WHITE);
    setColorDraw(COLOR.BORDER);
    doc.setLineWidth(0.28);
    doc.roundedRect(px, py, panelW, dualH, 1.4, 1.4, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    setColorText(COLOR.NAVY);
    doc.text(sanitizePdfText(title), px + 3.5, py + 5.5);

    const maxBarW = panelW - 44;
    rows.forEach((row, idx) => {
      const ry = py + 11.5 + idx * 6.5;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      setColorText(COLOR.DARK_GREY);
      doc.text(sanitizePdfText(row.label), px + 3.5, ry);

      const bx = px + 26;
      setColorFill(COLOR.OFF_WHITE);
      doc.roundedRect(bx, ry - 2.6, maxBarW, 3.2, 0.8, 0.8, 'F');
      if (row.pct > 0) {
        setColorFill(row.color);
        doc.roundedRect(
          bx,
          ry - 2.6,
          Math.max(1.5, (Math.min(100, row.pct) / 100) * maxBarW),
          3.2,
          0.8,
          0.8,
          'F'
        );
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      setColorText(COLOR.CHARCOAL);
      doc.text(
        sanitizePdfText(row.suffix || `${row.count} (${row.pct}%)`),
        px + panelW - 3.5,
        ry,
        { align: 'right' }
      );
    });
  };

  drawHorizontalBarsCard(M, y, 'Cartera por Estado', [
    {
      label: analytics.byStatus[0].label,
      count: analytics.byStatus[0].count,
      pct: analytics.byStatus[0].pct,
      color: COLOR.WARNING,
    },
    {
      label: analytics.byStatus[1].label,
      count: analytics.byStatus[1].count,
      pct: analytics.byStatus[1].pct,
      color: COLOR.INFO,
    },
    {
      label: analytics.byStatus[2].label,
      count: analytics.byStatus[2].count,
      pct: analytics.byStatus[2].pct,
      color: COLOR.SUCCESS,
    },
    {
      label: analytics.byStatus[3].label,
      count: analytics.byStatus[3].count,
      pct: analytics.byStatus[3].pct,
      color: COLOR.LIGHT_GREY,
    },
  ]);

  drawHorizontalBarsCard(M + panelW + 4, y, 'Prioridades (Total / Abiertos)', [
    {
      label: analytics.byPriority[0].label,
      count: analytics.byPriority[0].count,
      pct: analytics.byPriority[0].pct,
      color: COLOR.DANGER,
      suffix: `${analytics.byPriority[0].count} / ${analytics.byPriority[0].openCount} ab.`,
    },
    {
      label: analytics.byPriority[1].label,
      count: analytics.byPriority[1].count,
      pct: analytics.byPriority[1].pct,
      color: COLOR.WARNING,
      suffix: `${analytics.byPriority[1].count} / ${analytics.byPriority[1].openCount} ab.`,
    },
    {
      label: analytics.byPriority[2].label,
      count: analytics.byPriority[2].count,
      pct: analytics.byPriority[2].pct,
      color: COLOR.INFO,
      suffix: `${analytics.byPriority[2].count} / ${analytics.byPriority[2].openCount} ab.`,
    },
    {
      label: analytics.byPriority[3].label,
      count: analytics.byPriority[3].count,
      pct: analytics.byPriority[3].pct,
      color: COLOR.LIGHT_GREY,
      suffix: `${analytics.byPriority[3].count} / ${analytics.byPriority[3].openCount} ab.`,
    },
  ]);

  y += dualH + 6;

  // ─── 4. CONCLUSIONES AUTOMÁTICAS Y FOCOS CRÍTICOS ─────────────────────────
  addSectionTitle('Conclusiones Clave del Período');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  const insightWrapped: string[][] = analytics.insights.map(
    (line) => doc.splitTextToSize(sanitizePdfText(`• ${line}`), CW - 10) as string[]
  );
  const totalInsightLines = insightWrapped.reduce((acc, lines) => acc + lines.length, 0);
  const insightBoxH = Math.max(14, totalInsightLines * 4.2 + 6);

  ensureSpace(insightBoxH + 5);
  setColorFill(COLOR.SOFT_NAVY);
  setColorDraw(COLOR.BORDER);
  doc.setLineWidth(0.28);
  doc.roundedRect(M, y, CW, insightBoxH, 1.2, 1.2, 'FD');
  setColorFill(COLOR.MAGENTA);
  doc.rect(M, y, 1.5, insightBoxH, 'F');

  let iy = y + 5.5;
  setColorText(COLOR.CHARCOAL);
  insightWrapped.forEach((lines) => {
    doc.text(lines, M + 4.5, iy);
    iy += lines.length * 4.2 + 0.6;
  });

  y += insightBoxH + 6;

  // Focos críticos (solo en informe interno o si hay críticos abiertos)
  if (analytics.criticalTasks.length > 0 && variant === 'internal') {
    addSectionTitle(`Focos Críticos Abiertos (${analytics.criticalTasks.length})`);

    const drawCriticalHeader = () => {
      setColorFill(COLOR.DANGER);
      doc.rect(M, y, CW, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      setColorText(COLOR.WHITE);
      doc.text('CÓDIGO', M + 2.5, y + 4.7);
      doc.text('CLIENTE', M + 28, y + 4.7);
      doc.text('TIPO', M + 86, y + 4.7);
      doc.text('PRIORIDAD / SLA', M + 105, y + 4.7);
      doc.text('TÉCNICO', M + 142, y + 4.7);
      doc.text('ABIERTO', M + CW - 2.5, y + 4.7, { align: 'right' });
      y += 7;
    };

    drawCriticalHeader();

    analytics.criticalTasks.forEach((item, idx) => {
      const rowH = 6.2;
      if (y + rowH > MAX_Y) {
        addContinuationPage();
        drawCriticalHeader();
      }
      setColorFill(idx % 2 === 0 ? COLOR.WHITE : COLOR.OFF_WHITE);
      setColorDraw(COLOR.BORDER);
      doc.setLineWidth(0.2);
      doc.rect(M, y, CW, rowH, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.4);
      setColorText(COLOR.NAVY);
      doc.text(sanitizePdfText(item.code), M + 2.5, y + 4.3);

      doc.setFont('helvetica', 'normal');
      setColorText(COLOR.CHARCOAL);
      doc.text(sanitizePdfText(item.customerName).slice(0, 29), M + 28, y + 4.3);
      doc.text(sanitizePdfText(item.taskTypeLabel), M + 86, y + 4.3);

      doc.setFont('helvetica', 'bold');
      setColorText(item.isOverdue || item.priority === 'urgent' ? COLOR.DANGER : COLOR.WARNING);
      doc.text(
        sanitizePdfText(`${item.priorityLabel} · ${item.slaLabel}`).slice(0, 22),
        M + 105,
        y + 4.3
      );

      doc.setFont('helvetica', 'normal');
      setColorText(COLOR.DARK_GREY);
      doc.text(sanitizePdfText(item.technicianName).slice(0, 19), M + 142, y + 4.3);
      doc.text(sanitizePdfText(item.ageLabel), M + CW - 2.5, y + 4.3, { align: 'right' });

      y += rowH;
    });

    y += 6;
  }

  // ─── 5. BLOQUES OPERATIVOS ESPECIALIZADOS ─────────────────────────────────
  // 5.1 Instalaciones y Productos a Instalar
  const inst = analytics.installationsSummary;
  if (inst.total > 0) {
    addSectionTitle(`Instalaciones y Productos a Instalar (${inst.total})`);

    const instCardW = (CW - 9) / 4;
    const instCardH = 16;
    ensureSpace(instCardH + 6);

    const instCards = [
      { label: 'INSTALACIONES', val: String(inst.total), sub: `${inst.open} ab. · ${inst.completed} cer.` },
      { label: 'FECHAS ACORDADAS', val: `${inst.scheduled} citadas`, sub: `${inst.unscheduled} sin fecha` },
      {
        label: 'COTEJO MERCANCÍA',
        val: `${inst.merchandiseCheckedPct}%`,
        sub: `${inst.merchandiseChecked}/${inst.total} realizados`,
      },
      {
        label: 'PARTE FÍSICO / PROD.',
        val: `${inst.totalProductUnits} ud.`,
        sub: `Parte físico: ${inst.physicalOrderPct}%`,
      },
    ];

    instCards.forEach((c, idx) => {
      const ix = M + idx * (instCardW + 3);
      setColorFill(COLOR.OFF_WHITE);
      setColorDraw(COLOR.BORDER);
      doc.setLineWidth(0.22);
      doc.roundedRect(ix, y, instCardW, instCardH, 1, 1, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.4);
      setColorText(COLOR.PETROL);
      doc.text(sanitizePdfText(c.label), ix + 2.5, y + 4.8);

      doc.setFontSize(9.5);
      setColorText(COLOR.NAVY);
      doc.text(sanitizePdfText(c.val), ix + 2.5, y + 10);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      setColorText(COLOR.MID_GREY);
      doc.text(sanitizePdfText(c.sub).slice(0, 24), ix + 2.5, y + 14);
    });

    y += instCardH + 4;

    if (inst.products.length > 0) {
      const drawProductsHeader = () => {
        setColorFill(COLOR.NAVY);
        doc.rect(M, y, CW, 6.8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.6);
        setColorText(COLOR.WHITE);
        doc.text('PRODUCTO A INSTALAR', M + 3, y + 4.6);
        doc.text('INSTALACIONES', M + 145, y + 4.6, { align: 'right' });
        doc.text('UNIDADES', M + CW - 3, y + 4.6, { align: 'right' });
        y += 6.8;
      };

      ensureSpace(18);
      drawProductsHeader();

      inst.products.forEach((p, idx) => {
        const rowH = 6;
        if (y + rowH > MAX_Y) {
          addContinuationPage();
          drawProductsHeader();
        }
        setColorFill(idx % 2 === 0 ? COLOR.WHITE : COLOR.OFF_WHITE);
        setColorDraw(COLOR.BORDER);
        doc.setLineWidth(0.2);
        doc.rect(M, y, CW, rowH, 'FD');

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.8);
        setColorText(COLOR.CHARCOAL);
        doc.text(sanitizePdfText(p.name).slice(0, 62), M + 3, y + 4.2);

        setColorText(COLOR.DARK_GREY);
        doc.text(String(p.taskCount), M + 145, y + 4.2, { align: 'right' });

        doc.setFont('helvetica', 'bold');
        setColorText(COLOR.NAVY);
        doc.text(String(p.qty), M + CW - 3, y + 4.2, { align: 'right' });

        y += rowH;
      });
    }

    y += 6;
  }

  // 5.2 Repuestos Más Consumidos (con Coste Estimado en variante interna)
  if (analytics.consumedParts.length > 0) {
    addSectionTitle('Repuestos y Materiales Más Consumidos');

    const showCost = variant === 'internal' && analytics.kpis.hasEstimatedCost;
    const maxQty = Math.max(1, ...analytics.consumedParts.map((p) => p.qty));

    const drawPartsHeader = () => {
      setColorFill(COLOR.NAVY);
      doc.rect(M, y, CW, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.6);
      setColorText(COLOR.WHITE);
      doc.text('MATERIAL / REPUESTO', M + 3, y + 4.7);
      doc.text('REF.', M + 96, y + 4.7);
      doc.text('PARTES', showCost ? M + 132 : M + 150, y + 4.7, { align: 'right' });
      doc.text('UNID.', showCost ? M + 152 : M + CW - 3, y + 4.7, { align: 'right' });
      if (showCost) {
        doc.text('COSTE EST.', M + CW - 3, y + 4.7, { align: 'right' });
      }
      y += 7;
    };

    ensureSpace(20);
    drawPartsHeader();

    analytics.consumedParts.forEach((part, idx) => {
      const rowH = 6.2;
      if (y + rowH > MAX_Y) {
        addContinuationPage();
        drawPartsHeader();
      }
      setColorFill(idx % 2 === 0 ? COLOR.WHITE : COLOR.OFF_WHITE);
      setColorDraw(COLOR.BORDER);
      doc.setLineWidth(0.2);
      doc.rect(M, y, CW, rowH, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.7);
      setColorText(COLOR.CHARCOAL);
      doc.text(sanitizePdfText(part.name).slice(0, 42), M + 3, y + 4.3);

      // Pequeña barra de proporción bajo referencia si hay espacio
      const barW = Math.max(2, (part.qty / maxQty) * 14);
      setColorFill(COLOR.PETROL);
      doc.rect(M + 78, y + 2.2, barW, 1.8, 'F');

      setColorText(COLOR.DARK_GREY);
      doc.text(sanitizePdfText(part.ref || '—').slice(0, 14), M + 96, y + 4.3);
      doc.text(String(part.taskCount), showCost ? M + 132 : M + 150, y + 4.3, {
        align: 'right',
      });

      doc.setFont('helvetica', 'bold');
      setColorText(COLOR.NAVY);
      doc.text(String(part.qty), showCost ? M + 152 : M + CW - 3, y + 4.3, {
        align: 'right',
      });

      if (showCost) {
        setColorText(COLOR.CHARCOAL);
        doc.text(
          part.estimatedCost !== null ? formatCurrencyEur(part.estimatedCost) : '—',
          M + CW - 3,
          y + 4.3,
          { align: 'right' }
        );
      }

      y += rowH;
    });

    ensureSpace(8);
    setColorFill(COLOR.SOFT_NAVY);
    setColorDraw(COLOR.BORDER);
    doc.rect(M, y, CW, 6.8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    setColorText(COLOR.NAVY);
    doc.text(
      `Total: ${analytics.consumedParts.length} referencia(s) listada(s)`,
      M + 3,
      y + 4.6
    );
    doc.text(`${kpis.totalMaterialUnits} ud.`, showCost ? M + 152 : M + CW - 3, y + 4.6, {
      align: 'right',
    });
    if (showCost) {
      doc.text(
        formatCurrencyEur(kpis.totalEstimatedPartsCost),
        M + CW - 3,
        y + 4.6,
        { align: 'right' }
      );
    }

    y += 11;
  }

  // 5.3 Rendimiento por Técnico (SOLO INTERNO)
  if (variant === 'internal' && analytics.techStats.length > 0) {
    addSectionTitle('Rendimiento por Técnico');

    const drawTechHeader = () => {
      setColorFill(COLOR.NAVY);
      doc.rect(M, y, CW, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.6);
      setColorText(COLOR.WHITE);
      doc.text('TÉCNICO', M + 3, y + 4.7);
      doc.text('TOTALES', M + 92, y + 4.7, { align: 'right' });
      doc.text('ABIERTOS', M + 114, y + 4.7, { align: 'right' });
      doc.text('CERRADOS', M + 136, y + 4.7, { align: 'right' });
      doc.text('TASA CIERRE', M + 162, y + 4.7, { align: 'right' });
      doc.text('MEDIA', M + CW - 3, y + 4.7, { align: 'right' });
      y += 7;
    };

    ensureSpace(18);
    drawTechHeader();

    analytics.techStats.forEach((row, idx) => {
      const rowH = 6.2;
      if (y + rowH > MAX_Y) {
        addContinuationPage();
        drawTechHeader();
      }
      setColorFill(idx % 2 === 0 ? COLOR.WHITE : COLOR.OFF_WHITE);
      setColorDraw(COLOR.BORDER);
      doc.setLineWidth(0.2);
      doc.rect(M, y, CW, rowH, 'FD');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      setColorText(COLOR.CHARCOAL);
      doc.text(sanitizePdfText(row.name).slice(0, 36), M + 3, y + 4.3);

      doc.setFont('helvetica', 'normal');
      doc.text(String(row.total), M + 92, y + 4.3, { align: 'right' });
      doc.text(String(row.open), M + 114, y + 4.3, { align: 'right' });
      setColorText(COLOR.SUCCESS);
      doc.text(String(row.completed), M + 136, y + 4.3, { align: 'right' });

      // Mini barra de tasa
      const rateBarW = Math.max(1.2, (row.rate / 100) * 14);
      setColorFill(COLOR.OFF_WHITE);
      doc.rect(M + 140, y + 2.2, 14, 1.8, 'F');
      setColorFill(row.rate >= 70 ? COLOR.SUCCESS : COLOR.PETROL);
      doc.rect(M + 140, y + 2.2, rateBarW, 1.8, 'F');

      doc.setFont('helvetica', 'bold');
      setColorText(COLOR.NAVY);
      doc.text(`${row.rate}%`, M + 162, y + 4.3, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      setColorText(COLOR.DARK_GREY);
      doc.text(row.avgHours === '—' ? '—' : `${row.avgHours} h`, M + CW - 3, y + 4.3, {
        align: 'right',
      });

      y += rowH;
    });

    y += 6;
  }

  // 5.4 Volumen por Cliente (Top 10, SOLO INTERNO y si no está filtrado a 1 cliente)
  if (
    variant === 'internal' &&
    !input.filters.isSingleCustomer &&
    analytics.topCustomers.length > 0
  ) {
    addSectionTitle('Volumen por Cliente (Top 10)');

    const maxCust = Math.max(1, ...analytics.topCustomers.map((c) => c.total));

    const drawCustHeader = () => {
      setColorFill(COLOR.NAVY);
      doc.rect(M, y, CW, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.6);
      setColorText(COLOR.WHITE);
      doc.text('CLIENTE', M + 3, y + 4.7);
      doc.text('TOTAL', M + 124, y + 4.7, { align: 'right' });
      doc.text('ABIERTOS', M + 145, y + 4.7, { align: 'right' });
      doc.text('CERRADOS', M + 166, y + 4.7, { align: 'right' });
      doc.text('%', M + CW - 3, y + 4.7, { align: 'right' });
      y += 7;
    };

    ensureSpace(18);
    drawCustHeader();

    analytics.topCustomers.forEach((row, idx) => {
      const rowH = 6.2;
      if (y + rowH > MAX_Y) {
        addContinuationPage();
        drawCustHeader();
      }
      setColorFill(idx % 2 === 0 ? COLOR.WHITE : COLOR.OFF_WHITE);
      setColorDraw(COLOR.BORDER);
      doc.setLineWidth(0.2);
      doc.rect(M, y, CW, rowH, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.8);
      setColorText(COLOR.CHARCOAL);
      doc.text(sanitizePdfText(row.name).slice(0, 44), M + 3, y + 4.3);

      const barW = Math.max(1.5, (row.total / maxCust) * 18);
      setColorFill(COLOR.PETROL);
      doc.rect(M + 94, y + 2.2, barW, 1.8, 'F');

      doc.setFont('helvetica', 'bold');
      setColorText(COLOR.NAVY);
      doc.text(String(row.total), M + 124, y + 4.3, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      setColorText(row.open > 0 ? COLOR.WARNING : COLOR.MID_GREY);
      doc.text(String(row.open), M + 145, y + 4.3, { align: 'right' });

      setColorText(COLOR.SUCCESS);
      doc.text(String(row.closed), M + 166, y + 4.3, { align: 'right' });

      setColorText(COLOR.DARK_GREY);
      doc.text(`${row.pct}%`, M + CW - 3, y + 4.3, { align: 'right' });

      y += rowH;
    });

    y += 6;
  }

  // ─── 6. ANEXO: LISTADO DETALLADO DE PARTES (HASTA 100) ────────────────────
  if (input.tasks.length > 0) {
    const shownCount = Math.min(100, input.tasks.length);
    addSectionTitle(`Anexo: Listado Detallado de Partes (${shownCount} de ${input.tasks.length})`);

    const hideCustCol = variant === 'client' && Boolean(input.filters.isSingleCustomer);

    const drawTasksHeader = () => {
      setColorFill(COLOR.NAVY);
      doc.rect(M, y, CW, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.2);
      setColorText(COLOR.WHITE);
      doc.text('CÓDIGO', M + 2, y + 4.7);
      doc.text('TIPO', M + 25, y + 4.7);
      doc.text(hideCustCol ? 'EQUIPO / ACTUACIÓN' : 'CLIENTE', M + 40, y + 4.7);
      doc.text('ESTADO', M + 96, y + 4.7);
      doc.text('PRIOR.', M + 119, y + 4.7);
      doc.text('TÉCNICO', M + 136, y + 4.7);
      doc.text('APERTURA', M + 166, y + 4.7, { align: 'right' });
      doc.text('DUR.', M + CW - 2, y + 4.7, { align: 'right' });
      y += 7;
    };

    ensureSpace(18);
    drawTasksHeader();

    input.tasks.slice(0, 100).forEach((t, idx) => {
      const rowH = 5.8;
      if (y + rowH > MAX_Y) {
        addContinuationPage();
        drawTasksHeader();
      }
      setColorFill(idx % 2 === 0 ? COLOR.WHITE : COLOR.OFF_WHITE);
      setColorDraw(COLOR.BORDER);
      doc.setLineWidth(0.18);
      doc.rect(M, y, CW, rowH, 'FD');

      const tt = resolveTaskType(t);
      const st = normalizeTaskStatus(t.status);
      const stColor =
        st === 'completed'
          ? COLOR.SUCCESS
          : st === 'in_progress'
          ? COLOR.INFO
          : st === 'cancelled'
          ? COLOR.MID_GREY
          : COLOR.WARNING;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      setColorText(COLOR.NAVY);
      doc.text(sanitizePdfText(t.code), M + 2, y + 4.1);

      doc.setFont('helvetica', 'normal');
      setColorText(COLOR.DARK_GREY);
      doc.text(sanitizePdfText(TASK_TYPE_META[tt].shortLabel), M + 25, y + 4.1);

      setColorText(COLOR.CHARCOAL);
      const thirdCol = hideCustCol
        ? t.equipment_ref || t.problem_desc || 'Servicio'
        : t.customer?.name || 'Cliente';
      doc.text(sanitizePdfText(thirdCol).slice(0, 28), M + 40, y + 4.1);

      doc.setFont('helvetica', 'bold');
      setColorText(stColor);
      doc.text(sanitizePdfText(getTaskStatusLabel(t.status)).slice(0, 12), M + 96, y + 4.1);

      doc.setFont('helvetica', 'normal');
      setColorText(
        t.priority === 'urgent'
          ? COLOR.DANGER
          : t.priority === 'high'
          ? COLOR.WARNING
          : COLOR.DARK_GREY
      );
      doc.text(sanitizePdfText(TASK_PRIORITY_META[t.priority].label), M + 119, y + 4.1);

      setColorText(COLOR.DARK_GREY);
      doc.text(
        sanitizePdfText(t.assignee?.full_name || 'Sin asignar').slice(0, 14),
        M + 136,
        y + 4.1
      );

      doc.text(
        new Date(t.created_at).toLocaleDateString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: '2-digit',
        }),
        M + 166,
        y + 4.1,
        { align: 'right' }
      );

      const dur = formatDurationLabel(t.created_at, t.completed_at);
      doc.text(sanitizePdfText(dur).slice(0, 10), M + CW - 2, y + 4.1, { align: 'right' });

      y += rowH;
    });

    if (input.tasks.length > 100) {
      y += 4;
      ensureSpace(8);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      setColorText(COLOR.MID_GREY);
      doc.text(
        sanitizePdfText(
          `Nota: se muestran los primeros 100 partes de ${input.tasks.length}. Usa "CSV Completo" para exportar todo el histórico.`
        ),
        M,
        y
      );
    }
  }

  // ─── PIE CORPORATIVO EN TODAS LAS PÁGINAS ─────────────────────────────────
  const pageCount = doc.getNumberOfPages();
  const editionFooter = variant === 'client' ? 'Copia Cliente' : 'Uso Interno SAT';
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    setColorDraw(COLOR.BORDER);
    doc.setLineWidth(0.25);
    doc.line(M, 284, pageWidth - M, 284);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    setColorText(COLOR.MID_GREY);
    doc.text(
      sanitizePdfText(`VistaSatPRO · Informe Operativo SAT · ${editionFooter}`),
      M,
      289
    );
    doc.setFont('helvetica', 'bold');
    doc.text(`Página ${i} de ${pageCount}`, pageWidth - M, 289, { align: 'right' });
  }

  return doc.output('blob');
}

/**
 * Carga el logotipo corporativo, genera el PDF del informe y lanza su descarga directa.
 */
export async function downloadReportPDF(input: ReportPdfInput): Promise<void> {
  const logoDataUrl =
    input.logoDataUrl !== undefined
      ? input.logoDataUrl
      : await urlToDataUrlSafe('/icons/icon-192.png');

  const blob = generateReportPDF({ ...input, logoDataUrl });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildReportPdfFilename(input);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
