// Supabase Edge Function: handle-task-event
// Desplegar con: supabase functions deploy handle-task-event
// Configurar Database Webhooks en Supabase sobre `tasks` (INSERT),
// `task_history` (INSERT) y `task_comments` (INSERT), o invocar con
// { "action": "check_sla" } para alertas diarias de vencimiento SLA.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') || '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:soporte@vistasat.pro';
const INTERNAL_WEBHOOK_SECRET = Deno.env.get('INTERNAL_WEBHOOK_SECRET');

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface WebhookPayload {
  action?: string;
  type?: 'INSERT' | 'UPDATE';
  table?: string;
  record?: Record<string, unknown>;
  old_record?: Record<string, unknown>;
}

async function sendWebPushToUser(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  payloadJson: string
): Promise<number> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return 0;

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('is_active', true);

  let sent = 0;
  for (const sub of subs || []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payloadJson
      );
      sent++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 410 || statusCode === 404) {
        await supabase
          .from('push_subscriptions')
          .update({ is_active: false })
          .eq('id', sub.id);
      }
    }
  }
  return sent;
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

Deno.serve(async (req) => {
  try {
    if (!INTERNAL_WEBHOOK_SECRET) {
      return new Response(
        JSON.stringify({ error: 'INTERNAL_WEBHOOK_SECRET not configured' }),
        { status: 503 }
      );
    }

    const provided =
      req.headers.get('x-webhook-secret') ||
      req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
      '';
    if (!provided || !constantTimeEqual(provided, INTERNAL_WEBHOOK_SECRET)) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const payload: WebhookPayload =
      req.method === 'GET' ? { action: 'check_sla' } : await req.json();

    // ─── MODO 1: Chequeo diario de vencimientos SLA ────────────────────────
    if (payload.action === 'check_sla') {
      const now = new Date();
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(now);
      endOfDay.setHours(23, 59, 59, 999);

      const { data: dueTasks } = await supabase
        .from('tasks')
        .select('id, code, due_date, assigned_to, created_by, customer:customers(name)')
        .is('deleted_at', null)
        .not('due_date', 'is', null)
        .not('assigned_to', 'is', null)
        .not('status', 'in', '("completed","cancelled")')
        .lte('due_date', endOfDay.toISOString());

      let notified = 0;
      let pushCount = 0;

      for (const t of dueTasks || []) {
        if (!t.assigned_to || !t.due_date) continue;

        const { data: existingToday } = await supabase
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
          ? `${customerName} — El plazo venció el ${due.toLocaleString('es-ES')}.`
          : `${customerName} — El parte vence hoy.`;

        await supabase.from('notifications').insert({
          recipient_id: t.assigned_to,
          actor_id: t.created_by,
          task_id: t.id,
          type: 'priority_changed',
          title,
          body,
          push_sent: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
        });
        notified++;

        pushCount += await sendWebPushToUser(
          supabase,
          t.assigned_to,
          JSON.stringify({ title, body, taskId: t.id, type: 'priority_changed' })
        );
      }

      return new Response(
        JSON.stringify({ ok: true, mode: 'check_sla', notified, pushCount }),
        { headers: { 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // ─── MODO 2: Webhooks de eventos de parte / historial / comentarios ────
    if (
      !payload.record ||
      (payload.table !== 'tasks' &&
        payload.table !== 'task_history' &&
        payload.table !== 'task_comments')
    ) {
      return new Response(JSON.stringify({ ignored: true }), { status: 200 });
    }

    const isTaskInsert = payload.table === 'tasks' && payload.type === 'INSERT';
    const isCommentInsert = payload.table === 'task_comments' && payload.type === 'INSERT';
    const taskId =
      payload.table === 'tasks'
        ? (payload.record.id as string)
        : (payload.record.task_id as string);

    const { data: task } = await supabase
      .from('tasks')
      .select('id, code, status, priority, assigned_to, created_by, customer:customers(name)')
      .eq('id', taskId)
      .single();

    if (!task) {
      return new Response(JSON.stringify({ error: 'Task not found' }), { status: 404 });
    }

    const actorId =
      payload.table === 'task_history'
        ? (payload.record.actor_id as string)
        : payload.table === 'task_comments'
        ? (payload.record.author_id as string)
        : (payload.record.created_by as string);

    const recipientSet = new Set<string>();
    if (task.assigned_to) recipientSet.add(task.assigned_to);

    if (isTaskInsert && !task.assigned_to) {
      const { data: techs } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'technician')
        .eq('is_active', true);
      techs?.forEach((t) => recipientSet.add(t.id));
    }

    const { data: coordinators } = await supabase
      .from('profiles')
      .select('id, notification_level')
      .in('role', ['admin', 'coordinator'])
      .eq('is_active', true);

    coordinators?.forEach((coord) => {
      if (coord.notification_level === 'all') {
        recipientSet.add(coord.id);
      } else if (
        coord.notification_level === 'assigned_or_created' &&
        (task.created_by === coord.id || task.assigned_to === coord.id)
      ) {
        recipientSet.add(coord.id);
      }
    });

    // Filtro estricto anti-autonotificación
    recipientSet.delete(actorId);

    const recipients = Array.from(recipientSet);
    if (recipients.length === 0) {
      return new Response(
        JSON.stringify({ sent: 0, reason: 'no_external_recipients' }),
        { status: 200 }
      );
    }

    const eventType = isCommentInsert
      ? 'comment_added'
      : payload.table === 'task_history'
      ? (payload.record.event_type as string)
      : 'task_created';

    const customerName =
      (task.customer as { name?: string } | null)?.name || 'Cliente';

    const title = isTaskInsert
      ? `Nuevo parte ${task.code}`
      : isCommentInsert
      ? `Nuevo mensaje en ${task.code}`
      : `Actualización en ${task.code}`;

    const body = isTaskInsert
      ? `${customerName} — Parte asignado o disponible`
      : isCommentInsert
      ? String(payload.record.body || '').slice(0, 110)
      : `${customerName} — Se ha actualizado el parte (${eventType})`;

    const notifType =
      eventType === 'status_changed'
        ? 'status_changed'
        : eventType === 'priority_changed'
        ? 'priority_changed'
        : eventType === 'note_added' || eventType === 'comment_added'
        ? 'comment_added'
        : eventType === 'reassigned'
        ? 'reassigned'
        : eventType === 'assigned'
        ? 'task_assigned'
        : isTaskInsert
        ? 'task_created'
        : 'task_updated';

    let pushCount = 0;
    for (const recipientId of recipients) {
      await supabase.from('notifications').insert({
        recipient_id: recipientId,
        actor_id: actorId,
        task_id: task.id,
        type: notifType,
        title,
        body,
        push_sent: Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
      });

      pushCount += await sendWebPushToUser(
        supabase,
        recipientId,
        JSON.stringify({ title, body, taskId: task.id, type: notifType })
      );
    }

    return new Response(
      JSON.stringify({ recipients: recipients.length, pushCount }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
});
