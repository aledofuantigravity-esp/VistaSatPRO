import { NextResponse } from 'next/server';
import { sendNotification, setVapidDetails } from 'web-push';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isVapidConfigured } from '@/lib/supabase/config';

if (
  isVapidConfigured() &&
  process.env.VAPID_PRIVATE_KEY &&
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
) {
  setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:soporte@vistasat.pro',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

interface PushSendBody {
  taskId: string;
  actorId: string;
  type:
    | 'task_created'
    | 'task_assigned'
    | 'task_updated'
    | 'status_changed'
    | 'priority_changed'
    | 'comment_added'
    | 'reassigned';
  title: string;
  body: string;
  isNewTask?: boolean;
}

/**
 * POST /api/push/send
 * Dispara notificaciones in-app + Web Push VAPID a todos los destinatarios
 * pertinentes, aplicando el filtro estricto anti-autonotificación (actorId !== recipientId).
 */
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdminClient();
    if (!supabase) {
      return NextResponse.json(
        { ok: true, mode: 'demo', message: 'Supabase no configurado; notificaciones manejadas localmente.' },
        { status: 200 }
      );
    }

    const payload = (await request.json()) as PushSendBody & { testSelf?: boolean };

    // Modo prueba de Push desde /profile hacia los dispositivos del propio usuario
    if (payload.testSelf) {
      const supabaseServer = await getSupabaseServerClient();
      const authUser = supabaseServer ? (await supabaseServer.auth.getUser()).data.user : null;
      if (!authUser) {
        return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
      }
      const vapidReady =
        isVapidConfigured() && Boolean(process.env.VAPID_PRIVATE_KEY);
      if (!vapidReady) {
        return NextResponse.json({ ok: true, pushCount: 0 });
      }
      const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', authUser.id)
        .eq('is_active', true);

      let sent = 0;
      for (const sub of subs || []) {
        try {
          await sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify({
              title: 'VistaSatPRO — Prueba Push Real',
              body: 'Las notificaciones Push en segundo plano funcionan correctamente.',
              taskId: null,
              type: 'generic',
            })
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
      return NextResponse.json({ ok: true, pushCount: sent });
    }

    const { taskId, actorId, type, title, body, isNewTask } = payload;

    const { data: task } = await supabase
      .from('tasks')
      .select('id, assigned_to, created_by')
      .eq('id', taskId)
      .single();

    if (!task) {
      return NextResponse.json({ error: 'Parte no encontrado' }, { status: 404 });
    }

    const recipientSet = new Set<string>();

    if (task.assigned_to) {
      recipientSet.add(task.assigned_to);
    }

    if (isNewTask && !task.assigned_to) {
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

    // FILTRO ESTRICTO ANTI-AUTONOTIFICACIÓN
    recipientSet.delete(actorId);
    const recipients = Array.from(recipientSet).filter((id) => id !== actorId);

    const vapidReady =
      isVapidConfigured() && Boolean(process.env.VAPID_PRIVATE_KEY);

    let pushCount = 0;

    for (const recipientId of recipients) {
      await supabase.from('notifications').insert({
        recipient_id: recipientId,
        actor_id: actorId,
        task_id: taskId,
        type,
        title,
        body,
        push_sent: vapidReady,
      });

      if (vapidReady) {
        const { data: subs } = await supabase
          .from('push_subscriptions')
          .select('id, endpoint, p256dh, auth')
          .eq('user_id', recipientId)
          .eq('is_active', true);

        for (const sub of subs || []) {
          try {
            await sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              JSON.stringify({ title, body, taskId, type })
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

    return NextResponse.json({ ok: true, recipients: recipients.length, pushCount });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error enviando notificación' },
      { status: 500 }
    );
  }
}
