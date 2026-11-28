-- =============================================================================
-- VistaSatPRO — Migración 0015: Documentos de Interés en Instalaciones
-- Ejecutar en Supabase SQL Editor después de 0014_technical_notes_and_resolution.sql.
-- Es idempotente: puede ejecutarse de forma segura múltiples veces.
-- =============================================================================

DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.attachments'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%attachment_kind%';

  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.attachments DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END $$;

ALTER TABLE public.attachments
  ADD CONSTRAINT attachments_kind_check CHECK (attachment_kind IN (
    'photo', 'installation_order', 'physical_work_order', 'interest_document'
  ));
