// Supabase Edge Function: handle-task-event
// Desplegar con: supabase functions deploy handle-task-event
// Configurar Database Webhook en Supabase sobre tabla `tasks` (INSERT y UPDATE)
// o sobre `task_history` (INSERT)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:soporte@vistasat.pro';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE';
  table: string;
  record: Record<string, unknown>;
  old_record?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  try {
    const payload: WebhookPayload = await req.json();
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    if (payload.table !== 'tasks' && payload.table !== 'task_history') {
      return new Response(JSON.stringify({ ignored: true }), { status: 200 });
    }

    // Normalizar origen del evento
    const isTaskInsert = payload.table === 'tasks' && payload.type === 'INSERT';
    const taskId = payload.table === 'tasks'
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

    const actorId = payload.table === 'task_history'
      ? (payload.record.actor_id as string)
      : (payload.record.created_by as string);

    // 1. Determinar destinatarios potenciales
    const recipientSet = new Set<string>();

    // Si hay técnico asignado, notificarle
    if (task.assigned_to) {
      recipientSet.add(task.assigned_to);
    }

    // Si es tarea nueva sin asignar, notificar a técnicos activos
    if (isTaskInsert && !task.assigned_to) {
      const { data: techs } = await supabase
        .from('profiles')
        .select('id')
        .eq('role', 'technician')
        .eq('is_active', true);
      techs?.forEach((t) => recipientSet.add(t.id));
    }

    // Coordinadores / Admins según su preferencia `notification_level` (Decisión 2)
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

    // 2. FILTRO ESTRICTO ANTI-AUTONOTIFICACIÓN (actor_id != recipient_id)
    recipientSet.delete(actorId);

    const recipients = Array.from(recipientSet);
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ sent: 0, reason: 'no_external_recipients' }), { status: 200 });
    }

    // 3. Construir mensaje
    const eventType = payload.table === 'task_history'
      ? (payload.record.event_type as string)
      : 'task_created';

    const customerName = (task.customer as { name?: string } | null)?.name || 'Cliente';
    const title = isTaskInsert
      ? `Nuevo parte ${task.code}`
      : `Actualización en ${task.code}`;
    const body = isTaskInsert
      ? `${customerName} — Parte asignado o disponible`
      : `${customerName} — Se ha actualizado el parte (${eventType})`;

    const notifType = eventType === 'status_changed'
      ? 'status_changed'
      : eventType === 'priority_changed'
      ? 'priority_changed'
      : eventType === 'note_added'
      ? 'comment_added'
      : eventType === 'reassigned'
      ? 'reassigned'
      : eventType === 'assigned'
      ? 'task_assigned'
      : 'task_updated';

    // 4. Insertar notificaciones in-app y enviar Push VAPID
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

      if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
        const { data: subs } = await supabase
          .from('push_subscriptions')
          .select('id, endpoint, p256dh, auth')
          .eq('user_id', recipientId)
          .eq('is_active', true);

        for (const sub of subs || []) {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              JSON.stringify({ title, body, taskId: task.id, type: notifType })
            );
            pushCount++;
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
      }
    }

    return new Response(
      JSON.stringify({ recipients: recipients.length, pushCount }),
      { headers: { 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), { status: 500 });
  }
});
