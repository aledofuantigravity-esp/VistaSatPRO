import { NextResponse } from 'next/server';
import { sendNotification, setVapidDetails } from 'web-push';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isVapidConfigured } from '@/lib/supabase/config';
import { checkRateLimit, getClientIp, rateLimitExceededResponse } from '@/lib/rate-limit';
import { captureMonitoringError } from '@/lib/monitoring';
import { evaluateUserNotificationDelivery } from '@/lib/notification-preferences';
import type { Profile, TaskPriority, TaskType } from '@/types/database';

if (
  isVapidConfigured() &&
  process.env.VAPID_PRIVATE_KEY?.trim() &&
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim()
) {
  setVapidDetails(
    (process.env.VAPID_SUBJECT || 'mailto:soporte@vistasat.pro').trim(),
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY.trim(),
    process.env.VAPID_PRIVATE_KEY.trim()
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
      'sla_alert',
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
            }),
            { TTL: 86400, urgency: 'high' }
          );
          sent++;
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 410 || statusCode === 404 || statusCode === 403 || statusCode === 401) {
            await supabaseAdmin
              .from('push_subscriptions')
              .update({ is_active: false })
              .eq('id', sub.id);
          }
          console.error('[Push/testSelf] Error enviando Web Push:', statusCode, err);
          captureMonitoringError(err, { route: '/api/push/send', scope: 'testSelf', statusCode });
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
        | 'reassigned'
        | 'sla_alert';
      title: string;
      body: string;
      isNewTask?: boolean;
    };

    // Derivar actorId exclusivamente de la sesión verificada
    const actorId = authUser.id;

    const { data: initialTask, error: taskErr } = await supabaseAdmin
      .from('tasks')
      .select('id, assigned_to, created_by, deleted_by, status, priority, task_type')
      .eq('id', taskId)
      .single();

    let task = initialTask;
    if (taskErr?.code === '42703') {
      const fallbackTask = await supabaseAdmin
        .from('tasks')
        .select('id, assigned_to, created_by, deleted_by, status, priority')
        .eq('id', taskId)
        .single();
      task = fallbackTask.data
        ? { ...fallbackTask.data, task_type: 'rma_incident' }
        : null;
    }

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

    // 4. Evaluar destinatarios según preferencias granulares de cada usuario activo
    const { data: initialProfiles, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('id, role, is_active, notification_level, notification_preferences')
      .eq('is_active', true);

    let candidateProfiles = initialProfiles;
    if (profErr?.code === '42703') {
      const fallbackProfs = await supabaseAdmin
        .from('profiles')
        .select('id, role, is_active, notification_level')
        .eq('is_active', true);
      candidateProfiles = (fallbackProfs.data || []).map((p) => ({
        ...p,
        notification_preferences: null,
      }));
    }

    const now = new Date();
    let inAppCount = 0;
    let pushCount = 0;

    for (const candidate of (candidateProfiles || []) as Array<
      Pick<
        Profile,
        'id' | 'role' | 'is_active' | 'notification_level' | 'notification_preferences'
      >
    >) {
      const decision = evaluateUserNotificationDelivery({
        recipient: candidate,
        actorId,
        task: {
          assigned_to: task.assigned_to,
          created_by: task.created_by,
          priority: (task.priority || 'medium') as TaskPriority,
          task_type: ((task as { task_type?: string }).task_type ||
            'rma_incident') as TaskType,
        },
        eventType: type,
        isNewTask,
        now,
      });

      if (!decision.inApp && !decision.push) continue;

      let pushedForCandidate = false;
      if (decision.push && vapidReady) {
        const { data: subs } = await supabaseAdmin
          .from('push_subscriptions')
          .select('id, endpoint, p256dh, auth')
          .eq('user_id', candidate.id)
          .eq('is_active', true);

        for (const sub of subs || []) {
          try {
            await sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              JSON.stringify({ title, body, taskId, type }),
              { TTL: 86400, urgency: 'high' }
            );
            pushCount++;
            pushedForCandidate = true;
          } catch (err: unknown) {
            const statusCode = (err as { statusCode?: number })?.statusCode;
            if (statusCode === 410 || statusCode === 404 || statusCode === 403 || statusCode === 401) {
              await supabaseAdmin
                .from('push_subscriptions')
                .update({ is_active: false })
                .eq('id', sub.id);
            }
            console.error('[Push] Error enviando Web Push:', statusCode, err);
            captureMonitoringError(err, {
              route: '/api/push/send',
              scope: 'delivery',
              statusCode,
              recipientId: candidate.id,
            });
          }
        }
      }

      if (decision.inApp) {
        const { error: insertErr } = await supabaseAdmin.from('notifications').insert({
          recipient_id: candidate.id,
          actor_id: actorId,
          task_id: taskId,
          type,
          title,
          body,
          push_sent: pushedForCandidate,
        });
        if (!insertErr) inAppCount++;
      }
    }

    return NextResponse.json({ ok: true, recipients: inAppCount, pushCount });
  } catch (error) {
    captureMonitoringError(error, { route: '/api/push/send' });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error enviando notificación' },
      { status: 500 }
    );
  }
}
