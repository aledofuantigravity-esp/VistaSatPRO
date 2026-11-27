-- =============================================================================
-- VistaSatPRO — Migración 0011: Activar Push en todos los eventos + Realtime robusto
-- Ejecutar en Supabase SQL Editor después de 0010_physical_work_order.sql.
-- Es idempotente: puede ejecutarse de forma segura múltiples veces.
-- =============================================================================

-- 1. Asegurar REPLICA IDENTITY FULL en public.notifications para filtros Realtime (recipient_id)
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- 2. Activar task_updated.push y status_changed.push en perfiles existentes
--    que ya tenían Push habilitado y el evento In-App habilitado
UPDATE public.profiles
SET notification_preferences = jsonb_set(
  jsonb_set(
    notification_preferences,
    '{events,task_updated,push}',
    'true'::jsonb,
    true
  ),
  '{events,status_changed,push}',
  'true'::jsonb,
  true
)
WHERE notification_preferences IS NOT NULL
  AND COALESCE((notification_preferences->>'push_enabled')::boolean, true) = true
  AND COALESCE((notification_preferences#>>'{events,task_updated,in_app}')::boolean, true) = true;
