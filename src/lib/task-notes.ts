import {
  resolveTaskType,
  type Task,
  type TaskHistoryItem,
  type TaskType,
} from '@/types/database';

export interface TechnicalNoteEntry {
  id: string;
  text: string;
  authorName: string;
  createdAt: string;
  pendingSync?: boolean;
  legacy?: boolean;
}

/**
 * Extrae todas las notas técnicas e incidencias del historial de un parte,
 * combinadas con notas pendientes offline y respaldo legacy, ordenadas siempre
 * desde la más reciente arriba hasta la primera abajo.
 */
export function extractTechnicalNotes(
  task: Task,
  history: TaskHistoryItem[],
  pendingOfflineNotes: TechnicalNoteEntry[] = []
): TechnicalNoteEntry[] {
  const fromHistory: TechnicalNoteEntry[] = history
    .filter((item) => item.event_type === 'note_added' && Boolean(item.note?.trim()))
    .map((item) => ({
      id: item.id,
      text: item.note!.trim(),
      authorName: item.actor?.full_name || 'Usuario',
      createdAt: item.created_at,
    }));

  const entries: TechnicalNoteEntry[] = [...fromHistory];

  // Respaldo para partes antiguos que solo tuvieran resolution_notes sin registro en historial
  if (fromHistory.length === 0 && task.resolution_notes?.trim()) {
    entries.push({
      id: `legacy-note-${task.id}`,
      text: task.resolution_notes.trim(),
      authorName: task.assignee?.full_name || task.creator?.full_name || 'Técnico',
      createdAt: task.updated_at || task.created_at,
      legacy: true,
    });
  }

  for (const offline of pendingOfflineNotes) {
    if (offline.text.trim()) {
      entries.push({ ...offline, text: offline.text.trim(), pendingSync: true });
    }
  }

  return entries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/**
 * Determina si el tipo de parte exige indicar una resolución antes de cerrarlo.
 * Obligatorio en RMA, CXC y Tareas; no aplica en Instalaciones.
 */
export function isResolutionRequiredForClosure(taskType: TaskType): boolean {
  return taskType !== 'installation';
}

/**
 * Valida las reglas obligatorias previas al cierre (Completada) de un parte.
 * Devuelve el mensaje de error en español si falta algún requisito, o null si es válido.
 */
export function validateTaskClosureRequirements(
  task: Task,
  draftResolution?: string
): string | null {
  const taskType = resolveTaskType(task);
  if (taskType === 'cxc_incident' && !task.equipment_sn?.trim()) {
    return 'Para cerrar una Incidencia CXC es obligatorio introducir y guardar primero el Nº de Serie.';
  }

  const effectiveResolution =
    draftResolution !== undefined ? draftResolution : task.resolution || '';
  if (isResolutionRequiredForClosure(taskType) && !effectiveResolution.trim()) {
    return 'Para cerrar este parte es obligatorio indicar la resolución del problema.';
  }

  return null;
}

/**
 * Obtiene el autor y la fecha/hora de la última actualización registrada del campo resolución.
 */
export function getLastResolutionAudit(
  task: Task,
  history: TaskHistoryItem[]
): { authorName: string; updatedAt: string } | null {
  const latestEvent = [...history]
    .filter((item) => item.field_name === 'resolution')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  if (latestEvent) {
    return {
      authorName: latestEvent.actor?.full_name || 'Usuario',
      updatedAt: latestEvent.created_at,
    };
  }

  if (task.resolution_updated_at) {
    return {
      authorName:
        task.resolution_updater?.full_name ||
        task.assignee?.full_name ||
        task.creator?.full_name ||
        'Usuario',
      updatedAt: task.resolution_updated_at,
    };
  }

  return null;
}
