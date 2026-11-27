-- =============================================================================
-- VistaSatPRO — Migración 0010: Parte de Trabajo Físico al Finalizar Instalación
-- Ejecutar en Supabase SQL Editor después de 0009_admin_only_notification_prefs.sql.
-- Es idempotente: puede ejecutarse de forma segura múltiples veces.
-- =============================================================================

-- ─── 1. NUEVA COLUMNA EN TASKS ────────────────────────────────────────────────
-- NULL  = no respondido / instalación abierta
-- TRUE  = parte de trabajo físico adjuntado
-- FALSE = finalizado sin adjuntar parte de trabajo físico
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS physical_work_order_attached BOOLEAN DEFAULT NULL;

-- ─── 2. AMPLIAR CONSTRAINT DE ATTACHMENT_KIND EN ATTACHMENTS ─────────────────
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
    'photo', 'installation_order', 'physical_work_order'
  ));

-- ─── 3. ACTUALIZAR TRIGGER DE AUDITORÍA CON TRAZABILIDAD DE PARTE FÍSICO ─────
CREATE OR REPLACE FUNCTION public.log_task_changes()
RETURNS TRIGGER AS $$
DECLARE
  v_actor UUID;
  v_old_customer TEXT;
  v_new_customer TEXT;
BEGIN
  v_actor := COALESCE(auth.uid(), NEW.deleted_by, NEW.created_by);

  -- Metadatos estructurales inmutables en cualquier rol
  IF NEW.code IS DISTINCT FROM OLD.code
     OR NEW.created_by IS DISTINCT FROM OLD.created_by
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'El código correlativo y los metadatos de creación del parte son inmutables.';
  END IF;

  -- El tipo de tarea no debe mutarse una vez creado el parte
  IF NEW.task_type IS DISTINCT FROM OLD.task_type THEN
    RAISE EXCEPTION 'El tipo de tarea del parte no puede modificarse una vez creado.';
  END IF;

  -- Sanitización básica de URL de firma digital (solo ruta de bucket, HTTPS o PNG base64)
  IF NEW.client_signature_url IS NOT NULL
     AND NEW.client_signature_url !~ '^(https://|data:image/(png|jpeg|webp);base64,|[a-zA-Z0-9_-]+/)' THEN
    RAISE EXCEPTION 'Formato de firma digital no permitido.';
  END IF;

  -- En Incidencia CXC, el nº de serie es obligatorio al cerrar (completar)
  IF NEW.task_type = 'cxc_incident'
     AND NEW.deleted_at IS NULL
     AND NEW.status = 'completed'
     AND (NEW.equipment_sn IS NULL OR btrim(NEW.equipment_sn) = '') THEN
    RAISE EXCEPTION 'Para cerrar una Incidencia CXC es obligatorio indicar el nº de serie.';
  END IF;

  -- Restricciones adicionales para el rol Técnico por API directa
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
          THEN 'Tarea enviada a la papelera. Motivo: ' || btrim(NEW.deletion_reason)
        ELSE 'Tarea enviada a la papelera'
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
      'Tarea restaurada desde la papelera'
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
      'Descripción modificada'
    );
  END IF;

  IF OLD.scheduled_date IS DISTINCT FROM NEW.scheduled_date THEN
    INSERT INTO public.task_history(task_id, actor_id, event_type, field_name, old_value, new_value, note)
    VALUES (
      NEW.id, v_actor, 'field_updated', 'scheduled_date',
      OLD.scheduled_date::TEXT, NEW.scheduled_date::TEXT,
      CASE
        WHEN NEW.scheduled_date IS NULL THEN 'Fecha acordada de instalación eliminada'
        ELSE 'Fecha acordada de instalación: ' || to_char(NEW.scheduled_date AT TIME ZONE 'Europe/Madrid', 'DD/MM/YYYY HH24:MI')
      END
    );
  END IF;

  IF OLD.merchandise_check_done IS DISTINCT FROM NEW.merchandise_check_done THEN
    NEW.merchandise_checked_at := now();
    NEW.merchandise_checked_by := v_actor;
    INSERT INTO public.task_history(task_id, actor_id, event_type, field_name, old_value, new_value, note)
    VALUES (
      NEW.id, v_actor, 'field_updated', 'merchandise_check_done',
      OLD.merchandise_check_done::TEXT, NEW.merchandise_check_done::TEXT,
      CASE
        WHEN NEW.merchandise_check_done IS TRUE THEN 'Cotejo de mercancía: REALIZADO'
        WHEN NEW.merchandise_check_done IS FALSE THEN 'Cotejo de mercancía: NO REALIZADO'
        ELSE 'Cotejo de mercancía: Pendiente'
      END
    );
  END IF;

  IF OLD.physical_work_order_attached IS DISTINCT FROM NEW.physical_work_order_attached THEN
    INSERT INTO public.task_history(task_id, actor_id, event_type, field_name, old_value, new_value, note)
    VALUES (
      NEW.id, v_actor, 'field_updated', 'physical_work_order_attached',
      OLD.physical_work_order_attached::TEXT, NEW.physical_work_order_attached::TEXT,
      CASE
        WHEN NEW.physical_work_order_attached IS TRUE THEN 'Parte de trabajo físico adjuntado'
        WHEN NEW.physical_work_order_attached IS FALSE THEN 'Instalación finalizada sin adjuntar parte de trabajo físico'
        ELSE 'Estado de parte de trabajo físico restablecido'
      END
    );
  END IF;

  IF OLD.meter_bw IS DISTINCT FROM NEW.meter_bw OR OLD.meter_color IS DISTINCT FROM NEW.meter_color THEN
    INSERT INTO public.task_history(task_id, actor_id, event_type, field_name, old_value, new_value, note)
    VALUES (
      NEW.id, v_actor, 'field_updated', 'meters',
      COALESCE(OLD.meter_bw::TEXT, '—') || ' / ' || COALESCE(OLD.meter_color::TEXT, '—'),
      COALESCE(NEW.meter_bw::TEXT, '—') || ' / ' || COALESCE(NEW.meter_color::TEXT, '—'),
      'Contadores actualizados — B/N: ' || COALESCE(NEW.meter_bw::TEXT, '—') || ' · Color: ' || COALESCE(NEW.meter_color::TEXT, '—')
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
