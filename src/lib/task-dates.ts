import type { Task } from '@/types/database';

/**
 * Formatea una fecha ISO mostrando día de la semana, fecha completa y hora (24h).
 * Ej.: "Sábado, 28/11/2026 · 01:18"
 */
export function formatFullDayDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';

  const weekday = date.toLocaleDateString('es-ES', { weekday: 'long' });
  const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
  const datePart = date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const timePart = date.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${capitalizedWeekday}, ${datePart} · ${timePart}`;
}

/**
 * Convierte un ISO string a formato `YYYY-MM-DD` en fecha local para `<input type="date">`.
 */
export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Convierte un valor `YYYY-MM-DD` de `<input type="date">` a ISO UTC al mediodía
 * para evitar desplazamientos de día por zona horaria.
 */
export function dateInputToIso(dateStr: string): string | null {
  const clean = dateStr.trim();
  if (!clean) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) return null;
  const iso = `${clean}T12:00:00.000Z`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}

/**
 * Formatea únicamente la fecha en español (sin hora).
 */
export function formatDateOnlyEs(
  iso: string | null | undefined,
  style: 'full' | 'medium' | 'short' = 'medium'
): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('es-ES', { dateStyle: style });
}

/**
 * Obtiene la fecha efectiva de cierre del parte si está completado.
 */
export function getEffectiveClosedAt(
  task: Pick<Task, 'status' | 'completed_at' | 'updated_at'>
): string | null {
  if (task.completed_at) return task.completed_at;
  if (task.status === 'completed') return task.updated_at || null;
  return null;
}

/**
 * Calcula los días y horas transcurridos entre apertura y cierre (o momento actual).
 */
export function calculateElapsedDaysAndHours(
  startIso: string,
  endIso?: string | null,
  nowMs?: number
): { days: number; hours: number; minutes: number; formatted: string } {
  const startMs = Date.parse(startIso);
  const resolvedEndMs = endIso ? Date.parse(endIso) : nowMs ?? Date.now();
  if (!Number.isFinite(startMs) || !Number.isFinite(resolvedEndMs) || resolvedEndMs <= startMs) {
    return { days: 0, hours: 0, minutes: 0, formatted: '0 días, 0 horas' };
  }

  const totalMinutes = Math.floor((resolvedEndMs - startMs) / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  const dayLabel = days === 1 ? '1 día' : `${days} días`;
  const hourLabel = hours === 1 ? '1 hora' : `${hours} horas`;

  const formatted =
    days === 0 && hours === 0 && minutes > 0
      ? `0 días, 0 horas (${minutes} min)`
      : `${dayLabel}, ${hourLabel}`;

  return { days, hours, minutes, formatted };
}
