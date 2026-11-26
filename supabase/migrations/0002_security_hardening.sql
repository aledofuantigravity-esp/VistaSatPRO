-- =============================================================================
-- VistaSatPRO — Migración 0002: Endurecimiento de Seguridad + Presencia
-- Ejecutar en Supabase SQL Editor sobre la base de datos existente.
-- Es idempotente: puede ejecutarse de forma segura aunque ya exista parte.
-- =============================================================================

-- ─── 1. PRESENCIA Y ÚLTIMA CONEXIÓN EN PROFILES ──────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_online    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- ─── 2. VERIFICACIÓN DE USUARIO ACTIVO EN RLS ────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    (SELECT is_active FROM public.profiles WHERE id = auth.uid() LIMIT 1),
    false
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_coordinator_or_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(
    public.is_active_user() AND public.current_user_role() IN ('admin', 'coordinator'),
    false
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ─── 3. REFORZAR POLÍTICAS RLS CON is_active_user() ──────────────────────────

-- PROFILES
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR public.is_coordinator_or_admin()
  );

DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE USING (
    (auth.uid() = id AND public.is_active_user())
    OR (public.is_active_user() AND public.current_user_role() = 'admin')
  )
  WITH CHECK (
    (public.is_active_user() AND public.current_user_role() = 'admin')
    OR (
      auth.uid() = id
      AND public.is_active_user()
      AND role = public.current_user_role()
      AND is_active = true
    )
  );

-- CUSTOMERS
DROP POLICY IF EXISTS "customers_select_auth" ON public.customers;
CREATE POLICY "customers_select_auth" ON public.customers
  FOR SELECT USING (public.is_active_user());

DROP POLICY IF EXISTS "customers_insert_auth" ON public.customers;
CREATE POLICY "customers_insert_auth" ON public.customers
  FOR INSERT WITH CHECK (public.is_active_user());

DROP POLICY IF EXISTS "customers_update_coord" ON public.customers;
CREATE POLICY "customers_update_coord" ON public.customers
  FOR UPDATE USING (
    public.is_coordinator_or_admin()
    OR (public.is_active_user() AND created_by = auth.uid())
  )
  WITH CHECK (
    public.is_coordinator_or_admin()
    OR (public.is_active_user() AND created_by = auth.uid())
  );

DROP POLICY IF EXISTS "customers_delete_coord" ON public.customers;
CREATE POLICY "customers_delete_coord" ON public.customers
  FOR DELETE USING (public.is_coordinator_or_admin());

-- TASKS
DROP POLICY IF EXISTS "tasks_select_rbac" ON public.tasks;
CREATE POLICY "tasks_select_rbac" ON public.tasks
  FOR SELECT USING (
    public.is_coordinator_or_admin()
    OR (
      public.is_active_user()
      AND (assigned_to = auth.uid() OR (assigned_to IS NULL AND status = 'pending'))
    )
  );

DROP POLICY IF EXISTS "tasks_insert_rbac" ON public.tasks;
CREATE POLICY "tasks_insert_rbac" ON public.tasks
  FOR INSERT WITH CHECK (
    public.is_coordinator_or_admin()
    OR (
      public.is_active_user()
      AND public.current_user_role() = 'technician'
      AND created_by = auth.uid()
      AND assigned_to = auth.uid()
      AND status = 'assigned'
    )
  );

DROP POLICY IF EXISTS "tasks_update_rbac" ON public.tasks;
CREATE POLICY "tasks_update_rbac" ON public.tasks
  FOR UPDATE USING (
    public.is_coordinator_or_admin()
    OR (
      public.is_active_user()
      AND (assigned_to = auth.uid() OR (assigned_to IS NULL AND status = 'pending'))
    )
  )
  WITH CHECK (
    public.is_coordinator_or_admin()
    OR (public.is_active_user() AND assigned_to = auth.uid())
  );

