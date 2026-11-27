import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { checkRateLimit, getClientIp, rateLimitExceededResponse } from '@/lib/rate-limit';
import { captureMonitoringError } from '@/lib/monitoring';
import {
  normalizeNotificationPreferences,
  syncLegacyNotificationLevel,
} from '@/lib/notification-preferences';
import type { NotificationLevel, UserRole } from '@/types/database';

const channelToggleSchema = z.object({
  in_app: z.boolean(),
  push: z.boolean(),
});

const notificationPreferencesSchema = z.object({
  scope: z.enum(['all', 'assigned_or_created', 'assigned_only', 'none']),
  include_unassigned_new_tasks: z.boolean(),
  include_created_by_me: z.boolean(),
  in_app_enabled: z.boolean(),
  push_enabled: z.boolean(),
  events: z.object({
    task_created: channelToggleSchema,
    task_assigned: channelToggleSchema,
    comment_added: channelToggleSchema,
    status_changed: channelToggleSchema,
    priority_changed: channelToggleSchema,
    task_updated: channelToggleSchema,
    sla_alert: channelToggleSchema,
  }),
  task_types: z.object({
    installation: z.boolean(),
    rma_incident: z.boolean(),
    cxc_incident: z.boolean(),
    task: z.boolean(),
  }),
  min_priority_in_app: z.enum(['low', 'medium', 'high', 'urgent']),
  min_priority_push: z.enum(['low', 'medium', 'high', 'urgent']),
  quiet_hours: z.object({
    enabled: z.boolean(),
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
    allow_urgent_override: z.boolean(),
  }),
  allow_user_override: z.boolean(),
});

const updateUserSchema = z.object({
  full_name: z.string().trim().min(2).max(120).optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  role: z.enum(['admin', 'coordinator', 'technician']).optional(),
  is_active: z.boolean().optional(),
  notification_level: z.enum(['all', 'assigned_or_created', 'none']).optional(),
  notification_preferences: notificationPreferencesSchema.optional(),
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
    const rl = await checkRateLimit(`admin-users-patch:${getClientIp(request)}`, 15, 60_000);
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

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

    const { data: targetCurrent } = await supabaseAdmin
      .from('profiles')
      .select('role, notification_level')
      .eq('id', targetId)
      .single();

    const effectiveRole = (patch.role || targetCurrent?.role || 'technician') as UserRole;
    const effectiveLegacyLevel = (patch.notification_level ||
      targetCurrent?.notification_level ||
      'assigned_or_created') as NotificationLevel;

    const dbPayload: Record<string, unknown> = {
      ...(patch.full_name !== undefined ? { full_name: patch.full_name } : {}),
      ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
      ...(patch.role !== undefined ? { role: patch.role } : {}),
      ...(patch.is_active !== undefined ? { is_active: patch.is_active } : {}),
      ...(patch.is_active === false ? { is_online: false } : {}),
      updated_at: new Date().toISOString(),
    };

    if (patch.notification_preferences !== undefined) {
      const normalized = normalizeNotificationPreferences(
        patch.notification_preferences,
        effectiveRole,
        effectiveLegacyLevel
      );
      dbPayload.notification_preferences = normalized;
      dbPayload.notification_level = syncLegacyNotificationLevel(normalized);
    } else if (patch.notification_level !== undefined) {
      dbPayload.notification_level = patch.notification_level;
    }

    let { data: updated, error } = await supabaseAdmin
      .from('profiles')
      .update(dbPayload)
      .eq('id', targetId)
      .select()
      .single();

    // Fallback retroactivo si aún no se aplicó migración 0008 (columna notification_preferences)
    if (error?.code === '42703' && 'notification_preferences' in dbPayload) {
      const { notification_preferences: _omit, ...legacyPayload } = dbPayload;
      void _omit;
      const retry = await supabaseAdmin
        .from('profiles')
        .update(legacyPayload)
        .eq('id', targetId)
        .select()
        .single();
      updated = retry.data;
      error = retry.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, profile: updated });
  } catch (error) {
    captureMonitoringError(error, { route: '/api/admin/users/[id]' });
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error actualizando usuario' },
      { status: 500 }
    );
  }
}
