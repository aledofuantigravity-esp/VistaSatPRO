import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp, rateLimitExceededResponse } from '@/lib/rate-limit';
import { captureMonitoringError } from '@/lib/monitoring';
import { validatePasswordStrength } from '@/lib/security';

const createUserSchema = z.object({
  email: z.string().trim().email('Correo electrónico inválido'),
  password: z
    .string()
    .superRefine((val, ctx) => {
      const check = validatePasswordStrength(val);
      if (!check.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: check.error || 'Contraseña poco segura.',
        });
      }
    }),
  full_name: z.string().trim().min(2, 'Nombre demasiado corto').max(120),
  phone: z.string().trim().max(30).optional(),
  role: z.enum(['admin', 'coordinator', 'technician']).default('technician'),
});

/**
 * POST /api/admin/users
 * Exclusivo para el Administrador activo.
 */
export async function POST(request: Request) {
  try {
    const rl = await checkRateLimit(`admin-users-post:${getClientIp(request)}`, 10, 60_000);
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const supabaseServer = await getSupabaseServerClient();
    const supabaseAdmin = getSupabaseAdminClient();

    if (!supabaseServer || !supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase Admin no configurado en el servidor' },
        { status: 503 }
      );
    }

    const {
      data: { user },
    } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .single();

    if (!callerProfile || !callerProfile.is_active || callerProfile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Solo un Administrador activo puede crear usuarios' },
        { status: 403 }
      );
    }

    const rawBody = await request.json();
    const parsed = createUserSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Datos inválidos' },
        { status: 400 }
      );
    }

    const { email, password, full_name, phone, role } = parsed.data;

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        phone: phone || null,
        role,
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    await supabaseAdmin
      .from('profiles')
      .update({
        full_name,
        phone: phone || null,
        role,
      })
      .eq('id', created.user.id);

    return NextResponse.json({ ok: true, userId: created.user.id });
  } catch (error) {
    captureMonitoringError(error, { route: '/api/admin/users' });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error creando usuario' },
      { status: 500 }
    );
  }
}
