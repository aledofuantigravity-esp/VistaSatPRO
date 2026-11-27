-- =============================================================================
-- VistaSatPRO — Migración 0012: Simplificar Estados a 4 Únicos
-- (Pendiente, En Proceso, Completada, Cancelada)
-- Ejecutar en Supabase SQL Editor después de 0011_enable_push_all_events.sql.
-- Es idempotente: puede ejecutarse de forma segura múltiples veces.
-- =============================================================================

-- ─── 1. MIGRAR REGISTROS LEGACY EN PUBLIC.TASKS ───────────────────────────────
UPDATE public.tasks
SET status = 'pending'
WHERE status = 'assigned';

UPDATE public.tasks
SET status = 'in_progress'
WHERE status IN ('en_route', 'on_hold');

-- ─── 2. ACTUALIZAR CONSTRAINT DE STATUS EN PUBLIC.TASKS ───────────────────────
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.tasks'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.tasks DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_status_check CHECK (status IN (
    'pending', 'in_progress', 'completed', 'cancelled'
  ));

-- ─── 3. ACTUALIZAR POLÍTICA RLS DE INSERCIÓN PARA TÉCNICOS ────────────────────
DROP POLICY IF EXISTS "tasks_insert_rbac" ON public.tasks;
CREATE POLICY "tasks_insert_rbac" ON public.tasks
  FOR INSERT WITH CHECK (
    public.is_coordinator_or_admin()
    OR (
      public.is_active_user()
      AND public.current_user_role() = 'technician'
      AND created_by = auth.uid()
      AND assigned_to = auth.uid()
      AND status IN ('pending', 'in_progress')
    )
  );
