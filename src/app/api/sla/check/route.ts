import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { captureMonitoringError } from '@/lib/monitoring';
import { timingSafeEqualSecret } from '@/lib/server-security';
import { evaluateUserNotificationDelivery } from '@/lib/notification-preferences';
import { sendWebPushBatch } from '@/lib/web-push-sender';
import type { Profile, TaskPriority, TaskType } from '@/types/database';

export const dynamic = 'force-dynamic';

/**
 * GET / POST /api/sla/check
 * Comprueba partes activos con fecha límite (`due_date`) que vencen hoy o ya están vencidos
 * y notifica una vez al día al técnico asignado vía in-app + Web Push en paralelo.
 * Protegido de forma obligatoria (fail-closed) mediante `CRON_SECRET` o `INTERNAL_WEBHOOK_SECRET`.
 */
async function runSlaCheck(request: Request) {
  try {
    const expectedSecret = process.env.CRON_SECRET || process.env.INTERNAL_WEBHOOK_SECRET;
    if (!expectedSecret) {
      if (process.env.NODE_ENV === 'production' || isSupabaseConfigured()) {
        return NextResponse.json(
          { error: 'CRON_SECRET / INTERNAL_WEBHOOK_SECRET no configurado en el servidor.' },
          { status: 503 }
        );
      }
    } else {
      const provided =
        request.headers.get('x-webhook-secret') ||
        request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
        '';
      if (!provided || !timingSafeEqualSecret(provided, expectedSecret)) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
      }
    }

    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseAdmin) {
      return NextResponse.json({ ok: true, mode: 'demo', notified: 0 });
    }

    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);

    const { data: tasks, error } = await supabaseAdmin
      .from('tasks')
      .select('id, code, due_date, assigned_to, created_by, status, priority, task_type, customer:customers(name)')
      .is('deleted_at', null)
      .not('due_date', 'is', null)
      .not('assigned_to', 'is', null)
      .not('status', 'in', '("completed","cancelled")')
      .lte('due_date', endOfDay.toISOString());

    if (error) {
      throw new Error(error.message);
    }

    const { data: activeProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id, role, is_active, notification_level, notification_preferences')
      .eq('is_active', true);

    const typedProfiles = (activeProfiles || []) as Array<
      Pick<
        Profile,
        'id' | 'role' | 'is_active' | 'notification_level' | 'notification_preferences'
      >
    >;

    // Obtener en 1 consulta las alertas SLA ya enviadas hoy para evitar N+1
    const { data: sentTodayRows } = await supabaseAdmin
      .from('notifications')
      .select('recipient_id, task_id')
      .gte('created_at', startOfDay.toISOString())
      .ilike('title', '%SLA%');

    const sentTodayKeys = new Set(
      (sentTodayRows || []).map((r) => `${r.recipient_id}:${r.task_id}`)
    );

    let notified = 0;
    let pushCount = 0;
    const inAppBatch: Array<Record<string, unknown>> = [];

    for (const t of tasks || []) {
      if (!t.due_date) continue;

      const due = new Date(t.due_date);
      const isOverdue = due.getTime() < now.getTime();
      const customerName =
        (t.customer as { name?: string } | null)?.name || 'Cliente';

      const title = isOverdue
        ? `Alerta SLA Vencido: ${t.code}`
        : `Recordatorio SLA Hoy: ${t.code}`;
      const body = isOverdue
        ? `${customerName} — El plazo venció el ${due.toLocaleString('es-ES', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}.`
        : `${customerName} — El parte vence hoy a las ${due.toLocaleTimeString('es-ES', {
            hour: '2-digit',
            minute: '2-digit',
          })}.`;

      const pushUserIdsForTask: string[] = [];
      const inAppCandidatesForTask: string[] = [];

      for (const candidate of typedProfiles) {
        if (sentTodayKeys.has(`${candidate.id}:${t.id}`)) continue;

        const decision = evaluateUserNotificationDelivery({
          recipient: candidate,
          actorId: 'system-sla-cron',
          task: {
            assigned_to: t.assigned_to,
            created_by: t.created_by,
            priority: (t.priority || 'medium') as TaskPriority,
            task_type: ((t as { task_type?: string }).task_type ||
              'rma_incident') as TaskType,
          },
          eventType: 'sla_alert',
          now,
        });

        if (!decision.inApp && !decision.push) continue;

        sentTodayKeys.add(`${candidate.id}:${t.id}`);
        if (decision.push) pushUserIdsForTask.push(candidate.id);
        if (decision.inApp) inAppCandidatesForTask.push(candidate.id);
      }

      const pushRes = await sendWebPushBatch({
        supabaseAdmin,
        userIds: pushUserIdsForTask,
        payload: { title, body, taskId: t.id, type: 'sla_alert' },
        scope: 'sla_alert',
        route: '/api/sla/check',
      });
      pushCount += pushRes.pushCount;

      for (const recipientId of inAppCandidatesForTask) {
        const fallbackActor =
          recipientId !== t.created_by
            ? t.created_by
            : t.assigned_to && t.assigned_to !== recipientId
            ? t.assigned_to
            : typedProfiles.find((p) => p.id !== recipientId)?.id || t.created_by;

        if (fallbackActor !== recipientId) {
          inAppBatch.push({
            recipient_id: recipientId,
            actor_id: fallbackActor,
            task_id: t.id,
            type: 'sla_alert',
            title,
            body,
            push_sent: pushRes.pushedUserIds.has(recipientId),
          });
        }
      }
    }

    if (inAppBatch.length > 0) {
      const { error: insErr } = await supabaseAdmin.from('notifications').insert(inAppBatch);
      if (!insErr) {
        notified = inAppBatch.length;
      } else {
        captureMonitoringError(insErr, { route: '/api/sla/check', scope: 'batch_insert' });
      }
    }

    return NextResponse.json({ ok: true, checked: tasks?.length || 0, notified, pushCount });
  } catch (error) {
    captureMonitoringError(error, { route: '/api/sla/check' });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error comprobando SLA' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  return runSlaCheck(request);
}

export async function POST(request: Request) {
  return runSlaCheck(request);
}
