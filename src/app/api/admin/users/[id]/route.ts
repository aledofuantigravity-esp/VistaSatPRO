import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';

const updateUserSchema = z.object({
  full_name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  role: z.enum(['admin', 'coordinator', 'technician']).optional(),
  is_active: z.boolean().optional(),
});

/**
 * PATCH /api/admin/users/[id]
 * Exclusivo para el Administrador activo.
 * Al desactivar un usuario, revoca/banea su acceso en Supabase Auth y desactiva sus push_subscriptions.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetId } = await params;
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
        { error: 'Solo un Administrador activo puede editar usuarios' },
        { status: 403 }
      );
    }

    const rawBody = await request.json();
    const parsed = updateUserSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos de actualización inválidos' }, { status: 400 });
    }

    const patch = parsed.data;

    // Impedir que el admin se desactive o degrade a sí mismo accidentalmente
    if (targetId === user.id && (patch.is_active === false || (patch.role && patch.role !== 'admin'))) {
      return NextResponse.json(
        { error: 'No puedes desactivar o quitar el rol Administrador a tu propia cuenta.' },
        { status: 400 }
      );
    }

    if (patch.is_active !== undefined) {
      await supabaseAdmin.auth.admin.updateUserById(targetId, {
        ban_duration: patch.is_active ? 'none' : '876000h',
      });

      if (!patch.is_active) {
        await supabaseAdmin
          .from('push_subscriptions')
          .update({ is_active: false })
          .eq('user_id', targetId);
      }
    }

    const { data: updated, error } = await supabaseAdmin
      .from('profiles')
      .update({
        ...patch,
        ...(patch.is_active === false ? { is_online: false } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, profile: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error actualizando usuario' },
      { status: 500 }
    );
  }
}
