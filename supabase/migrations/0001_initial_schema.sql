-- =============================================================================
-- VistaSatPRO — Migración Inicial Completa (PostgreSQL / Supabase)
-- Arquitectura: Single-Tenant · RBAC · Audit Trail Inmutable · Web Push
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── 1. PERFILES DE USUARIO ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                 UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email              TEXT NOT NULL,
  full_name          TEXT NOT NULL,
  phone              TEXT,
  avatar_url         TEXT,
  role               TEXT NOT NULL DEFAULT 'technician'
                     CHECK (role IN ('admin', 'coordinator', 'technician')),
  -- Decisión 2: el coordinador/admin configura su nivel de notificaciones push
  notification_level TEXT NOT NULL DEFAULT 'assigned_or_created'
                     CHECK (notification_level IN ('all', 'assigned_or_created', 'none')),
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Función auxiliar SECURITY DEFINER para consultar el rol sin recursión RLS
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.is_coordinator_or_admin()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(public.current_user_role() IN ('admin', 'coordinator'), false);
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ─── 2. CLIENTES ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  tax_id        TEXT,
  address       TEXT,
  city          TEXT,
  postal_code   TEXT,
  country       TEXT NOT NULL DEFAULT 'ES',
  contact_name  TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customers_name ON public.customers(name);

-- ─── 3. PARTES DE TRABAJO (TASKS) ────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.task_code_seq START 1;

