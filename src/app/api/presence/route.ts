import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { checkRateLimit, getClientIp, rateLimitExceededResponse } from '@/lib/rate-limit';

/**
 * POST /api/presence
 * Actualiza el estado en línea y última conexión (`is_online`, `last_seen_at`)
 * del usuario autenticado. Soporta navigator.sendBeacon al cerrar la pestaña.
 */
export async function POST(request: Request) {
  try {
    const rl = await checkRateLimit(`presence:${getClientIp(request)}`, 60, 60_000);
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ ok: true, mode: 'demo' });
    }

    const supabaseServer = await getSupabaseServerClient();
    const supabaseAdmin = getSupabaseAdminClient();
    if (!supabaseServer || !supabaseAdmin) {
      return NextResponse.json({ ok: false }, { status: 503 });
    }

    const {
      data: { user },
    } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    let isOnline = true;
    try {
      const body = (await request.json()) as { is_online?: boolean };
      if (typeof body.is_online === 'boolean') {
        isOnline = body.is_online;
      }
    } catch {
      // keepalive / body vacío
    }

    await supabaseAdmin
      .from('profiles')
      .update({
        is_online: isOnline,
        last_seen_at: new Date().toISOString(),
      })
      .eq('id', user.id)
      .eq('is_active', true);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
