-- =============================================================================
-- VistaSatPRO — Migración 0017: Permitir borrar notificaciones propias ya leídas
-- Ejecutar en Supabase SQL Editor después de 0016_installation_products.sql.
-- Es idempotente: puede ejecutarse de forma segura múltiples veces.
-- =============================================================================

DROP POLICY IF EXISTS "notifications_delete_own" ON public.notifications;
CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE USING (
    public.is_active_user()
    AND recipient_id = auth.uid()
    AND is_read = TRUE
  );
