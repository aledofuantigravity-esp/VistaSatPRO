-- =============================================================================
-- VistaSatPRO — Migración 0003: Borrado Lógico, Edición Universal y Papelera
-- Ejecutar en Supabase SQL Editor sobre la base de datos existente.
-- Es idempotente: puede ejecutarse de forma segura múltiples veces.
-- =============================================================================

-- ─── 1. COLUMNAS DE BORRADO LÓGICO EN TASKS ───────────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deleted_by      UUID REFERENCES public.profiles(id) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_active
  ON public.tasks (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_trash
  ON public.tasks (deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

-- ─── 2. NUEVOS TIPOS DE EVENTO EN TASK_HISTORY ────────────────────────────────
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.task_history'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%event_type%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.task_history DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.task_history
  ADD CONSTRAINT task_history_event_type_check CHECK (event_type IN (
    'created', 'status_changed', 'priority_changed', 'assigned',
    'reassigned', 'note_added', 'attachment_added', 'signature_captured',
    'pdf_generated', 'field_updated', 'deleted', 'restored'
  ));

-- ─── 3. BLOQUEO DE BORRADO FÍSICO DE PARTES ───────────────────────────────────
DROP POLICY IF EXISTS "tasks_delete_block" ON public.tasks;
CREATE POLICY "tasks_delete_block" ON public.tasks
  FOR DELETE USING (false);

CREATE OR REPLACE FUNCTION public.prevent_physical_task_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'No se permite el borrado físico de partes. Usa borrado lógico (deleted_at).';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS block_physical_task_delete ON public.tasks;
CREATE TRIGGER block_physical_task_delete
  BEFORE DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.prevent_physical_task_delete();

-- ─── 4. POLÍTICAS RLS ACTUALIZADAS PARA TODOS LOS ROLES ───────────────────────
DROP POLICY IF EXISTS "tasks_select_rbac" ON public.tasks;
CREATE POLICY "tasks_select_rbac" ON public.tasks
  FOR SELECT USING (
    public.is_coordinator_or_admin()
    OR (
      public.is_active_user()
      AND (
        assigned_to = auth.uid()
        OR created_by = auth.uid()
        OR deleted_by = auth.uid()
        OR (assigned_to IS NULL AND status = 'pending')
      )
    )
  );

DROP POLICY IF EXISTS "tasks_update_rbac" ON public.tasks;
CREATE POLICY "tasks_update_rbac" ON public.tasks
  FOR UPDATE USING (
    public.is_coordinator_or_admin()
    OR (
      public.is_active_user()
      AND (
        assigned_to = auth.uid()
        OR created_by = auth.uid()
        OR deleted_by = auth.uid()
        OR (assigned_to IS NULL AND status = 'pending')
      )
    )
  )
  WITH CHECK (
    public.is_coordinator_or_admin()
    OR (
      public.is_active_user()
      AND (
        assigned_to = auth.uid()
        OR created_by = auth.uid()
        OR deleted_by = auth.uid()
        OR (assigned_to IS NULL AND status = 'pending')
      )
    )
  );

DROP POLICY IF EXISTS "history_select_rbac" ON public.task_history;
CREATE POLICY "history_select_rbac" ON public.task_history
  FOR SELECT USING (
    public.is_active_user()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_history.task_id
        AND (
          public.is_coordinator_or_admin()
          OR t.assigned_to = auth.uid()
          OR t.created_by = auth.uid()
          OR t.deleted_by = auth.uid()
          OR (t.assigned_to IS NULL AND t.status = 'pending')
        )
    )
  );

DROP POLICY IF EXISTS "history_insert_auth" ON public.task_history;
CREATE POLICY "history_insert_auth" ON public.task_history
  FOR INSERT WITH CHECK (
    public.is_active_user()
    AND actor_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_history.task_id
        AND (
          public.is_coordinator_or_admin()
          OR t.assigned_to = auth.uid()
          OR t.created_by = auth.uid()
          OR t.deleted_by = auth.uid()
          OR (t.assigned_to IS NULL AND t.status = 'pending')
        )
    )
  );

-- ─── 5. TRIGGER DE AUDITORÍA COMPLETA PARA MODIFICACIÓN, BORRADO Y RESTAURACIÓN
CREATE OR REPLACE FUNCTION public.log_task_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_actor UUID;
  v_old_customer TEXT;
  v_new_customer TEXT;
