-- =============================================================================
-- VistaSatPRO — Migración 0009: Notificaciones y Push exclusivos del Administrador
-- Ejecutar en Supabase SQL Editor después de 0008_user_notification_preferences.sql.
-- Es idempotente: puede ejecutarse de forma segura múltiples veces.
-- =============================================================================

-- Fijar allow_user_override = false en todos los perfiles
UPDATE public.profiles
SET notification_preferences = jsonb_set(
  COALESCE(notification_preferences, '{}'::jsonb),
  '{allow_user_override}',
  'false'::jsonb,
  true
)
WHERE notification_preferences IS NOT NULL;

-- Bloquear SIEMPRE en BD cualquier cambio de notificaciones/Push por no-admins
CREATE OR REPLACE FUNCTION public.guard_profile_notification_override()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND public.current_user_role() <> 'admin' THEN
    IF NEW.role IS DISTINCT FROM OLD.role OR NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      RAISE EXCEPTION 'Solo un Administrador puede cambiar el rol o el estado activo de un perfil.';
    END IF;

    IF NEW.notification_preferences IS DISTINCT FROM OLD.notification_preferences
       OR NEW.notification_level IS DISTINCT FROM OLD.notification_level THEN
      RAISE EXCEPTION 'Solo un Administrador puede modificar las preferencias de notificaciones y Push desde la gestión de usuarios.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS check_profile_notification_override ON public.profiles;
CREATE TRIGGER check_profile_notification_override
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_notification_override();