CREATE TABLE IF NOT EXISTS public.tasks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 TEXT UNIQUE NOT NULL,
  customer_id          UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,

  -- Contacto en sitio
  site_contact_name    TEXT,
  site_contact_phone   TEXT,
  site_address         TEXT,
  site_city            TEXT,

  -- Equipo y avería
  equipment_ref        TEXT,
  equipment_sn         TEXT,
  problem_desc         TEXT NOT NULL,

  -- Clasificación y estado
  priority             TEXT NOT NULL DEFAULT 'medium'
                       CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status               TEXT NOT NULL DEFAULT 'pending'
                       CHECK (status IN (
                         'pending', 'assigned', 'en_route',
                         'in_progress', 'on_hold', 'completed', 'cancelled'
                       )),

  -- Asignación
  assigned_to          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at          TIMESTAMPTZ,

  -- Resolución (Decisión 4: materials_used JSONB libre)
  resolution_notes     TEXT,
  materials_used       JSONB NOT NULL DEFAULT '[]'::jsonb,
  client_signature_url TEXT,
  signer_name          TEXT,
  pdf_url              TEXT,
  completed_at         TIMESTAMPTZ,
  estimated_duration   INTEGER,

  -- Auditoría de registro
  created_by           UUID NOT NULL REFERENCES public.profiles(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_status      ON public.tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority    ON public.tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_customer_id ON public.tasks(customer_id);
CREATE INDEX IF NOT EXISTS idx_tasks_created_at  ON public.tasks(created_at DESC);

-- ─── 4. HISTORIAL INMUTABLE (AUDIT TRAIL) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.task_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  actor_id    UUID NOT NULL REFERENCES public.profiles(id),
  event_type  TEXT NOT NULL CHECK (event_type IN (
    'created', 'status_changed', 'priority_changed', 'assigned',
    'reassigned', 'note_added', 'attachment_added', 'signature_captured',
    'pdf_generated', 'field_updated'
  )),
  field_name  TEXT,
  old_value   TEXT,
  new_value   TEXT,
  note        TEXT,
  metadata    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_history_task_id  ON public.task_history(task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_history_actor_id ON public.task_history(actor_id);

-- Inmutabilidad física a nivel de PostgreSQL
DROP RULE IF EXISTS no_update_task_history ON public.task_history;
CREATE RULE no_update_task_history AS ON UPDATE TO public.task_history DO INSTEAD NOTHING;

DROP RULE IF EXISTS no_delete_task_history ON public.task_history;
CREATE RULE no_delete_task_history AS ON DELETE TO public.task_history DO INSTEAD NOTHING;

-- ─── 5. ADJUNTOS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  uploaded_by  UUID NOT NULL REFERENCES public.profiles(id),
  storage_path TEXT NOT NULL,
  public_url   TEXT NOT NULL,
  file_name    TEXT NOT NULL,
  file_size    INTEGER,
  mime_type    TEXT,
  caption      TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachments_task_id ON public.attachments(task_id);

-- ─── 6. SUSCRIPCIONES WEB PUSH (VAPID) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint     TEXT NOT NULL,
  p256dh       TEXT NOT NULL,
  auth         TEXT NOT NULL,
  user_agent   TEXT,
  device_label TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  UNIQUE(user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subs_user_active ON public.push_subscriptions(user_id, is_active);

-- ─── 7. NOTIFICACIONES IN-APP ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id     UUID NOT NULL REFERENCES public.profiles(id),
  task_id      UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  type         TEXT NOT NULL CHECK (type IN (
    'task_created', 'task_assigned', 'task_updated',
    'status_changed', 'priority_changed', 'comment_added', 'reassigned'
  )),
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  is_read      BOOLEAN NOT NULL DEFAULT false,
  push_sent    BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  read_at      TIMESTAMPTZ,
  -- Garantía estricta anti-autonotificación en BD
  CONSTRAINT no_self_notification CHECK (recipient_id != actor_id)
);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient
  ON public.notifications(recipient_id, is_read, created_at DESC);

-- ─── 8. FUNCIONES Y TRIGGERS AUTOMÁTICOS ─────────────────────────────────────

-- Generar código correlativo único VS-YYYY-0001
CREATE OR REPLACE FUNCTION public.generate_task_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := 'VS-' || EXTRACT(YEAR FROM now())::TEXT || '-' ||
                LPAD(nextval('public.task_code_seq')::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_task_code ON public.tasks;
CREATE TRIGGER set_task_code
  BEFORE INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.generate_task_code();

-- Registrar creación de parte en historial
CREATE OR REPLACE FUNCTION public.log_task_created()
RETURNS TRIGGER AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := COALESCE(auth.uid(), NEW.created_by);
  INSERT INTO public.task_history(task_id, actor_id, event_type, new_value, note)
  VALUES (NEW.id, v_actor, 'created', NEW.code, 'Parte de trabajo abierto');

  IF NEW.assigned_to IS NOT NULL THEN
    INSERT INTO public.task_history(task_id, actor_id, event_type, field_name, new_value)
    VALUES (NEW.id, v_actor, 'assigned', 'assigned_to', NEW.assigned_to::TEXT);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_task_created ON public.tasks;
CREATE TRIGGER on_task_created
  AFTER INSERT ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_created();

-- Registrar actualizaciones de parte en historial
CREATE OR REPLACE FUNCTION public.log_task_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_actor UUID;
BEGIN
  v_actor := COALESCE(auth.uid(), NEW.created_by);

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

DROP TRIGGER IF EXISTS on_task_updated ON public.tasks;
CREATE TRIGGER on_task_updated
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.log_task_changes();

-- Sincronizar perfil al crear usuario en auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(COALESCE(NEW.email, 'usuario'), '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'role', 'technician'),
    NEW.raw_user_meta_data->>'phone'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── 9. ROW LEVEL SECURITY (RLS) ─────────────────────────────────────────────
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_history       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications      ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id OR public.is_coordinator_or_admin()
  );

CREATE POLICY "profiles_update_self" ON public.profiles
  FOR UPDATE USING (auth.uid() = id OR public.current_user_role() = 'admin')
  WITH CHECK (auth.uid() = id OR public.current_user_role() = 'admin');

-- CUSTOMERS
CREATE POLICY "customers_select_auth" ON public.customers
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "customers_insert_auth" ON public.customers
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "customers_update_coord" ON public.customers
  FOR UPDATE USING (public.is_coordinator_or_admin() OR created_by = auth.uid())
  WITH CHECK (public.is_coordinator_or_admin() OR created_by = auth.uid());

CREATE POLICY "customers_delete_coord" ON public.customers
  FOR DELETE USING (public.is_coordinator_or_admin());

-- TASKS
CREATE POLICY "tasks_select_rbac" ON public.tasks
  FOR SELECT USING (
    public.is_coordinator_or_admin()
    OR assigned_to = auth.uid()
    OR (assigned_to IS NULL AND status = 'pending')
  );

CREATE POLICY "tasks_insert_rbac" ON public.tasks
  FOR INSERT WITH CHECK (
    public.is_coordinator_or_admin()
    OR (
      public.current_user_role() = 'technician'
      AND created_by = auth.uid()
      AND assigned_to = auth.uid()
      AND status = 'assigned'
    )
  );

CREATE POLICY "tasks_update_rbac" ON public.tasks
  FOR UPDATE USING (
    public.is_coordinator_or_admin()
    OR assigned_to = auth.uid()
    OR (assigned_to IS NULL AND status = 'pending')
  )
  WITH CHECK (
    public.is_coordinator_or_admin()
    OR assigned_to = auth.uid()
  );

-- TASK_HISTORY
CREATE POLICY "history_select_rbac" ON public.task_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_history.task_id
        AND (public.is_coordinator_or_admin() OR t.assigned_to = auth.uid() OR (t.assigned_to IS NULL AND t.status = 'pending'))
    )
  );

CREATE POLICY "history_insert_auth" ON public.task_history
  FOR INSERT WITH CHECK (
    actor_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = task_history.task_id
        AND (public.is_coordinator_or_admin() OR t.assigned_to = auth.uid())
    )
  );

-- ATTACHMENTS
CREATE POLICY "attachments_select_rbac" ON public.attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = attachments.task_id
        AND (public.is_coordinator_or_admin() OR t.assigned_to = auth.uid() OR (t.assigned_to IS NULL AND t.status = 'pending'))
    )
  );

CREATE POLICY "attachments_insert_rbac" ON public.attachments
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid() AND
    EXISTS (
      SELECT 1 FROM public.tasks t
      WHERE t.id = attachments.task_id
        AND (public.is_coordinator_or_admin() OR t.assigned_to = auth.uid())
    )
  );

CREATE POLICY "attachments_delete_admin" ON public.attachments
  FOR DELETE USING (public.current_user_role() = 'admin');

-- PUSH SUBSCRIPTIONS
CREATE POLICY "push_subs_own" ON public.push_subscriptions
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- NOTIFICATIONS
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (recipient_id = auth.uid());

CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- ─── 10. REALTIME & STORAGE ──────────────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('task-attachments', 'task-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "storage_read_auth" ON storage.objects
  FOR SELECT USING (bucket_id = 'task-attachments' AND auth.role() = 'authenticated');

CREATE POLICY "storage_upload_auth" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'task-attachments' AND auth.role() = 'authenticated');
