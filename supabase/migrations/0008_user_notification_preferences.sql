-- =============================================================================
-- VistaSatPRO — Migración 0008: Preferencias Granulares de Notificaciones y Push
-- Ejecutar en Supabase SQL Editor después de 0007_security_hardening_extra.sql.
-- Es idempotente: puede ejecutarse de forma segura múltiples veces.
-- =============================================================================

-- ─── 1. COLUMNA JSONB EN PROFILES ─────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT NULL;

-- Inicializar preferencias para perfiles existentes que aún no tengan el JSONB
UPDATE public.profiles
SET notification_preferences = jsonb_build_object(
  'scope',
    CASE
      WHEN notification_level = 'none' THEN 'none'
      WHEN notification_level = 'all' THEN 'all'
      ELSE 'assigned_or_created'
    END,
  'include_unassigned_new_tasks', true,
  'include_created_by_me', true,
  'in_app_enabled', (notification_level <> 'none'),
  'push_enabled', (notification_level <> 'none'),
  'events', jsonb_build_object(
    'task_created', jsonb_build_object('in_app', (notification_level <> 'none'), 'push', (notification_level <> 'none')),
    'task_assigned', jsonb_build_object('in_app', (notification_level <> 'none'), 'push', (notification_level <> 'none')),
    'comment_added', jsonb_build_object('in_app', (notification_level <> 'none'), 'push', (notification_level <> 'none')),
    'status_changed', jsonb_build_object('in_app', (notification_level <> 'none'), 'push', (notification_level <> 'none' AND role = 'technician')),
    'priority_changed', jsonb_build_object('in_app', (notification_level <> 'none'), 'push', (notification_level <> 'none')),
    'task_updated', jsonb_build_object('in_app', (notification_level <> 'none'), 'push', false),
    'sla_alert', jsonb_build_object('in_app', (notification_level <> 'none'), 'push', (notification_level <> 'none'))
  ),
  'task_types', jsonb_build_object(
    'installation', true,
    'rma_incident', true,
    'cxc_incident', true,
    'task', true
  ),
  'min_priority_in_app', 'low',
  'min_priority_push', 'low',
  'quiet_hours', jsonb_build_object(
    'enabled', false,
    'start', '21:00',
    'end', '08:00',
    'allow_urgent_override', true
  ),
  'allow_user_override', true
)
WHERE notification_preferences IS NULL;

-- ─── 2. PERMITIR TIPO 'sla_alert' EN PUBLIC.NOTIFICATIONS ───────────────────────
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.notifications'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%task_created%'
    AND pg_get_constraintdef(oid) LIKE '%comment_added%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.notifications DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check CHECK (type IN (
    'task_created', 'task_assigned', 'task_updated',
    'status_changed', 'priority_changed', 'comment_added',
    'reassigned', 'sla_alert'
  ));

-- ─── 3. PROTEGER BLOQUEO DE PREFERENCIAS POR ADMINISTRADOR ────────────────────
CREATE OR REPLACE FUNCTION public.guard_profile_notification_override()
RETURNS TRIGGER AS $$
BEGIN
  -- Si la actualización viene de un usuario autenticado que NO es admin
  IF auth.uid() IS NOT NULL AND public.current_user_role() <> 'admin' THEN
    -- Nunca permitir cambiar rol ni estado activo por RLS propia
    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Solo un Administrador puede cambiar el rol o el estado activo de un perfil.';
    END IF;

    -- Si el administrador bloqueó las preferencias de este usuario, impedir cambios propios
    IF OLD.notification_preferences IS NOT NULL
       AND COALESCE((OLD.notification_preferences->>'allow_user_override')::BOOLEAN, true) = false THEN
      IF NEW.notification_preferences IS DISTINCT FROM OLD.notification_preferences
         OR NEW.notification_level IS DISTINCT FROM OLD.notification_level THEN
        RAISE EXCEPTION 'La configuración de notificaciones de tu cuenta está fijada por el Administrador.';
      END IF;
    END IF;

    -- Tampoco puede auto-habilitarse allow_user_override si estaba en false
    IF NEW.notification_preferences IS NOT NULL
       AND OLD.notification_preferences IS NOT NULL
       AND COALESCE((OLD.notification_preferences->>'allow_user_override')::BOOLEAN, true) = false
       AND COALESCE((NEW.notification_preferences->>'allow_user_override')::BOOLEAN, true) = true THEN
      RAISE EXCEPTION 'Solo el Administrador puede cambiar el bloqueo de preferencias.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS check_profile_notification_override ON public.profiles;
CREATE TRIGGER check_profile_notification_override
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_notification_override();
