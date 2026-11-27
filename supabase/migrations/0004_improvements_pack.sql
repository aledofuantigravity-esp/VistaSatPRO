-- =============================================================================
-- VistaSatPRO — Migración 0004: SLA (due_date), Comentarios Internos y Adjuntos
-- Ejecutar en Supabase SQL Editor después de 0003_soft_delete_and_recovery.sql.
-- Es idempotente: puede ejecutarse de forma segura múltiples veces.
-- =============================================================================

-- ─── 1. FECHA LÍMITE / SLA EN TASKS (M2) ──────────────────────────────────────
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_due_date
  ON public.tasks (due_date ASC)
  WHERE deleted_at IS NULL AND due_date IS NOT NULL;

-- ─── 2. TABLA DE COMENTARIOS / CHAT INTERNO POR PARTE (M4) ────────────────────
CREATE TABLE IF NOT EXISTS public.task_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES public.profiles(id),
  body        TEXT NOT NULL CHECK (char_length(btrim(body)) > 0 AND char_length(body) <= 2000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id
  ON public.task_comments (task_id, created_at ASC);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "task_comments_select_rbac" ON public.task_comments;
CREATE POLICY "task_comments_select_rbac" ON public.task_comments
  FOR SELECT USING (
    public.is_active_user()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_comments.task_id
        AND (
          public.is_coordinator_or_admin()
          OR t.assigned_to = auth.uid()
          OR t.created_by = auth.uid()
          OR t.deleted_by = auth.uid()
          OR (t.assigned_to IS NULL AND t.status = 'pending')
        )
    )
  );

DROP POLICY IF EXISTS "task_comments_insert_rbac" ON public.task_comments;
CREATE POLICY "task_comments_insert_rbac" ON public.task_comments
  FOR INSERT WITH CHECK (
    public.is_active_user()
    AND author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_comments.task_id
        AND (
          public.is_coordinator_or_admin()
          OR t.assigned_to = auth.uid()
          OR t.created_by = auth.uid()
          OR (t.assigned_to IS NULL AND t.status = 'pending')
        )
    )
  );

-- Habilitar Realtime para chat interno instantáneo
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 3. PERMISOS DE ELIMINACIÓN DE FOTOS / ADJUNTOS (M7) ──────────────────────
DROP POLICY IF EXISTS "attachments_delete_admin" ON public.attachments;
DROP POLICY IF EXISTS "attachments_delete_rbac" ON public.attachments;
CREATE POLICY "attachments_delete_rbac" ON public.attachments
  FOR DELETE USING (
    public.is_active_user()
    AND (
      public.is_coordinator_or_admin()
      OR uploaded_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id = attachments.task_id
          AND t.assigned_to = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "storage_delete_auth" ON storage.objects;
CREATE POLICY "storage_delete_auth" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'task-attachments'
    AND public.is_active_user()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND (
          public.is_coordinator_or_admin()
          OR t.assigned_to = auth.uid()
          OR t.created_by = auth.uid()
        )
    )
  );

-- ─── 4. ACTUALIZAR TRIGGER DE AUDITORÍA CON DUE_DATE (M2) ──────────────────────
CREATE OR REPLACE FUNCTION public.log_task_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_actor UUID;
  v_old_customer TEXT;
  v_new_customer TEXT;
BEGIN
  v_actor := COALESCE(auth.uid(), NEW.deleted_by, NEW.created_by);

  IF NEW.code IS DISTINCT FROM OLD.code
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'El código correlativo y los metadatos de creación del parte son inmutables.';
  END IF;

  IF auth.uid() IS NOT NULL AND public.current_user_role() = 'technician' THEN
    IF OLD.assigned_to IS NOT NULL
       AND OLD.assigned_to IS DISTINCT FROM auth.uid()
       AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      RAISE EXCEPTION 'Un técnico no puede reasignar un parte ya asignado a otro técnico.';
    END IF;
    IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
      RAISE EXCEPTION 'Solo un coordinador o administrador puede modificar la fecha límite (SLA).';
    END IF;
  END IF;

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

  IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    INSERT INTO public.task_history(task_id, actor_id, event_type, field_name, old_value, new_value, note)
    VALUES (
      NEW.id, v_actor, 'field_updated', 'due_date',
      OLD.due_date::TEXT, NEW.due_date::TEXT,
      CASE
        WHEN NEW.due_date IS NULL THEN 'Fecha límite SLA eliminada'
        ELSE 'Fecha límite SLA fijada: ' || to_char(NEW.due_date AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY HH24:MI')
      END
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
