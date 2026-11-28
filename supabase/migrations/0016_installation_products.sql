-- =============================================================================
-- VistaSatPRO — Migración 0016: Productos a Instalar en Partes de Instalación
-- Ejecutar en Supabase SQL Editor después de 0015_installation_interest_docs.sql.
-- Es idempotente: puede ejecutarse de forma segura múltiples veces.
-- =============================================================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS installation_products JSONB NOT NULL DEFAULT '[]'::jsonb;
