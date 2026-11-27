import { describe, expect, it } from 'vitest';
import { getSlaStatus, toDatetimeLocalValue } from '@/lib/sla';

describe('sla', () => {
  it('devuelve null para partes cerrados, cancelados o sin due_date', () => {
    expect(getSlaStatus({ due_date: null, status: 'pending' })).toBeNull();
    expect(
      getSlaStatus({
        due_date: new Date(Date.now() - 3600_000).toISOString(),
        status: 'completed',
      })
    ).toBeNull();
    expect(
      getSlaStatus({
        due_date: new Date(Date.now() - 3600_000).toISOString(),
        status: 'cancelled',
      })
    ).toBeNull();
  });

  it('detecta correctamente estados overdue y upcoming', () => {
    const past = new Date(Date.now() - 2 * 3600_000).toISOString();
    expect(getSlaStatus({ due_date: past, status: 'pending' })?.state).toBe('overdue');

    const futureDays = new Date(Date.now() + 72 * 3600_000).toISOString();
    expect(getSlaStatus({ due_date: futureDays, status: 'in_progress' })?.state).toBe(
      'upcoming'
    );
  });

  it('formatea a datetime-local de forma segura', () => {
    expect(toDatetimeLocalValue(null)).toBe('');
    expect(toDatetimeLocalValue('fecha-invalida')).toBe('');
    const formatted = toDatetimeLocalValue('2026-12-01T14:30:00.000Z');
    expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});
