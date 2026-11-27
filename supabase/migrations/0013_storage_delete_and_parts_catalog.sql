-- =============================================================================
-- VistaSatPRO — Migración 0013: Storage Delete RBAC, Catálogo de Repuestos e Índices
-- Ejecutar en Supabase SQL Editor después de 0012_simplify_task_statuses.sql.
-- Es idempotente: puede ejecutarse de forma segura múltiples veces.
-- =============================================================================

-- ─── 1. ALINEAR PERMISOS DE BORRADO EN ATTACHMENTS Y STORAGE (3.1) ──────────
DROP POLICY IF EXISTS "attachments_delete_admin" ON public.attachments;
DROP POLICY IF EXISTS "attachments_delete_rbac" ON public.attachments;
CREATE POLICY "attachments_delete_rbac" ON public.attachments
  FOR DELETE USING (
    public.is_active_user()
    AND (
      public.is_coordinator_or_admin()
      OR (
        uploaded_by = auth.uid()
        AND EXISTS (
          SELECT 1 FROM public.tasks t
          WHERE t.id = attachments.task_id
            AND t.deleted_at IS NULL
        )
      )
    )
  );

DROP POLICY IF EXISTS "storage_delete_auth" ON storage.objects;
CREATE POLICY "storage_delete_auth" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'task-attachments'
    AND public.is_active_user()
    AND (
      public.is_coordinator_or_admin()
      OR EXISTS (
        SELECT 1 FROM public.attachments a
        JOIN public.tasks t ON t.id = a.task_id
        WHERE a.storage_path = name
          AND t.deleted_at IS NULL
          AND a.uploaded_by = auth.uid()
      )
      OR EXISTS (
        SELECT 1 FROM public.tasks t
        WHERE t.id::text = (storage.foldername(name))[1]
          AND t.deleted_at IS NULL
          AND t.assigned_to = auth.uid()
      )
    )
  );

-- ─── 2. CATÁLOGO DE REPUESTOS FRECUENTES (2.6) ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.parts_catalog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL CHECK (char_length(btrim(name)) > 0 AND char_length(name) <= 180),
  ref         TEXT CHECK (ref IS NULL OR char_length(ref) <= 80),
  category    TEXT CHECK (category IS NULL OR char_length(category) <= 80),
  unit_cost   NUMERIC(10, 2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  notes       TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_parts_catalog_name ON public.parts_catalog (name);
CREATE INDEX IF NOT EXISTS idx_parts_catalog_ref ON public.parts_catalog (ref);

ALTER TABLE public.parts_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "parts_catalog_select_auth" ON public.parts_catalog;
CREATE POLICY "parts_catalog_select_auth" ON public.parts_catalog
  FOR SELECT USING (public.is_active_user());

DROP POLICY IF EXISTS "parts_catalog_write_coord" ON public.parts_catalog;
CREATE POLICY "parts_catalog_write_coord" ON public.parts_catalog
  FOR ALL USING (public.is_coordinator_or_admin())
  WITH CHECK (public.is_coordinator_or_admin());

-- ─── 3. ÍNDICES DE RENDIMIENTO PARA PAGINACIÓN Y CONTEOS POR CLIENTE (1.4) ────
CREATE INDEX IF NOT EXISTS idx_tasks_active_created
  ON public.tasks (created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_customer_active
  ON public.tasks (customer_id, status)
  WHERE deleted_at IS NULL;
