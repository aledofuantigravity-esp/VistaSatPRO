import { isOpenTask } from '@/lib/dashboard-helpers';
import { resolveTaskType, type Task } from '@/types/database';

/**
 * Formatea una fecha en formato UTC estándar iCalendar (YYYYMMDDTHHMMSSZ).
 */
export function formatIcsUtcDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    date.getUTCFullYear().toString() +
    pad(date.getUTCMonth() + 1) +
    pad(date.getUTCDate()) +
    'T' +
    pad(date.getUTCHours()) +
    pad(date.getUTCMinutes()) +
    pad(date.getUTCSeconds()) +
    'Z'
  );
}

/**
 * Escapa caracteres especiales conforme a RFC 5545 para campos TEXT en archivos .ics.
 */
export function escapeIcsText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/**
 * Genera el contenido iCalendar (.ics) para una instalación con fecha acordada.
 */
export function generateInstallationIcs(task: Task): string {
  const start = task.scheduled_date ? new Date(task.scheduled_date) : new Date(task.created_at);
  const safeStart = Number.isNaN(start.getTime()) ? new Date() : start;
  const durationMinutes =
    task.estimated_duration && task.estimated_duration > 0 ? task.estimated_duration : 120;
  const end = new Date(safeStart.getTime() + durationMinutes * 60_000);

  const customerName = task.customer?.name || 'Cliente';
  const locationParts = [
    task.site_address || task.customer?.address,
    task.site_city || task.customer?.city,
  ].filter(Boolean);
  const location = locationParts.join(', ');

  const descLines = [
    `Parte: ${task.code}`,
    `Cliente: ${customerName}`,
    task.equipment_ref ? `Equipo: ${task.equipment_ref}` : null,
    task.equipment_sn ? `Nº Serie: ${task.equipment_sn}` : null,
    task.assignee?.full_name ? `Técnico asignado: ${task.assignee.full_name}` : null,
    task.site_contact_name || task.customer?.contact_name
      ? `Contacto: ${task.site_contact_name || task.customer?.contact_name}`
      : null,
    task.site_contact_phone || task.customer?.contact_phone
      ? `Teléfono: ${task.site_contact_phone || task.customer?.contact_phone}`
      : null,
    `Detalle: ${task.problem_desc}`,
  ].filter(Boolean);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VistaSatPRO//Agenda Instalaciones//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${task.id}@vistasatpro`,
    `DTSTAMP:${formatIcsUtcDate(new Date())}`,
    `DTSTART:${formatIcsUtcDate(safeStart)}`,
    `DTEND:${formatIcsUtcDate(end)}`,
    `SUMMARY:${escapeIcsText(`Instalación ${task.code} — ${customerName}`)}`,
    ...(location ? [`LOCATION:${escapeIcsText(location)}`] : []),
    `DESCRIPTION:${escapeIcsText(descLines.join('\n'))}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return lines.join('\r\n');
}

/**
 * Descarga un archivo .ics listo para importar en Google Calendar, Apple Calendar u Outlook.
 */
export function downloadInstallationIcs(task: Task): void {
  const icsContent = generateInstallationIcs(task);
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${task.code}_instalacion.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

/**
 * Detecta solapamientos de horario entre instalaciones abiertas asignadas al mismo técnico.
 * Por defecto asume una duración estimada de 120 minutos si `estimated_duration` no está fijada.
 */
export function detectInstallationConflicts(tasks: Task[]): Map<string, Task[]> {
  const conflicts = new Map<string, Task[]>();

  const candidates = tasks.filter(
    (t) =>
      isOpenTask(t) &&
      resolveTaskType(t) === 'installation' &&
      Boolean(t.scheduled_date) &&
      Boolean(t.assigned_to)
  );

  // Agrupar por técnico asignado
  const byTech = new Map<string, Array<{ task: Task; startMs: number; endMs: number }>>();
  for (const t of candidates) {
    const startMs = new Date(t.scheduled_date!).getTime();
    if (Number.isNaN(startMs)) continue;
    const durMin = t.estimated_duration && t.estimated_duration > 0 ? t.estimated_duration : 120;
    const endMs = startMs + durMin * 60_000;
    const list = byTech.get(t.assigned_to!) || [];
    list.push({ task: t, startMs, endMs });
    byTech.set(t.assigned_to!, list);
  }

  for (const items of byTech.values()) {
    if (items.length < 2) continue;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i];
        const b = items[j];
        if (a.startMs < b.endMs && b.startMs < a.endMs) {
          const prevA = conflicts.get(a.task.id) || [];
          prevA.push(b.task);
          conflicts.set(a.task.id, prevA);

          const prevB = conflicts.get(b.task.id) || [];
          prevB.push(a.task);
          conflicts.set(b.task.id, prevB);
        }
      }
    }
  }

  return conflicts;
}