BEGIN
  v_actor := COALESCE(auth.uid(), NEW.deleted_by, NEW.created_by);

  -- El código correlativo, creador original y fecha de creación son inmutables
  IF NEW.code IS DISTINCT FROM OLD.code
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'El código correlativo y los metadatos de creación del parte son inmutables.';
  END IF;

  -- Un técnico no puede reasignar un parte ya asignado a otro compañero
  IF auth.uid() IS NOT NULL AND public.current_user_role() = 'technician' THEN
    IF OLD.assigned_to IS NOT NULL
       AND OLD.assigned_to IS DISTINCT FROM auth.uid()
       AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      RAISE EXCEPTION 'Un técnico no puede reasignar un parte ya asignado a otro técnico.';
    END IF;
  END IF;

  -- Borrado lógico (envío a papelera)
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    NEW.deleted_by := COALESCE(auth.uid(), NEW.deleted_by, v_actor);
    INSERT INTO public.task_history(task_id, actor_id, event_type, field_name, old_value, new_value, note)
    VALUES (
      NEW.id,
      v_actor,
      'deleted',
      'deleted_at',
      NULL,
      NEW.deleted_at::TEXT,
      CASE
        WHEN NEW.deletion_reason IS NOT NULL AND btrim(NEW.deletion_reason) <> ''
          THEN 'Parte enviado a la papelera. Motivo: ' || btrim(NEW.deletion_reason)
        ELSE 'Parte enviado a la papelera'
      END
    );
  END IF;

  -- Restauración desde la papelera
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    NEW.deleted_by := NULL;
    NEW.deletion_reason := NULL;
    INSERT INTO public.task_history(task_id, actor_id, event_type, field_name, old_value, new_value, note)
    VALUES (
      NEW.id,
      v_actor,
      'restored',
      'deleted_at',
      OLD.deleted_at::TEXT,
      NULL,
      'Parte restaurado desde la papelera'
    );
  END IF;

  -- Auditoría de cambios de cliente
  IF OLD.customer_id IS DISTINCT FROM NEW.customer_id THEN
    SELECT name INTO v_old_customer FROM public.customers WHERE id = OLD.customer_id;
    SELECT name INTO v_new_customer FROM public.customers WHERE id = NEW.customer_id;
    INSERT INTO public.task_history(task_id, actor_id, event_type, field_name, old_value, new_value, note)
    VALUES (
      NEW.id, v_actor, 'field_updated', 'customer_id',
      COALESCE(v_old_customer, OLD.customer_id::TEXT),
      COALESCE(v_new_customer, NEW.customer_id::TEXT),
      'Cliente actualizado: ' || COALESCE(v_old_customer, '—') || ' → ' || COALESCE(v_new_customer, '—')
    );
  END IF;

  -- Auditoría de equipo / número de serie / avería / contacto en sitio
  IF OLD.equipment_ref IS DISTINCT FROM NEW.equipment_ref THEN
    INSERT INTO public.task_history(task_id, actor_id, event_type, field_name, old_value, new_value, note)
    VALUES (
      NEW.id, v_actor, 'field_updated', 'equipment_ref',
      OLD.equipment_ref, NEW.equipment_ref,
      'Equipo actualizado: ' || COALESCE(OLD.equipment_ref, '—') || ' → ' || COALESCE(NEW.equipment_ref, '—')
    );
  END IF;

  IF OLD.equipment_sn IS DISTINCT FROM NEW.equipment_sn THEN
    INSERT INTO public.task_history(task_id, actor_id, event_type, field_name, old_value, new_value, note)
    VALUES (
      NEW.id, v_actor, 'field_updated', 'equipment_sn',
      OLD.equipment_sn, NEW.equipment_sn,
      'Nº de serie actualizado: ' || COALESCE(OLD.equipment_sn, '—') || ' → ' || COALESCE(NEW.equipment_sn, '—')
    );
  END IF;

  IF OLD.problem_desc IS DISTINCT FROM NEW.problem_desc THEN
    INSERT INTO public.task_history(task_id, actor_id, event_type, field_name, old_value, new_value, note)
    VALUES (
      NEW.id, v_actor, 'field_updated', 'problem_desc',
      OLD.problem_desc, NEW.problem_desc,
      'Descripción de avería modificada'
    );
  END IF;

  IF OLD.site_contact_name IS DISTINCT FROM NEW.site_contact_name
     OR OLD.site_contact_phone IS DISTINCT FROM NEW.site_contact_phone
     OR OLD.site_address IS DISTINCT FROM NEW.site_address
     OR OLD.site_city IS DISTINCT FROM NEW.site_city THEN
    INSERT INTO public.task_history(task_id, actor_id, event_type, field_name, note)
    VALUES (NEW.id, v_actor, 'field_updated', 'site_contact', 'Datos de contacto o dirección en sitio modificados');
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.task_history(task_id, actor_id, event_type, field_name, old_value, new_value)
    VALUES (NEW.id, v_actor, 'status_changed', 'status', OLD.status, NEW.status);
    IF NEW.status = 'completed' AND NEW.completed_at IS NULL THEN
      NEW.completed_at := now();
    END IF;
  END IF;

  IF OLD.priority IS DISTINCT FROM NEW.priority THEN
    INSERT INTO public.task_history(task_id, actor_id, event_type, field_name, old_value, new_value)
    VALUES (NEW.id, v_actor, 'priority_changed', 'priority', OLD.priority, NEW.priority);
  END IF;

  IF OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    INSERT INTO public.task_history(task_id, actor_id, event_type, field_name, old_value, new_value)
    VALUES (
      NEW.id, v_actor,
      CASE WHEN OLD.assigned_to IS NULL THEN 'assigned' ELSE 'reassigned' END,
      'assigned_to', OLD.assigned_to::TEXT, NEW.assigned_to::TEXT
    );
    NEW.assigned_at := now();
  END IF;

  IF OLD.resolution_notes IS DISTINCT FROM NEW.resolution_notes AND NEW.resolution_notes IS NOT NULL THEN
    INSERT INTO public.task_history(task_id, actor_id, event_type, field_name, note)
    VALUES (NEW.id, v_actor, 'note_added', 'resolution_notes', NEW.resolution_notes);
  END IF;

  IF OLD.client_signature_url IS DISTINCT FROM NEW.client_signature_url AND NEW.client_signature_url IS NOT NULL THEN
    INSERT INTO public.task_history(task_id, actor_id, event_type, field_name, new_value)
    VALUES (NEW.id, v_actor, 'signature_captured', 'client_signature_url', COALESCE(NEW.signer_name, 'Cliente'));
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
