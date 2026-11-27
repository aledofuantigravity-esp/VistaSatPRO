import { NextResponse } from 'next/server';
import { sendNotification, setVapidDetails } from 'web-push';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isVapidConfigured } from '@/lib/supabase/config';
import { checkRateLimit, getClientIp, rateLimitExceededResponse } from '@/lib/rate-limit';
import { captureMonitoringError } from '@/lib/monitoring';

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

const pushPayloadSchema = z.union([
  z.object({
    testSelf: z.literal(true),
  }),
  z.object({
    testSelf: z.literal(false).optional(),
    taskId: z.string().uuid(),
    type: z.enum([
      'task_created',
      'task_assigned',
      'task_updated',
      'status_changed',
      'priority_changed',
      'comment_added',
      'reassigned',
    ]),
    title: z.string().trim().min(1).max(120),
    body: z.string().trim().min(1).max(300),
    isNewTask: z.boolean().optional(),
  }),
]);

/**
 * POST /api/push/send
 * Dispara notificaciones in-app + Web Push VAPID a destinatarios legítimos.
 * Requiere sesión JWT activa y deriva actorId exclusivamente del servidor.
 */
export async function POST(request: Request) {
  try {
    const rl = await checkRateLimit(`push:${getClientIp(request)}`, 20, 60_000);
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const supabaseAdmin = getSupabaseAdminClient();
    const supabaseServer = await getSupabaseServerClient();

    if (!supabaseAdmin || !supabaseServer) {
      return NextResponse.json(
        { ok: true, mode: 'demo', message: 'Supabase no configurado; notificaciones manejadas en modo prueba.' },
        { status: 200 }
      );
    }

    // 1. Autenticación obligatoria en TODAS las llamadas
    const {
      data: { user: authUser },
    } = await supabaseServer.auth.getUser();

    if (!authUser) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', authUser.id)
      .single();

    if (!callerProfile || !callerProfile.is_active) {
      return NextResponse.json({ error: 'Cuenta desactivada o sin perfil' }, { status: 403 });
    }

    const rawBody = await request.json();
    const parsed = pushPayloadSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Payload de notificación inválido' }, { status: 400 });
    }

    const vapidReady =
      isVapidConfigured() && Boolean(process.env.VAPID_PRIVATE_KEY);

    // 2. Modo prueba de Push hacia los dispositivos del propio usuario
    if ('testSelf' in parsed.data && parsed.data.testSelf === true) {
      if (!vapidReady) {
        return NextResponse.json({ ok: true, pushCount: 0 });
      }
      const { data: subs } = await supabaseAdmin
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
            await supabaseAdmin
              .from('push_subscriptions')
              .update({ is_active: false })
              .eq('id', sub.id);
          }
        }
      }
      return NextResponse.json({ ok: true, pushCount: sent });
    }

    const { taskId, type, title, body, isNewTask } = parsed.data as {
      taskId: string;
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
    };

    // Derivar actorId exclusivamente de la sesión verificada
    const actorId = authUser.id;

    const { data: task } = await supabaseAdmin
      .from('tasks')
      .select('id, assigned_to, created_by, deleted_by, status')
      .eq('id', taskId)
      .single();

    if (!task) {
      return NextResponse.json({ error: 'Parte no encontrado' }, { status: 404 });
    }

    // 3. Verificar autorización del actor sobre el parte
    const isCoordOrAdmin =
      callerProfile.role === 'admin' || callerProfile.role === 'coordinator';
    const hasTaskAccess =
      isCoordOrAdmin ||
      task.assigned_to === actorId ||
      task.created_by === actorId ||
      task.deleted_by === actorId ||
      (task.assigned_to === null && task.status === 'pending');

    if (!hasTaskAccess) {
      return NextResponse.json(
        { error: 'Sin permisos para notificar sobre este parte' },
        { status: 403 }
      );
    }

    const recipientSet = new Set<string>();

    if (task.assigned_to) {
      recipientSet.add(task.assigned_to);
    }

    if (isNewTask && !task.assigned_to) {
      const { data: techs } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('role', 'technician')
        .eq('is_active', true);
      techs?.forEach((t) => recipientSet.add(t.id));
    }

    const { data: coordinators } = await supabaseAdmin
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

    let pushCount = 0;

    for (const recipientId of recipients) {
      await supabaseAdmin.from('notifications').insert({
        recipient_id: recipientId,
        actor_id: actorId,
        task_id: taskId,
        type,
        title,
        body,
        push_sent: vapidReady,
      });

      if (vapidReady) {
        const { data: subs } = await supabaseAdmin
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
              await supabaseAdmin
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
    captureMonitoringError(error, { route: '/api/push/send' });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error enviando notificación' },
      { status: 500 }
    );
  }
}
