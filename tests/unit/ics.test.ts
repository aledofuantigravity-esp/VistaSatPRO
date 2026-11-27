import { describe, expect, it } from 'vitest';
import {
  detectInstallationConflicts,
  escapeIcsText,
  generateInstallationIcs,
} from '@/lib/ics';
import type { Task } from '@/types/database';

function makeInstall(overrides: Partial<Task> = {}): Task {
  return {
    id: 'inst-1',
    code: 'VS-2026-0099',
    task_type: 'installation',
    customer_id: 'cust-1',
    site_contact_name: 'Carlos',
    site_contact_phone: '600111222',
    site_address: 'Calle Mayor, 10',
    site_city: 'Madrid',
    equipment_ref: 'Ricoh IM C3500',
    equipment_sn: null,
    problem_desc: 'Instalación completa, línea 2',
    priority: 'medium',
    status: 'pending',
    assigned_to: 'tech-1',
    assigned_at: null,
    resolution_notes: null,
    materials_used: [],
    client_signature_url: null,
    signer_name: null,
    pdf_url: null,
    completed_at: null,
    estimated_duration: 120,
    scheduled_date: '2026-12-10T09:00:00.000Z',
    created_by: 'coord-1',
    created_at: '2026-11-25T10:00:00.000Z',
    updated_at: '2026-11-25T10:00:00.000Z',
    customer: {
      id: 'cust-1',
      name: 'Clínica Norte',
      tax_id: null,
      address: null,
      city: 'Madrid',
      postal_code: null,
      country: 'ES',
      contact_name: null,
      contact_phone: null,
      contact_email: null,
      notes: null,
      is_active: true,
      created_by: null,
      created_at: '2026-11-01T10:00:00.000Z',
      updated_at: '2026-11-01T10:00:00.000Z',
    },
    ...overrides,
  };
}

describe('ics & conflict detection', () => {
  it('genera un evento iCalendar RFC 5545 válido escapando comas y saltos', () => {
    expect(escapeIcsText('A, B; C\nD')).toBe('A\\, B\\; C\\nD');
    const ics = generateInstallationIcs(makeInstall());
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('SUMMARY:Instalación VS-2026-0099 — Clínica Norte');
    expect(ics).toContain('DTSTART:20261210T090000Z');
    expect(ics).toContain('DTEND:20261210T110000Z');
    expect(ics).toContain('END:VCALENDAR');
  });

  it('detecta solapamientos únicamente para el mismo técnico', () => {
    const a = makeInstall({
      id: 'a',
      code: 'A',
      assigned_to: 'tech-1',
      scheduled_date: '2026-12-10T09:00:00.000Z',
      estimated_duration: 120,
    });
    const b = makeInstall({
      id: 'b',
      code: 'B',
      assigned_to: 'tech-1',
      scheduled_date: '2026-12-10T10:00:00.000Z', // Solapa con A (09:00-11:00)
      estimated_duration: 90,
    });
    const c = makeInstall({
      id: 'c',
      code: 'C',
      assigned_to: 'tech-2', // Técnico distinto, no hay conflicto
      scheduled_date: '2026-12-10T09:30:00.000Z',
    });

    const conflicts = detectInstallationConflicts([a, b, c]);
    expect(conflicts.has('a')).toBe(true);
    expect(conflicts.has('b')).toBe(true);
    expect(conflicts.has('c')).toBe(false);
  });
});
