import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';

/**
 * POST /api/admin/users
 * Decisión 3: El administrador crea la cuenta (email + contraseña inicial)
 * sin depender de emails automáticos de invitación.
 */
export async function POST(request: Request) {
  try {
    const supabaseServer = await getSupabaseServerClient();
    const supabaseAdmin = getSupabaseAdminClient();

    if (!supabaseServer || !supabaseAdmin) {
      return NextResponse.json(
        { error: 'Supabase Admin no configurado en el servidor' },
        { status: 503 }
      );
    }

    // Verificar que quien llama es admin o coordinador autenticado
    const {
      data: { user },
    } = await supabaseServer.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 });
    }

    const { data: callerProfile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!callerProfile || !['admin', 'coordinator'].includes(callerProfile.role)) {
      return NextResponse.json({ error: 'Sin permisos para crear usuarios' }, { status: 403 });
    }

    const body = await request.json();
    const { email, password, full_name, phone, role } = body as {
      email: string;
      password: string;
      full_name: string;
      phone?: string;
      role: 'admin' | 'coordinator' | 'technician';
    };

    if (!email || !password || !full_name || password.length < 6) {
      return NextResponse.json(
        { error: 'Email, nombre completo y contraseña (mín. 6 caracteres) son obligatorios.' },
        { status: 400 }
      );
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        phone: phone || null,
        role: role || 'technician',
      },
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, userId: created.user.id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error creando usuario' },
      { status: 500 }
    );
  }
}
