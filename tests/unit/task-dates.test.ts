import { describe, expect, it } from 'vitest';
import {
  calculateElapsedDaysAndHours,
  dateInputToIso,
  formatDateOnlyEs,
  formatFullDayDateTime,
  getEffectiveClosedAt,
  toDateInputValue,
} from '@/lib/task-dates';

describe('task-dates helpers', () => {
  it('formatea día de la semana, fecha y hora en español', () => {
    const out = formatFullDayDateTime('2026-11-28T10:15:00.000Z');
    expect(out).toMatch(/^[A-ZÁÉÍÓÚÑ].*28\/11\/2026 · \d{2}:\d{2}$/);
    expect(formatFullDayDateTime(null)).toBe('—');
    expect(formatFullDayDateTime('invalid-date')).toBe('—');
  });

  it('convierte y formatea solo fecha sin hora para instalaciones', () => {
    expect(dateInputToIso('')).toBeNull();
    expect(dateInputToIso('invalida')).toBeNull();
    expect(dateInputToIso('2027-02-20')).toBe('2027-02-20T12:00:00.000Z');

    expect(toDateInputValue(null)).toBe('');
    expect(toDateInputValue('fecha-mala')).toBe('');
    expect(toDateInputValue('2027-02-20T12:00:00.000Z')).toBe('2027-02-20');

    const onlyDate = formatDateOnlyEs('2027-02-20T12:00:00.000Z', 'full');
    expect(onlyDate).toContain('2027');
    expect(onlyDate).not.toMatch(/\d{1,2}:\d{2}/);
    expect(formatDateOnlyEs(null)).toBe('—');
  });

  it('calcula días y horas exactos entre apertura y cierre', () => {
    expect(
      calculateElapsedDaysAndHours('2026-11-20T09:00:00.000Z', '2026-11-23T14:30:00.000Z')
    ).toEqual({
      days: 3,
      hours: 5,
      minutes: 30,
      formatted: '3 días, 5 horas',
    });

    expect(
      calculateElapsedDaysAndHours('2026-11-20T09:00:00.000Z', '2026-11-21T10:00:00.000Z')
    ).toEqual({
      days: 1,
      hours: 1,
      minutes: 0,
      formatted: '1 día, 1 hora',
    });

    expect(
      calculateElapsedDaysAndHours('2026-11-20T09:00:00.000Z', '2026-11-20T09:22:00.000Z')
    ).toEqual({
      days: 0,
      hours: 0,
      minutes: 22,
      formatted: '0 días, 0 horas (22 min)',
    });
  });

  it('obtiene la fecha efectiva de cierre solo para partes cerrados', () => {
    expect(
      getEffectiveClosedAt({
        status: 'in_progress',
        completed_at: null,
        updated_at: '2026-11-28T01:00:00.000Z',
      })
    ).toBeNull();

    expect(
      getEffectiveClosedAt({
        status: 'completed',
        completed_at: '2026-11-28T02:00:00.000Z',
        updated_at: '2026-11-28T02:05:00.000Z',
      })
    ).toBe('2026-11-28T02:00:00.000Z');

    expect(
      getEffectiveClosedAt({
        status: 'completed',
        completed_at: null,
        updated_at: '2026-11-28T02:05:00.000Z',
      })
    ).toBe('2026-11-28T02:05:00.000Z');
  });
});
