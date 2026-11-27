import { describe, expect, it } from 'vitest';
import {
  evaluateUserNotificationDelivery,
  getDefaultNotificationPreferences,
} from '@/lib/notification-preferences';

describe('notification-preferences', () => {
  it('mantiene Push e In-App activos por defecto en los 7 eventos', () => {
    const prefs = getDefaultNotificationPreferences('technician', 'assigned_or_created');
    expect(prefs.in_app_enabled).toBe(true);
    expect(prefs.push_enabled).toBe(true);
    for (const toggle of Object.values(prefs.events)) {
      expect(toggle.in_app).toBe(true);
      expect(toggle.push).toBe(true);
    }
  });

  it('nunca autonotifica al actor ni notifica a usuarios desactivados', () => {
    const recipient = {
      id: 'user-1',
      role: 'admin' as const,
      is_active: true,
      notification_level: 'all' as const,
      notification_preferences: getDefaultNotificationPreferences('admin', 'all'),
    };

    const selfDecision = evaluateUserNotificationDelivery({
      recipient,
      actorId: 'user-1',
      task: {
        assigned_to: 'user-1',
        created_by: 'user-1',
        priority: 'urgent',
        task_type: 'rma_incident',
      },
      eventType: 'status_changed',
    });
    expect(selfDecision).toEqual({ inApp: false, push: false });

    const inactiveDecision = evaluateUserNotificationDelivery({
      recipient: { ...recipient, is_active: false },
      actorId: 'user-2',
      task: {
        assigned_to: 'user-1',
        created_by: 'user-2',
        priority: 'urgent',
        task_type: 'rma_incident',
      },
      eventType: 'status_changed',
    });
    expect(inactiveDecision).toEqual({ inApp: false, push: false });
  });

  it('respeta horas silenciosas salvo excepción urgente', () => {
    const prefs = getDefaultNotificationPreferences('coordinator', 'all');
    prefs.quiet_hours = {
      enabled: true,
      start: '22:00',
      end: '07:00',
      allow_urgent_override: true,
    };
    const recipient = {
      id: 'coord-1',
      role: 'coordinator' as const,
      is_active: true,
      notification_level: 'all' as const,
      notification_preferences: prefs,
    };

    // 02:30 CET/Madrid -> 01:30 UTC en invierno
    const nightDate = new Date('2026-11-28T01:30:00.000Z');

    const mediumAtNight = evaluateUserNotificationDelivery({
      recipient,
      actorId: 'tech-1',
      task: {
        assigned_to: 'tech-1',
        created_by: 'coord-1',
        priority: 'medium',
        task_type: 'rma_incident',
      },
      eventType: 'comment_added',
      now: nightDate,
    });
    expect(mediumAtNight).toEqual({ inApp: true, push: false });

    const urgentAtNight = evaluateUserNotificationDelivery({
      recipient,
      actorId: 'tech-1',
      task: {
        assigned_to: 'tech-1',
        created_by: 'coord-1',
        priority: 'urgent',
        task_type: 'rma_incident',
      },
      eventType: 'comment_added',
      now: nightDate,
    });
    expect(urgentAtNight).toEqual({ inApp: true, push: true });
  });
});
