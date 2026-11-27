import { NextResponse } from 'next/server';
import { sendNotification, setVapidDetails } from 'web-push';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { isVapidConfigured } from '@/lib/supabase/config';
import { captureMonitoringError } from '@/lib/monitoring';

export const dynamic = 'force-dynamic';

/**
 * GET / POST /api/sla/check
 * Comprueba partes activos con fecha límite (`due_date`) que vencen hoy o ya están vencidos
 * y notifica una vez al día al técnico asignado vía in-app + Web Push.
 * Protegido mediante `INTERNAL_WEBHOOK_SECRET` o `CRON_SECRET`.
 */
async function runSlaCheck(request: Request) {
  try {
    const expectedSecret = process.env.CRON_SECRET || process.env.INTERNAL_WEBHOOK_SECRET;
    if (expectedSecret) {
      const provided =
        request.headers.get('x-webhook-secret') ||
        request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
      if (provided !== expectedSecret) {
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
      .select('id, code, due_date, assigned_to, created_by, status, customer:customers(name)')
      .is('deleted_at', null)
      .not('due_date', 'is', null)
      .not('assigned_to', 'is', null)
      .not('status', 'in', '("completed","cancelled")')
      .lte('due_date', endOfDay.toISOString());

    if (error) {
      // Si la migración 0004 aún no se aplicó, salir sin error fatal
      if (error.code === '42703') {
        return NextResponse.json({ ok: true, skipped: 'migration_0004_pending', notified: 0 });
      }
      throw new Error(error.message);
    }

    const vapidReady =
      isVapidConfigured() &&
      Boolean(process.env.VAPID_PRIVATE_KEY) &&
      Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

    if (vapidReady) {
      setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:soporte@vistasat.pro',
        process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
        process.env.VAPID_PRIVATE_KEY!
      );
    }

    let notified = 0;
    let pushCount = 0;

    for (const t of tasks || []) {
      if (!t.assigned_to || !t.due_date) continue;

      // Evitar duplicados en el mismo día para el mismo parte y técnico
      const { data: existingToday } = await supabaseAdmin
        .from('notifications')
        .select('id')
        .eq('recipient_id', t.assigned_to)
        .eq('task_id', t.id)
        .gte('created_at', startOfDay.toISOString())
        .ilike('title', '%SLA%')
        .limit(1);

      if (existingToday && existingToday.length > 0) continue;

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

      await supabaseAdmin.from('notifications').insert({
        recipient_id: t.assigned_to,
        actor_id: t.created_by,
        task_id: t.id,
        type: 'priority_changed',
        title,
        body,
        push_sent: vapidReady,
      });
      notified++;

      if (vapidReady) {
        const { data: subs } = await supabaseAdmin
          .from('push_subscriptions')
          .select('id, endpoint, p256dh, auth')
          .eq('user_id', t.assigned_to)
          .eq('is_active', true);

        for (const sub of subs || []) {
          try {
            await sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              JSON.stringify({ title, body, taskId: t.id, type: 'priority_changed' })
            );
            pushCount++;
          } catch (err: unknown) {
            const statusCode = (err as { statusCode?: number })?.statusCode;
            if (statusCode === 410 || statusCode === 404) {
              await supabaseAdmin
                .from('push_subscriptions')
                .update({ is_active: false })
                .eq('id', sub.id);
            }
          }
        }
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
