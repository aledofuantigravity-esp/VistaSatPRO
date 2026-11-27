import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp, rateLimitExceededResponse } from '@/lib/rate-limit';
import { captureMonitoringError } from '@/lib/monitoring';
import { evaluateUserNotificationDelivery } from '@/lib/notification-preferences';
import { sendWebPushBatch } from '@/lib/web-push-sender';
import type { Profile, TaskPriority, TaskType } from '@/types/database';

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
 * Dispara notificaciones in-app + Web Push VAPID en paralelo a destinatarios legítimos.
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

    // 2. Modo prueba de Push hacia los dispositivos del propio usuario
    if ('testSelf' in parsed.data && parsed.data.testSelf === true) {
      const { pushCount } = await sendWebPushBatch({
        supabaseAdmin,
        userIds: [authUser.id],
        payload: {
          title: 'VistaSatPRO — Prueba Push Real',
          body: 'Las notificaciones Push en segundo plano funcionan correctamente.',
          taskId: null,
          type: 'generic',
        },
        scope: 'testSelf',
        route: '/api/push/send',
      });
      return NextResponse.json({ ok: true, pushCount });
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

    const { data: task } = await supabaseAdmin
      .from('tasks')
      .select('id, assigned_to, created_by, deleted_by, status, priority, task_type')
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

    // 4. Evaluar destinatarios en memoria según preferencias granulares
    const { data: candidateProfiles } = await supabaseAdmin
      .from('profiles')
      .select('id, role, is_active, notification_level, notification_preferences')
      .eq('is_active', true);

    const now = new Date();
    const pushTargetUserIds: string[] = [];
    const inAppRecipientIds: string[] = [];

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

      if (decision.push) pushTargetUserIds.push(candidate.id);
      if (decision.inApp) inAppRecipientIds.push(candidate.id);
    }

    // 5. Envío paralelo de todos los Web Push en una única ronda
    const { pushCount, pushedUserIds } = await sendWebPushBatch({
      supabaseAdmin,
      userIds: pushTargetUserIds,
      payload: { title, body, taskId, type },
      scope: 'delivery',
      route: '/api/push/send',
    });

    // 6. Inserción en lote de notificaciones in-app
    let inAppCount = 0;
    if (inAppRecipientIds.length > 0) {
      const rows = inAppRecipientIds.map((recipientId) => ({
        recipient_id: recipientId,
        actor_id: actorId,
        task_id: taskId,
        type,
        title,
        body,
        push_sent: pushedUserIds.has(recipientId),
      }));
      const { error: insertErr } = await supabaseAdmin.from('notifications').insert(rows);
      if (!insertErr) {
        inAppCount = rows.length;
      } else {
        captureMonitoringError(insertErr, { route: '/api/push/send', scope: 'batch_insert' });
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
