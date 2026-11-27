import { NextResponse } from 'next/server';
import { sendNotification, setVapidDetails } from 'web-push';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isVapidConfigured } from '@/lib/supabase/config';
import { checkRateLimit, getClientIp, rateLimitExceededResponse } from '@/lib/rate-limit';
import { captureMonitoringError } from '@/lib/monitoring';

async function requireAdminSession() {
  const supabaseServer = await getSupabaseServerClient();
  const supabaseAdmin = getSupabaseAdminClient();
  if (!supabaseServer || !supabaseAdmin) {
    return {
      error: NextResponse.json(
        { error: 'Supabase Admin no configurado en el servidor' },
        { status: 503 }
      ),
    };
  }

  const {
    data: { user },
  } = await supabaseServer.auth.getUser();
  if (!user) {
    return { error: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) };
  }

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single();

  if (!callerProfile || !callerProfile.is_active || callerProfile.role !== 'admin') {
    return {
      error: NextResponse.json(
        { error: 'Solo un Administrador activo puede gestionar dispositivos Push de usuarios.' },
        { status: 403 }
      ),
    };
  }

  return { supabaseAdmin };
}

/**
 * GET /api/admin/users/[id]/push
 * Lista las suscripciones Push activas del usuario indicado.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rl = await checkRateLimit(`admin-push-get:${getClientIp(request)}`, 30, 60_000);
    if (!rl.allowed) return rateLimitExceededResponse(rl);

    const auth = await requireAdminSession();
    if ('error' in auth && auth.error) return auth.error;

    const { id: targetId } = await params;
    const { data, error } = await auth.supabaseAdmin
      .from('push_subscriptions')
      .select('id, user_id, device_label, user_agent, is_active, created_at, last_used_at')
      .eq('user_id', targetId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ subscriptions: data || [] });
  } catch (error) {
    captureMonitoringError(error, { route: 'GET /api/admin/users/[id]/push' });
    return NextResponse.json({ error: 'Error consultando dispositivos' }, { status: 500 });
  }
}

/**
 * POST /api/admin/users/[id]/push
 * Envía un Push de prueba real a los dispositivos activos del usuario.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rl = await checkRateLimit(`admin-push-post:${getClientIp(request)}`, 10, 60_000);
    if (!rl.allowed) return rateLimitExceededResponse(rl);

    const auth = await requireAdminSession();
    if ('error' in auth && auth.error) return auth.error;

    if (
      !isVapidConfigured() ||
      !process.env.VAPID_PRIVATE_KEY ||
      !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    ) {
      return NextResponse.json(
        { ok: true, sent: 0, message: 'VAPID no configurado en el servidor.' },
        { status: 200 }
      );
    }

    setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:soporte@vistasat.pro',
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );

    const { id: targetId } = await params;
    const { data: subs } = await auth.supabaseAdmin
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .eq('user_id', targetId)
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
            title: 'VistaSatPRO — Prueba de Administrador',
            body: 'Tu dispositivo está recibiendo correctamente notificaciones Push del equipo.',
            taskId: null,
            type: 'generic',
          }),
          { TTL: 86400, urgency: 'high' }
        );
        sent++;
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          await auth.supabaseAdmin
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('id', sub.id);
        }
      }
    }

    return NextResponse.json({ ok: true, sent });
  } catch (error) {
    captureMonitoringError(error, { route: 'POST /api/admin/users/[id]/push' });
    return NextResponse.json({ error: 'Error enviando Push de prueba' }, { status: 500 });
  }
}

const deleteSchema = z.object({
  subId: z.string().uuid('Identificador de dispositivo inválido'),
});

/**
 * DELETE /api/admin/users/[id]/push
 * Desactiva una suscripción Push concreta del usuario.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const rl = await checkRateLimit(`admin-push-del:${getClientIp(request)}`, 20, 60_000);
    if (!rl.allowed) return rateLimitExceededResponse(rl);

    const auth = await requireAdminSession();
    if ('error' in auth && auth.error) return auth.error;

    const { id: targetId } = await params;
    const raw = await request.json();
    const parsed = deleteSchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Suscripción inválida' }, { status: 400 });
    }

    const { error } = await auth.supabaseAdmin
      .from('push_subscriptions')
      .update({ is_active: false })
      .eq('id', parsed.data.subId)
      .eq('user_id', targetId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    captureMonitoringError(error, { route: 'DELETE /api/admin/users/[id]/push' });
    return NextResponse.json({ error: 'Error revocando dispositivo' }, { status: 500 });
  }
}
