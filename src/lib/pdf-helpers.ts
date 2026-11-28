import {
  getTaskStatusLabel,
  resolveTaskType,
  TASK_PRIORITY_META,
  type Task,
  type TaskHistoryItem,
  type TaskPriority,
} from '@/types/database';

export type PdfVariant = 'client' | 'internal';

/**
 * Limpia caracteres no soportados por la fuente Helvetica WinAnsi de jsPDF
 * (p. ej. flechas Unicode) conservando acentos, ñ, €, · y signos de puntuación en español.
 */
export function sanitizePdfText(text: string): string {
  return text
    .replace(/→/g, '->')
    .replace(/←/g, '<-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF\u20AC]/g, ' ')
    .trim();
}

/**
 * Genera el nombre de archivo descargable adaptado al tipo de parte y a la variante elegida.
 */
export function buildPdfFilename(task: Task, variant: PdfVariant): string {
  const taskType = resolveTaskType(task);
  const suffix = variant === 'client' ? 'cliente' : 'interno';
  if (taskType === 'installation') return `${task.code}_parte_instalacion_${suffix}.pdf`;
  if (taskType === 'cxc_incident') return `${task.code}_parte_CXC_${suffix}.pdf`;
  if (taskType === 'task') return `${task.code}_parte_tarea_${suffix}.pdf`;
  return `${task.code}_parte_SAT_${suffix}.pdf`;
}

/**
 * Calcula y formatea la duración transcurrida desde apertura hasta cierre (o momento actual).
 */
export function formatDurationLabel(startIso: string, endIso?: string | null): string {
  const startMs = Date.parse(startIso);
  const endMs = endIso ? Date.parse(endIso) : Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    return '0 min';
  }
  const totalMinutes = Math.max(1, Math.round((endMs - startMs) / 60_000));
  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  const remMinutes = totalMinutes % 60;
  if (totalHours < 24) {
    return remMinutes > 0 ? `${totalHours} h ${remMinutes} min` : `${totalHours} h`;
  }
  const days = Math.floor(totalHours / 24);
  const remHours = totalHours % 24;
  return remHours > 0 ? `${days} d ${remHours} h` : `${days} d`;
}

/**
 * Traduce un evento del historial de actuaciones a español legible y seguro para jsPDF.
 */
export function formatHistoryEventForPdf(item: TaskHistoryItem): {
  text: string;
  tone: 'navy' | 'success' | 'warning' | 'danger';
} {
  const tone: 'navy' | 'success' | 'warning' | 'danger' =
    item.event_type === 'deleted'
      ? 'danger'
      : item.event_type === 'restored'
      ? 'success'
      : item.event_type === 'field_updated'
      ? 'warning'
      : 'navy';

  if (item.note?.trim()) {
    return { text: sanitizePdfText(item.note), tone };
  }

  if (item.event_type === 'status_changed') {
    const fromLabel = item.old_value ? getTaskStatusLabel(item.old_value) : '—';
    const toLabel = item.new_value ? getTaskStatusLabel(item.new_value) : '—';
    return {
      text: sanitizePdfText(`Estado: ${fromLabel} -> ${toLabel}`),
      tone,
    };
  }

  if (item.event_type === 'priority_changed') {
    const fromLabel = item.old_value
      ? TASK_PRIORITY_META[item.old_value as TaskPriority]?.label || item.old_value
      : '—';
    const toLabel = item.new_value
      ? TASK_PRIORITY_META[item.new_value as TaskPriority]?.label || item.new_value
      : '—';
    return {
      text: sanitizePdfText(`Prioridad: ${fromLabel} -> ${toLabel}`),
      tone,
    };
  }

  if (item.event_type === 'assigned' || item.event_type === 'reassigned') {
    return {
      text: sanitizePdfText(
        item.new_value
          ? `Asignación actualizada -> ${item.new_value}`
          : 'Asignación actualizada'
      ),
      tone,
    };
  }

  if (item.event_type === 'signature_captured') {
    return {
      text: sanitizePdfText(`Firma digital recogida (${item.new_value || 'Cliente'})`),
      tone: 'success',
    };
  }

  if (item.event_type === 'attachment_added') {
    return {
      text: sanitizePdfText(`Adjunto añadido (${item.new_value || 'archivo'})`),
      tone,
    };
  }

  if (item.event_type === 'pdf_generated') {
    return { text: 'Documento PDF generado', tone };
  }

  if (item.event_type === 'created') {
    return { text: 'Parte de trabajo abierto', tone };
  }

  const fallback = item.old_value || item.new_value
    ? `${item.event_type}: ${item.old_value ?? '—'} -> ${item.new_value ?? '—'}`
    : item.event_type;
  return { text: sanitizePdfText(fallback), tone };
}

/**
 * Obtiene la fecha/hora de la última captura de firma registrada en el historial.
 */
export function getSignatureTimestamp(history: TaskHistoryItem[]): string | null {
  const sigEv = [...history]
    .filter((item) => item.event_type === 'signature_captured')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return sigEv?.created_at || null;
}