-- TASK_HISTORY
DROP POLICY IF EXISTS "history_select_rbac" ON public.task_history;
CREATE POLICY "history_select_rbac" ON public.task_history
  FOR SELECT USING (
    public.is_active_user()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_history.task_id
        AND (public.is_coordinator_or_admin() OR t.assigned_to = auth.uid() OR (t.assigned_to IS NULL AND t.status = 'pending'))
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
        AND (public.is_coordinator_or_admin() OR t.assigned_to = auth.uid())
    )
  );

-- ATTACHMENTS
DROP POLICY IF EXISTS "attachments_select_rbac" ON public.attachments;
CREATE POLICY "attachments_select_rbac" ON public.attachments
  FOR SELECT USING (
    public.is_active_user()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = attachments.task_id
        AND (public.is_coordinator_or_admin() OR t.assigned_to = auth.uid() OR (t.assigned_to IS NULL AND t.status = 'pending'))
    )
  );

DROP POLICY IF EXISTS "attachments_insert_rbac" ON public.attachments;
CREATE POLICY "attachments_insert_rbac" ON public.attachments
  FOR INSERT WITH CHECK (
    public.is_active_user()
    AND uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = attachments.task_id
        AND (public.is_coordinator_or_admin() OR t.assigned_to = auth.uid())
    )
  );

DROP POLICY IF EXISTS "attachments_delete_admin" ON public.attachments;
CREATE POLICY "attachments_delete_admin" ON public.attachments
  FOR DELETE USING (public.is_active_user() AND public.current_user_role() = 'admin');

-- PUSH SUBSCRIPTIONS
DROP POLICY IF EXISTS "push_subs_own" ON public.push_subscriptions;
CREATE POLICY "push_subs_own" ON public.push_subscriptions
  FOR ALL USING (public.is_active_user() AND user_id = auth.uid())
  WITH CHECK (public.is_active_user() AND user_id = auth.uid());

-- NOTIFICATIONS
DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (public.is_active_user() AND recipient_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE USING (public.is_active_user() AND recipient_id = auth.uid())
  WITH CHECK (public.is_active_user() AND recipient_id = auth.uid());

-- ─── 4. BLOQUEAR EDICIÓN DE CAMPOS MAESTROS DE TASKS POR TÉCNICOS (SEC-06) ────
CREATE OR REPLACE FUNCTION public.log_task_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := COALESCE(auth.uid(), NEW.created_by);

  -- Un técnico no puede alterar campos estructurales ni prioridad vía API directa
  IF auth.uid() IS NOT NULL AND public.current_user_role() = 'technician' THEN
    IF NEW.code IS DISTINCT FROM OLD.code
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.problem_desc IS DISTINCT FROM OLD.problem_desc
       OR NEW.priority IS DISTINCT FROM OLD.priority
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Un técnico no puede modificar código, cliente, avería ni prioridad del parte.';
    END IF;
    -- Si el parte ya estaba asignado a otro, tampoco puede reasignarlo
    IF OLD.assigned_to IS NOT NULL AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
      RAISE EXCEPTION 'Un técnico no puede reasignar un parte ya asignado.';
    END IF;
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

-- ─── 5. BUCKET PRIVADO + RESTRICCIÓN DE MIME Y TAMAÑO (SEC-05) ────────────────
UPDATE storage.buckets
SET public = false,
    file_size_limit = 5242880, -- 5 MB
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
WHERE id = 'task-attachments';

DROP POLICY IF EXISTS "storage_read_auth" ON storage.objects;
CREATE POLICY "storage_read_auth" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'task-attachments'
    AND public.is_active_user()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND (public.is_coordinator_or_admin() OR t.assigned_to = auth.uid() OR (t.assigned_to IS NULL AND t.status = 'pending'))
    )
  );

DROP POLICY IF EXISTS "storage_upload_auth" ON storage.objects;
CREATE POLICY "storage_upload_auth" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'task-attachments'
    AND public.is_active_user()
    AND EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id::text = (storage.foldername(name))[1]
        AND (public.is_coordinator_or_admin() OR t.assigned_to = auth.uid())
    )
  );

-- Permitir Realtime también sobre profiles (para estado en línea en /users)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
