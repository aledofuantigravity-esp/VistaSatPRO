import { NextResponse } from 'next/server';
import { hydrateTasks } from '@/lib/demo-seed';
import { validatePasswordStrength } from '@/lib/security';
import {
  normalizeNotificationPreferences,
  syncLegacyNotificationLevel,
} from '@/lib/notification-preferences';
import { isDemoModeAllowed } from '@/lib/supabase/config';
import {
  dispatchServerDemoNotifications,
  getServerDemoDb,
  getServerDemoVapidPublicKey,
  resetServerDemoDb,
  saveServerDemoDb,
  sendTestPushForUser,
} from '@/lib/server-demo-db';
import {
  TASK_PRIORITY_META,
  TASK_TYPE_META,
  getTaskStatusLabel,
  normalizeTaskStatus,
  type Attachment,
  type AttachmentKind,
  type Customer,
  type MaterialItem,
  type PartCatalogItem,
  type Profile,
  type PushSubscriptionRecord,
  type Task,
  type TaskComment,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
  type UserRole,
} from '@/types/database';

export async function GET(request: Request) {
  if (!isDemoModeAllowed()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  const { searchParams } = new URL(request.url);
  const resource = searchParams.get('resource');
  const userId = searchParams.get('userId');
  const taskId = searchParams.get('taskId');

  const state = getServerDemoDb();

  switch (resource) {
    case 'vapid_public_key': {
      return NextResponse.json({ publicKey: getServerDemoVapidPublicKey() });
    }

    case 'revision': {
      return NextResponse.json({ revision: state.revision || 1 });
    }

    case 'profiles': {
      return NextResponse.json({ profiles: state.profiles });
    }

    case 'profile': {
      const profile = state.profiles.find((p) => p.id === userId && p.is_active) || null;
      return NextResponse.json({ profile });
    }

    case 'customers': {
      const customers = [...state.customers].sort((a, b) => a.name.localeCompare(b.name));
      return NextResponse.json({ customers });
    }

    case 'customer_task_counts': {
      const counts: Record<string, { total: number; active: number }> = {};
      for (const t of state.tasks) {
        if (t.deleted_at) continue;
        const entry = counts[t.customer_id] || { total: 0, active: 0 };
        entry.total += 1;
        const st = normalizeTaskStatus(t.status);
        if (st !== 'completed' && st !== 'cancelled') {
          entry.active += 1;
        }
        counts[t.customer_id] = entry;
      }
      return NextResponse.json({ counts, revision: state.revision });
    }

    case 'parts_catalog': {
      const parts = [...(state.partsCatalog || [])].sort((a, b) =>
        a.name.localeCompare(b.name)
      );
      return NextResponse.json({ parts, revision: state.revision });
    }

    case 'tasks': {
      const viewer = state.profiles.find((p) => p.id === userId);
      if (!viewer) return NextResponse.json({ tasks: [] });
      const includeDeleted = searchParams.get('includeDeleted') === '1';
      const isCoord = viewer.role === 'admin' || viewer.role === 'coordinator';
      const filtered = state.tasks.filter((t) => {
        if (!includeDeleted && t.deleted_at) return false;
        if (isCoord) return true;
        return (
          t.assigned_to === viewer.id ||
          t.created_by === viewer.id ||
          t.deleted_by === viewer.id ||
          (!t.assigned_to && t.status === 'pending')
        );
      });
      const tasks = hydrateTasks(state, filtered).sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      );
      return NextResponse.json({ tasks, revision: state.revision });
    }

    case 'task_detail': {
      const rawTask = state.tasks.find((t) => t.id === taskId);
      if (!rawTask) {
        return NextResponse.json({ task: null, history: [], attachments: [], comments: [] });
      }
      const [task] = hydrateTasks(state, [rawTask]);
      const history = state.history
        .filter((h) => h.task_id === taskId)
        .map((h) => ({
          ...h,
          actor: state.profiles.find((p) => p.id === h.actor_id),
        }))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const attachments = state.attachments
        .filter((a) => a.task_id === taskId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      const comments = (state.comments || [])
        .filter((c) => c.task_id === taskId)
        .map((c) => ({
          ...c,
          author: state.profiles.find((p) => p.id === c.author_id),
        }))
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
      return NextResponse.json({ task, history, attachments, comments, revision: state.revision });
    }

    case 'search': {
      const q = (searchParams.get('q') || '').trim().toLowerCase();
      const viewer = state.profiles.find((p) => p.id === userId);
      if (!viewer || q.length < 2) {
        return NextResponse.json({ tasks: [], customers: [], profiles: [] });
      }
      const isCoord = viewer.role === 'admin' || viewer.role === 'coordinator';
      const visibleTasks = hydrateTasks(
        state,
        state.tasks.filter((t) => {
          if (t.deleted_at) return false;
          if (isCoord) return true;
          return (
            t.assigned_to === viewer.id ||
            t.created_by === viewer.id ||
            (!t.assigned_to && t.status === 'pending')
          );
        })
      );

      const tasks = visibleTasks
        .filter((t) =>
          [
            t.code,
            t.customer?.name,
            t.equipment_ref,
            t.equipment_sn,
            t.problem_desc,
            t.site_address,
            t.site_city,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)
        )
        .slice(0, 8);

      const customers = state.customers
        .filter((c) =>
          [c.name, c.tax_id, c.city, c.contact_name, c.address]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)
        )
        .slice(0, 6);

      const profiles = isCoord
        ? state.profiles
            .filter((p) =>
              [p.full_name, p.email, p.phone]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(q)
            )
            .slice(0, 5)
        : [];

      return NextResponse.json({ tasks, customers, profiles });
    }

    case 'notifications': {
      if (!userId) return NextResponse.json({ notifications: [] });
      const notifications = state.notifications
        .filter((n) => n.recipient_id === userId && n.actor_id !== userId)
        .map((n) => ({
          ...n,
          actor: state.profiles.find((p) => p.id === n.actor_id),
        }))
        .sort((a, b) => b.created_at.localeCompare(a.created_at));
      return NextResponse.json({ notifications, revision: state.revision });
    }

    case 'push_subscriptions': {
      if (!userId) return NextResponse.json({ subscriptions: [] });
      const subscriptions = state.pushSubscriptions.filter(
        (s) => s.user_id === userId && s.is_active
      );
      return NextResponse.json({ subscriptions });
    }

    default:
      return NextResponse.json({ error: 'Recurso no válido' }, { status: 400 });
  }
}

export async function POST(request: Request) {
  if (!isDemoModeAllowed()) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  try {
    const body = await request.json();
    const { action } = body as { action: string };
    const state = getServerDemoDb();
    const nowIso = new Date().toISOString();

    switch (action) {
      case 'login': {
        const { email, password } = body as { email: string; password: string };
        const normEmail = email.trim().toLowerCase();
        const user = state.profiles.find(
          (p) => p.email.toLowerCase() === normEmail && p.is_active
        );
        if (!user || state.passwords[normEmail] !== password) {
          return NextResponse.json(
            { error: 'Credenciales incorrectas o cuenta inactiva.' },
            { status: 401 }
          );
        }
        user.is_online = true;
        user.last_seen_at = nowIso;
        saveServerDemoDb(state);
        return NextResponse.json({ profile: user });
      }

      case 'create_user': {
        const { email, password, full_name, phone, role } = body.payload as {
          email: string;
          password: string;
          full_name: string;
          phone?: string;
          role: UserRole;
        };
        if (state.profiles.some((p) => p.email.toLowerCase() === email.toLowerCase())) {
          return NextResponse.json(
            { error: 'Ya existe un usuario con ese correo electrónico.' },
            { status: 400 }
          );
        }
        const newProfile: Profile = {
          id: `user-${Date.now()}`,
          email: email.trim(),
          full_name: full_name.trim(),
          phone: phone?.trim() || null,
          avatar_url: null,
          role,
          notification_level: 'assigned_or_created',
          is_active: true,
          created_at: nowIso,
          updated_at: nowIso,
        };
        state.profiles.push(newProfile);
        state.passwords[newProfile.email.toLowerCase()] = password;
        saveServerDemoDb(state);
        return NextResponse.json({ profile: newProfile });
      }

      case 'update_profile': {
        const { profileId, patch, actorId } = body as {
          profileId: string;
          patch: Partial<Profile>;
          actorId?: string;
        };
        if (
          actorId &&
          (patch.notification_preferences !== undefined ||
            patch.notification_level !== undefined ||
            patch.role !== undefined ||
            patch.is_active !== undefined)
        ) {
          const actor = state.profiles.find((p) => p.id === actorId && p.is_active);
          if (!actor || actor.role !== 'admin') {
            return NextResponse.json(
              {
                error:
                  'Solo un Administrador puede modificar preferencias de notificaciones, Push, rol o estado.',
              },
              { status: 403 }
            );
          }
        }
        const idx = state.profiles.findIndex((p) => p.id === profileId);
        if (idx === -1) {
          return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
        }
        const current = state.profiles[idx];
        const nextRole = (patch.role || current.role) as UserRole;
        const nextLevel = patch.notification_level || current.notification_level;
        const nextPrefs = patch.notification_preferences
          ? normalizeNotificationPreferences(patch.notification_preferences, nextRole, nextLevel)
          : patch.notification_level
          ? normalizeNotificationPreferences(
              {
                ...normalizeNotificationPreferences(
                  current.notification_preferences,
                  nextRole,
                  current.notification_level
                ),
                scope:
                  patch.notification_level === 'none'
                    ? 'none'
                    : patch.notification_level === 'all'
                    ? 'all'
                    : 'assigned_or_created',
                in_app_enabled: patch.notification_level !== 'none',
                push_enabled: patch.notification_level !== 'none',
              },
              nextRole,
              patch.notification_level
            )
          : current.notification_preferences;

        state.profiles[idx] = {
          ...current,
          ...patch,
          ...(nextPrefs ? { notification_preferences: nextPrefs } : {}),
          ...(nextPrefs ? { notification_level: syncLegacyNotificationLevel(nextPrefs) } : {}),
          updated_at: nowIso,
        };
        saveServerDemoDb(state);
        return NextResponse.json({ profile: state.profiles[idx] });
      }

      case 'create_customer': {
        const payload = body.payload as Omit<
          Customer,
          'id' | 'created_at' | 'updated_at' | 'is_active'
        >;
        const created: Customer = {
          ...payload,
          id: `cust-${Date.now()}`,
          country: payload.country || 'ES',
          is_active: true,
          created_at: nowIso,
          updated_at: nowIso,
        };
        state.customers.push(created);
        saveServerDemoDb(state);
        return NextResponse.json({ customer: created });
      }

      case 'update_customer': {
        const { customerId, patch } = body as {
          customerId: string;
          patch: Partial<Customer>;
        };
        const idx = state.customers.findIndex((c) => c.id === customerId);
        if (idx === -1) {
          return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 });
        }
        state.customers[idx] = { ...state.customers[idx], ...patch, updated_at: nowIso };
        saveServerDemoDb(state);
        return NextResponse.json({ customer: state.customers[idx] });
      }

      case 'create_part_catalog': {
        const payload = body.payload as {
          name: string;
          ref?: string | null;
          category?: string | null;
          unit_cost?: number | null;
          notes?: string | null;
          created_by?: string | null;
        };
        if (!Array.isArray(state.partsCatalog)) state.partsCatalog = [];
        const created: PartCatalogItem = {
          id: `part-${Date.now()}`,
          name: payload.name.trim(),
          ref: payload.ref?.trim() || null,
          category: payload.category?.trim() || null,
          unit_cost: payload.unit_cost ?? null,
          notes: payload.notes?.trim() || null,
          is_active: true,
          created_by: payload.created_by || null,
          created_at: nowIso,
          updated_at: nowIso,
        };
        state.partsCatalog.push(created);
        saveServerDemoDb(state);
        return NextResponse.json({ part: created });
      }

      case 'update_part_catalog': {
        const { partId, patch } = body as {
          partId: string;
          patch: Partial<PartCatalogItem>;
        };
        if (!Array.isArray(state.partsCatalog)) state.partsCatalog = [];
        const idx = state.partsCatalog.findIndex((p) => p.id === partId);
        if (idx === -1) {
          return NextResponse.json({ error: 'Repuesto no encontrado' }, { status: 404 });
        }
        state.partsCatalog[idx] = { ...state.partsCatalog[idx], ...patch, updated_at: nowIso };
        saveServerDemoDb(state);
        return NextResponse.json({ part: state.partsCatalog[idx] });
      }

      case 'delete_part_catalog': {
        const { partId } = body as { partId: string };
        if (!Array.isArray(state.partsCatalog)) state.partsCatalog = [];
        state.partsCatalog = state.partsCatalog.filter((p) => p.id !== partId);
        saveServerDemoDb(state);
        return NextResponse.json({ ok: true });
      }

      case 'bulk_update_tasks': {
        const { taskIds, patch, actorId } = body as {
          taskIds: string[];
          patch: { assigned_to?: string | null; priority?: TaskPriority };
          actorId: string;
        };
        const actor = state.profiles.find((p) => p.id === actorId);
        let updatedCount = 0;

        for (const tid of taskIds) {
          const idx = state.tasks.findIndex((t) => t.id === tid && !t.deleted_at);
          if (idx === -1) continue;
          const prev = state.tasks[idx];
          const next: Task = { ...prev, ...patch, updated_at: nowIso };

          if (patch.assigned_to !== undefined && patch.assigned_to !== prev.assigned_to) {
            next.assigned_at = patch.assigned_to ? nowIso : null;
            const newTech = patch.assigned_to
              ? state.profiles.find((p) => p.id === patch.assigned_to)?.full_name || patch.assigned_to
              : 'Sin asignar';
            state.history.push({
              id: `hist-${Date.now()}-${updatedCount}-a`,
              task_id: tid,
              actor_id: actorId,
              event_type: prev.assigned_to ? 'reassigned' : 'assigned',
              field_name: 'assigned_to',
              old_value: prev.assigned_to,
              new_value: newTech,
              note: `Asignación en lote: ${newTech}`,
              metadata: {},
              created_at: nowIso,
            });
          }

          if (patch.priority && patch.priority !== prev.priority) {
            state.history.push({
              id: `hist-${Date.now()}-${updatedCount}-p`,
              task_id: tid,
              actor_id: actorId,
              event_type: 'priority_changed',
              field_name: 'priority',
              old_value: prev.priority,
              new_value: patch.priority,
              note: `Prioridad en lote: ${TASK_PRIORITY_META[patch.priority].label}`,
              metadata: {},
              created_at: nowIso,
            });
          }

          state.tasks[idx] = next;
          updatedCount++;

          await dispatchServerDemoNotifications(state, {
            task: next,
            actorId,
            type:
              patch.assigned_to !== undefined && patch.assigned_to !== prev.assigned_to
                ? 'reassigned'
                : 'priority_changed',
            title: `Parte ${prev.code} actualizado en lote`,
            body: `${actor?.full_name || 'Coordinación'} actualizó ${prev.code}.`,
          });
        }

        saveServerDemoDb(state);
        return NextResponse.json({ ok: true, updatedCount });
      }

      case 'create_task': {
        const { payload, actorId } = body as {
          payload: {
            task_type?: TaskType;
            customer_id: string;
            site_contact_name?: string;
            site_contact_phone?: string;
            site_address?: string;
            site_city?: string;
            equipment_ref?: string;
            equipment_sn?: string;
            problem_desc: string;
            priority: TaskPriority;
            assigned_to?: string | null;
            estimated_duration?: number | null;
            due_date?: string | null;
            scheduled_date?: string | null;
            merchandise_check_done?: boolean | null;
            merchandise_check_notes?: string | null;
            meter_bw?: number | null;
            meter_color?: number | null;
            materials_used?: MaterialItem[];
          };
          actorId: string;
        };

        const effectiveType: TaskType = payload.task_type || 'rma_incident';
        const actor = state.profiles.find((p) => p.id === actorId);
        // Regla de negocio: si un técnico crea una tarea, siempre se le asigna automáticamente;
        // si la crea Admin/Coordinador sin especificar técnico y solo hay 1 técnico activo, también se le asigna.
        let effectiveAssignedTo: string | null =
          actor?.role === 'technician' ? actorId : payload.assigned_to || null;
        if (!effectiveAssignedTo) {
          const activeTechs = state.profiles.filter(
            (p) => p.role === 'technician' && p.is_active
          );
          if (activeTechs.length === 1) {
            effectiveAssignedTo = activeTechs[0].id;
          }
        }

        const year = new Date().getFullYear();
        const code = `VS-${year}-${String(state.seqCounter).padStart(4, '0')}`;
        state.seqCounter += 1;

        const newTask: Task = {
          id: `task-${Date.now()}`,
          code,
          task_type: effectiveType,
          customer_id: payload.customer_id,
          site_contact_name: payload.site_contact_name || null,
          site_contact_phone: payload.site_contact_phone || null,
          site_address: payload.site_address || null,
          site_city: payload.site_city || null,
          equipment_ref: payload.equipment_ref || null,
          equipment_sn: payload.equipment_sn || null,
          problem_desc: payload.problem_desc,
          priority: payload.priority,
          status: 'pending',
          assigned_to: effectiveAssignedTo,
          assigned_at: effectiveAssignedTo ? nowIso : null,
          resolution_notes: null,
          materials_used: Array.isArray(payload.materials_used) ? payload.materials_used : [],
          scheduled_date: payload.scheduled_date || null,
          merchandise_check_done:
            payload.merchandise_check_done !== undefined ? payload.merchandise_check_done : null,
          merchandise_check_notes: payload.merchandise_check_notes || null,
          meter_bw: payload.meter_bw ?? null,
          meter_color: payload.meter_color ?? null,
          client_signature_url: null,
          signer_name: null,
          pdf_url: null,
          completed_at: null,
          estimated_duration: payload.estimated_duration || null,
          due_date: payload.due_date || null,
          created_by: actorId,
          created_at: nowIso,
          updated_at: nowIso,
        };
        state.tasks.unshift(newTask);

        state.history.push({
          id: `hist-${Date.now()}-1`,
          task_id: newTask.id,
          actor_id: actorId,
          event_type: 'created',
          field_name: null,
          old_value: null,
          new_value: code,
          note: `${TASK_TYPE_META[effectiveType].label} creada`,
          metadata: { task_type: effectiveType },
          created_at: nowIso,
        });

        if (newTask.assigned_to) {
          const assignee = state.profiles.find((p) => p.id === newTask.assigned_to);
          state.history.push({
            id: `hist-${Date.now()}-2`,
            task_id: newTask.id,
            actor_id: actorId,
            event_type: 'assigned',
            field_name: 'assigned_to',
            old_value: null,
            new_value: assignee?.full_name || newTask.assigned_to,
            note: `Asignado a ${assignee?.full_name || 'técnico'}`,
            metadata: {},
            created_at: nowIso,
          });
        }

        const customer = state.customers.find((c) => c.id === newTask.customer_id);
        await dispatchServerDemoNotifications(state, {
          task: newTask,
          actorId,
          type: newTask.assigned_to ? 'task_assigned' : 'task_created',
          title: newTask.assigned_to
            ? `Nuevo parte asignado: ${code}`
            : `Parte disponible sin asignar: ${code}`,
          body: `${customer?.name || 'Cliente'} — ${
            payload.equipment_ref || payload.problem_desc.slice(0, 60)
          }`,
          isNewTask: true,
        });

        saveServerDemoDb(state);
        return NextResponse.json({ task: hydrateTasks(state, [newTask])[0] });
      }

      case 'update_task_status': {
        const { taskId, status, actorId } = body as {
          taskId: string;
          status: TaskStatus;
          actorId: string;
        };
        const idx = state.tasks.findIndex((t) => t.id === taskId);
        if (idx === -1) {
          return NextResponse.json({ error: 'Parte no encontrado' }, { status: 404 });
        }
        const prev = state.tasks[idx];
        const actor = state.profiles.find((p) => p.id === actorId);
        const normalizedStatus = normalizeTaskStatus(status);
        if (normalizeTaskStatus(prev.status) === normalizedStatus) {
          return NextResponse.json({ ok: true });
        }
        if (
          normalizedStatus === 'completed' &&
          (prev.task_type || 'rma_incident') === 'cxc_incident' &&
          !prev.equipment_sn?.trim()
        ) {
          return NextResponse.json(
            { error: 'Para cerrar una Incidencia CXC es obligatorio indicar el nº de serie.' },
            { status: 400 }
          );
        }

        state.tasks[idx] = {
          ...prev,
          status: normalizedStatus,
          completed_at:
            normalizedStatus === 'completed' ? prev.completed_at || nowIso : prev.completed_at,
          updated_at: nowIso,
        };

        state.history.push({
          id: `hist-${Date.now()}`,
          task_id: taskId,
          actor_id: actorId,
          event_type: 'status_changed',
          field_name: 'status',
          old_value: normalizeTaskStatus(prev.status),
          new_value: normalizedStatus,
          note: null,
          metadata: {},
          created_at: nowIso,
        });

        await dispatchServerDemoNotifications(state, {
          task: state.tasks[idx],
          actorId,
          type: 'status_changed',
          title: `Estado actualizado en ${prev.code}`,
          body: `${actor?.full_name || 'Usuario'} cambió el estado a "${getTaskStatusLabel(
            normalizedStatus
          )}".`,
        });

        saveServerDemoDb(state);
        return NextResponse.json({ ok: true });
      }

      case 'add_task_note': {
        const { taskId, note, actorId } = body as {
          taskId: string;
          note: string;
          actorId: string;
        };
        const idx = state.tasks.findIndex((t) => t.id === taskId);
        if (idx === -1) {
          return NextResponse.json({ error: 'Parte no encontrado' }, { status: 404 });
        }
        const cleanNote = note.trim();
        const actor = state.profiles.find((p) => p.id === actorId);

        state.tasks[idx] = {
          ...state.tasks[idx],
          resolution_notes: cleanNote,
          updated_at: nowIso,
        };
        state.history.push({
          id: `hist-${Date.now()}`,
          task_id: taskId,
          actor_id: actorId,
          event_type: 'note_added',
          field_name: 'resolution_notes',
          old_value: null,
          new_value: null,
          note: cleanNote,
          metadata: {},
          created_at: nowIso,
        });

        await dispatchServerDemoNotifications(state, {
          task: state.tasks[idx],
          actorId,
          type: 'comment_added',
          title: `Nueva nota en ${state.tasks[idx].code}`,
          body: `${actor?.full_name || 'Usuario'}: "${cleanNote.slice(0, 90)}"`,
        });

        saveServerDemoDb(state);
        return NextResponse.json({ ok: true });
      }

      case 'update_task_fields': {
        const { taskId, patch, actorId } = body as {
          taskId: string;
          patch: Partial<Task> & { materials_used?: MaterialItem[] };
          actorId: string;
        };
        const idx = state.tasks.findIndex((t) => t.id === taskId);
        if (idx === -1) {
          return NextResponse.json({ error: 'Parte no encontrado' }, { status: 404 });
        }

        const prev = state.tasks[idx];
        const actor = state.profiles.find((p) => p.id === actorId);
        const next: Task = { ...prev, ...patch, updated_at: nowIso };
        if (
          next.status === 'completed' &&
          (next.task_type || 'rma_incident') === 'cxc_incident' &&
          !next.equipment_sn?.trim()
        ) {
          return NextResponse.json(
            { error: 'Para cerrar una Incidencia CXC es obligatorio indicar el nº de serie.' },
            { status: 400 }
          );
        }

        if (patch.assigned_to !== undefined && patch.assigned_to !== prev.assigned_to) {
          next.assigned_at = patch.assigned_to ? nowIso : null;
        }
        if (patch.status) {
          next.status = normalizeTaskStatus(patch.status);
        }
        if (patch.status === 'completed' && !next.completed_at) {
          next.completed_at = nowIso;
        }
        state.tasks[idx] = next;

        if (patch.priority && patch.priority !== prev.priority) {
          state.history.push({
            id: `hist-${Date.now()}-p`,
            task_id: taskId,
            actor_id: actorId,
            event_type: 'priority_changed',
            field_name: 'priority',
            old_value: prev.priority,
            new_value: patch.priority,
            note: `Prioridad cambiada a ${TASK_PRIORITY_META[patch.priority].label}`,
            metadata: {},
            created_at: nowIso,
          });
        }

        if (patch.assigned_to !== undefined && patch.assigned_to !== prev.assigned_to) {
          const oldTech = prev.assigned_to
            ? state.profiles.find((p) => p.id === prev.assigned_to)?.full_name ||
              prev.assigned_to
            : null;
          const newTech = patch.assigned_to
            ? state.profiles.find((p) => p.id === patch.assigned_to)?.full_name ||
              patch.assigned_to
            : 'Sin asignar';
          state.history.push({
            id: `hist-${Date.now()}-a`,
            task_id: taskId,
            actor_id: actorId,
            event_type: prev.assigned_to ? 'reassigned' : 'assigned',
            field_name: 'assigned_to',
            old_value: oldTech,
            new_value: newTech,
            note: `Asignación: ${newTech}`,
            metadata: {},
            created_at: nowIso,
          });
        }

        if (patch.materials_used) {
          state.history.push({
            id: `hist-${Date.now()}-m`,
            task_id: taskId,
            actor_id: actorId,
            event_type: 'field_updated',
            field_name: 'materials_used',
            old_value: null,
            new_value: `${patch.materials_used.length} materiales`,
            note: `Lista de materiales actualizada (${patch.materials_used.length} ítem/s).`,
            metadata: {},
            created_at: nowIso,
          });
        }

        if (patch.client_signature_url && patch.client_signature_url !== prev.client_signature_url) {
          state.history.push({
            id: `hist-${Date.now()}-s`,
            task_id: taskId,
            actor_id: actorId,
            event_type: 'signature_captured',
            field_name: 'client_signature_url',
            old_value: null,
            new_value: patch.signer_name || 'Cliente',
            note: `Firma digital recogida (${patch.signer_name || 'Cliente'})`,
            metadata: {},
            created_at: nowIso,
          });
        }

        if (patch.status && patch.status !== prev.status) {
          state.history.push({
            id: `hist-${Date.now()}-st`,
            task_id: taskId,
            actor_id: actorId,
            event_type: 'status_changed',
            field_name: 'status',
            old_value: prev.status,
            new_value: patch.status,
            note: null,
            metadata: {},
            created_at: nowIso,
          });
        }

        if (patch.customer_id && patch.customer_id !== prev.customer_id) {
          const oldCust = state.customers.find((c) => c.id === prev.customer_id)?.name || prev.customer_id;
          const newCust = state.customers.find((c) => c.id === patch.customer_id)?.name || patch.customer_id;
          state.history.push({
            id: `hist-${Date.now()}-c`,
            task_id: taskId,
            actor_id: actorId,
            event_type: 'field_updated',
            field_name: 'customer_id',
            old_value: oldCust,
            new_value: newCust,
            note: `Cliente actualizado: ${oldCust} → ${newCust}`,
            metadata: {},
            created_at: nowIso,
          });
        }

        if (patch.equipment_ref !== undefined && patch.equipment_ref !== prev.equipment_ref) {
          state.history.push({
            id: `hist-${Date.now()}-eq`,
            task_id: taskId,
            actor_id: actorId,
            event_type: 'field_updated',
            field_name: 'equipment_ref',
            old_value: prev.equipment_ref,
            new_value: patch.equipment_ref ?? null,
            note: `Equipo actualizado: ${prev.equipment_ref || '—'} → ${patch.equipment_ref || '—'}`,
            metadata: {},
            created_at: nowIso,
          });
        }

        if (patch.equipment_sn !== undefined && patch.equipment_sn !== prev.equipment_sn) {
          state.history.push({
            id: `hist-${Date.now()}-sn`,
            task_id: taskId,
            actor_id: actorId,
            event_type: 'field_updated',
            field_name: 'equipment_sn',
            old_value: prev.equipment_sn,
            new_value: patch.equipment_sn ?? null,
            note: `Nº de serie actualizado: ${prev.equipment_sn || '—'} → ${patch.equipment_sn || '—'}`,
            metadata: {},
            created_at: nowIso,
          });
        }

        if (patch.problem_desc !== undefined && patch.problem_desc !== prev.problem_desc) {
          state.history.push({
            id: `hist-${Date.now()}-pd`,
            task_id: taskId,
            actor_id: actorId,
            event_type: 'field_updated',
            field_name: 'problem_desc',
            old_value: prev.problem_desc,
            new_value: patch.problem_desc,
            note: 'Descripción de avería modificada',
            metadata: {},
            created_at: nowIso,
          });
        }

        if (
          (patch.site_contact_name !== undefined && patch.site_contact_name !== prev.site_contact_name) ||
          (patch.site_contact_phone !== undefined && patch.site_contact_phone !== prev.site_contact_phone) ||
          (patch.site_address !== undefined && patch.site_address !== prev.site_address) ||
          (patch.site_city !== undefined && patch.site_city !== prev.site_city)
        ) {
          state.history.push({
            id: `hist-${Date.now()}-sc`,
            task_id: taskId,
            actor_id: actorId,
            event_type: 'field_updated',
            field_name: 'site_contact',
            old_value: null,
            new_value: null,
            note: 'Datos de contacto o dirección en sitio modificados',
            metadata: {},
            created_at: nowIso,
          });
        }

        if (patch.due_date !== undefined && patch.due_date !== (prev.due_date ?? null)) {
          state.history.push({
            id: `hist-${Date.now()}-due`,
            task_id: taskId,
            actor_id: actorId,
            event_type: 'field_updated',
            field_name: 'due_date',
            old_value: prev.due_date ?? null,
            new_value: patch.due_date ?? null,
            note: patch.due_date
              ? `Fecha límite SLA fijada: ${new Date(patch.due_date).toLocaleString('es-ES', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}`
              : 'Fecha límite SLA eliminada',
            metadata: {},
            created_at: nowIso,
          });
        }

        if (
          patch.scheduled_date !== undefined &&
          patch.scheduled_date !== (prev.scheduled_date ?? null)
        ) {
          state.history.push({
            id: `hist-${Date.now()}-sched`,
            task_id: taskId,
            actor_id: actorId,
            event_type: 'field_updated',
            field_name: 'scheduled_date',
            old_value: prev.scheduled_date ?? null,
            new_value: patch.scheduled_date ?? null,
            note: patch.scheduled_date
              ? `Fecha acordada de instalación: ${new Date(patch.scheduled_date).toLocaleString('es-ES', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}`
              : 'Fecha acordada de instalación eliminada',
            metadata: {},
            created_at: nowIso,
          });
        }

        if (
          patch.merchandise_check_done !== undefined &&
          patch.merchandise_check_done !== (prev.merchandise_check_done ?? null)
        ) {
          next.merchandise_checked_at = nowIso;
          next.merchandise_checked_by = actorId;
          state.tasks[idx] = next;
          state.history.push({
            id: `hist-${Date.now()}-merch`,
            task_id: taskId,
            actor_id: actorId,
            event_type: 'field_updated',
            field_name: 'merchandise_check_done',
            old_value:
              prev.merchandise_check_done == null ? null : String(prev.merchandise_check_done),
            new_value:
              patch.merchandise_check_done == null ? null : String(patch.merchandise_check_done),
            note:
              patch.merchandise_check_done === true
                ? 'Cotejo de mercancía: REALIZADO'
                : patch.merchandise_check_done === false
                ? 'Cotejo de mercancía: NO REALIZADO'
                : 'Cotejo de mercancía: Pendiente',
            metadata: {},
            created_at: nowIso,
          });
        }

        if (
          patch.physical_work_order_attached !== undefined &&
          patch.physical_work_order_attached !== (prev.physical_work_order_attached ?? null)
        ) {
          state.history.push({
            id: `hist-${Date.now()}-pwo`,
            task_id: taskId,
            actor_id: actorId,
            event_type: 'field_updated',
            field_name: 'physical_work_order_attached',
            old_value:
              prev.physical_work_order_attached == null
                ? null
                : String(prev.physical_work_order_attached),
            new_value:
              patch.physical_work_order_attached == null
                ? null
                : String(patch.physical_work_order_attached),
            note:
              patch.physical_work_order_attached === true
                ? 'Parte de trabajo físico adjuntado'
                : patch.physical_work_order_attached === false
                ? 'Instalación finalizada sin adjuntar parte de trabajo físico'
                : 'Estado de parte de trabajo físico restablecido',
            metadata: {},
            created_at: nowIso,
          });
        }

        if (
          (patch.meter_bw !== undefined && patch.meter_bw !== (prev.meter_bw ?? null)) ||
          (patch.meter_color !== undefined && patch.meter_color !== (prev.meter_color ?? null))
        ) {
          state.history.push({
            id: `hist-${Date.now()}-meters`,
            task_id: taskId,
            actor_id: actorId,
            event_type: 'field_updated',
            field_name: 'meters',
            old_value: `${prev.meter_bw ?? '—'} / ${prev.meter_color ?? '—'}`,
            new_value: `${next.meter_bw ?? '—'} / ${next.meter_color ?? '—'}`,
            note: `Contadores actualizados — B/N: ${next.meter_bw ?? '—'} · Color: ${
              next.meter_color ?? '—'
            }`,
            metadata: {},
            created_at: nowIso,
          });
        }

        await dispatchServerDemoNotifications(state, {
          task: next,
          actorId,
          type:
            patch.assigned_to !== undefined && patch.assigned_to !== prev.assigned_to
              ? 'reassigned'
              : patch.priority
              ? 'priority_changed'
              : 'task_updated',
          title: `Parte ${prev.code} actualizado`,
          body: `${actor?.full_name || 'Usuario'} ha actualizado los datos del parte.`,
        });

        saveServerDemoDb(state);
        return NextResponse.json({ ok: true });
      }

      case 'soft_delete_task': {
        const { taskId, reason, actorId } = body as {
          taskId: string;
          reason?: string;
          actorId: string;
        };
        const idx = state.tasks.findIndex((t) => t.id === taskId);
        if (idx === -1) {
          return NextResponse.json({ error: 'Parte no encontrado' }, { status: 404 });
        }
        const prev = state.tasks[idx];
        if (prev.deleted_at) {
          return NextResponse.json({ ok: true });
        }
        const actor = state.profiles.find((p) => p.id === actorId);
        const cleanReason = reason?.trim() || null;

        state.tasks[idx] = {
          ...prev,
          deleted_at: nowIso,
          deleted_by: actorId,
          deletion_reason: cleanReason,
          updated_at: nowIso,
        };

        state.history.push({
          id: `hist-${Date.now()}-del`,
          task_id: taskId,
          actor_id: actorId,
          event_type: 'deleted',
          field_name: 'deleted_at',
          old_value: null,
          new_value: nowIso,
          note: cleanReason
            ? `Parte enviado a la papelera. Motivo: ${cleanReason}`
            : 'Parte enviado a la papelera',
          metadata: cleanReason ? { reason: cleanReason } : {},
          created_at: nowIso,
        });

        await dispatchServerDemoNotifications(state, {
          task: state.tasks[idx],
          actorId,
          type: 'task_updated',
          title: `Parte eliminado: ${prev.code}`,
          body: `${actor?.full_name || 'Usuario'} movió el parte a la papelera${
            cleanReason ? ` (${cleanReason})` : ''
          }.`,
        });

        saveServerDemoDb(state);
        return NextResponse.json({ ok: true });
      }

      case 'restore_task': {
        const { taskId, actorId } = body as {
          taskId: string;
          actorId: string;
        };
        const idx = state.tasks.findIndex((t) => t.id === taskId);
        if (idx === -1) {
          return NextResponse.json({ error: 'Parte no encontrado' }, { status: 404 });
        }
        const prev = state.tasks[idx];
        if (!prev.deleted_at) {
          return NextResponse.json({ ok: true });
        }
        const actor = state.profiles.find((p) => p.id === actorId);

        state.tasks[idx] = {
          ...prev,
          deleted_at: null,
          deleted_by: null,
          deletion_reason: null,
          updated_at: nowIso,
        };

        state.history.push({
          id: `hist-${Date.now()}-res`,
          task_id: taskId,
          actor_id: actorId,
          event_type: 'restored',
          field_name: 'deleted_at',
          old_value: prev.deleted_at,
          new_value: null,
          note: 'Parte restaurado desde la papelera',
          metadata: {},
          created_at: nowIso,
        });

        await dispatchServerDemoNotifications(state, {
          task: state.tasks[idx],
          actorId,
          type: 'task_updated',
          title: `Parte restaurado: ${prev.code}`,
          body: `${actor?.full_name || 'Usuario'} ha recuperado el parte de la papelera.`,
        });

        saveServerDemoDb(state);
        return NextResponse.json({ ok: true });
      }

      case 'upload_attachment': {
        const { taskId, fileName, fileSize, mimeType, publicUrl, caption, kind, actorId } =
          body as {
            taskId: string;
            fileName: string;
            fileSize: number;
            mimeType: string;
            publicUrl: string;
            caption?: string;
            kind?: AttachmentKind;
            actorId: string;
          };
        const resolvedKind: AttachmentKind = kind || 'photo';
        const actor = state.profiles.find((p) => p.id === actorId);
        const att: Attachment = {
          id: `att-${Date.now()}`,
          task_id: taskId,
          uploaded_by: actorId,
          storage_path: `demo/${taskId}/${fileName}`,
          public_url: publicUrl,
          file_name: fileName,
          file_size: fileSize,
          mime_type: mimeType,
          caption: caption || null,
          attachment_kind: resolvedKind,
          created_at: nowIso,
        };
        state.attachments.unshift(att);
        state.history.push({
          id: `hist-${Date.now()}`,
          task_id: taskId,
          actor_id: actorId,
          event_type: 'attachment_added',
          field_name: null,
          old_value: null,
          new_value: fileName,
          note:
            resolvedKind === 'installation_order'
              ? `Pedido de instalación adjunto (${fileName})`
              : resolvedKind === 'physical_work_order'
              ? `Parte de trabajo físico adjunto (${fileName})`
              : caption
              ? `Foto adjunta: ${caption}`
              : `Foto adjunta (${fileName})`,
          metadata: { attachment_kind: resolvedKind },
          created_at: nowIso,
        });

        const task = state.tasks.find((t) => t.id === taskId);
        if (task) {
          await dispatchServerDemoNotifications(state, {
            task,
            actorId,
            type: 'task_updated',
            title: `Nueva fotografía en ${task.code}`,
            body: `${actor?.full_name || 'Usuario'} adjuntó ${fileName}.`,
          });
        }

        saveServerDemoDb(state);
        return NextResponse.json({ attachment: att });
      }

      case 'delete_attachment': {
        const { taskId, attachmentId, actorId } = body as {
          taskId: string;
          attachmentId: string;
          actorId: string;
        };
        const target = state.attachments.find(
          (a) => a.id === attachmentId && a.task_id === taskId
        );
        if (!target) {
          return NextResponse.json({ error: 'Adjunto no encontrado' }, { status: 404 });
        }
        state.attachments = state.attachments.filter((a) => a.id !== attachmentId);
        state.history.push({
          id: `hist-${Date.now()}-delatt`,
          task_id: taskId,
          actor_id: actorId,
          event_type: 'field_updated',
          field_name: 'attachments',
          old_value: target.file_name,
          new_value: null,
          note: `Fotografía eliminada (${target.file_name})`,
          metadata: {},
          created_at: nowIso,
        });
        saveServerDemoDb(state);
        return NextResponse.json({ ok: true });
      }

      case 'add_task_comment': {
        const { taskId, body: commentBody, actorId } = body as {
          taskId: string;
          body: string;
          actorId: string;
        };
        const cleanBody = commentBody?.trim();
        if (!cleanBody) {
          return NextResponse.json({ error: 'El comentario no puede estar vacío' }, { status: 400 });
        }
        const task = state.tasks.find((t) => t.id === taskId);
        if (!task) {
          return NextResponse.json({ error: 'Parte no encontrado' }, { status: 404 });
        }
        const actor = state.profiles.find((p) => p.id === actorId);
        if (!Array.isArray(state.comments)) {
          state.comments = [];
        }
        const comment: TaskComment = {
          id: `comm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          task_id: taskId,
          author_id: actorId,
          body: cleanBody,
          created_at: nowIso,
        };
        state.comments.push(comment);

        await dispatchServerDemoNotifications(state, {
          task,
          actorId,
          type: 'comment_added',
          title: `Nuevo mensaje en ${task.code}`,
          body: `${actor?.full_name || 'Usuario'}: "${cleanBody.slice(0, 90)}"`,
        });

        saveServerDemoDb(state);
        return NextResponse.json({
          comment: { ...comment, author: actor },
        });
      }

      case 'mark_notification_read': {
        const { id } = body as { id: string };
        const item = state.notifications.find((n) => n.id === id);
        if (item && !item.is_read) {
          item.is_read = true;
          item.read_at = nowIso;
          saveServerDemoDb(state);
        }
        return NextResponse.json({ ok: true });
      }

      case 'mark_all_notifications_read': {
        const { userId } = body as { userId: string };
        state.notifications.forEach((n) => {
          if (n.recipient_id === userId && !n.is_read) {
            n.is_read = true;
            n.read_at = nowIso;
          }
        });
        saveServerDemoDb(state);
        return NextResponse.json({ ok: true });
      }

      case 'save_push_subscription': {
        const { userId, sub, deviceLabel, userAgent } = body as {
          userId: string;
          sub: { endpoint: string; p256dh: string; auth: string };
          deviceLabel: string;
          userAgent?: string;
        };
        const existing = state.pushSubscriptions.find(
          (s) => s.user_id === userId && s.endpoint === sub.endpoint
        );
        if (existing) {
          existing.is_active = true;
          existing.last_used_at = nowIso;
          saveServerDemoDb(state);
          return NextResponse.json({ subscription: existing });
        }
        const record: PushSubscriptionRecord = {
          id: `sub-${Date.now()}`,
          user_id: userId,
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
          user_agent: userAgent || null,
          device_label: deviceLabel,
          is_active: true,
          created_at: nowIso,
          last_used_at: nowIso,
        };
        state.pushSubscriptions.push(record);
        saveServerDemoDb(state);
        return NextResponse.json({ subscription: record });
      }

      case 'remove_push_subscription': {
        const { subId } = body as { subId: string };
        state.pushSubscriptions = state.pushSubscriptions.filter((s) => s.id !== subId);
        saveServerDemoDb(state);
        return NextResponse.json({ ok: true });
      }

      case 'test_push': {
        const { userId } = body as { userId: string };
        const sent = await sendTestPushForUser(userId);
        return NextResponse.json({ ok: true, sent });
      }

      case 'change_password': {
        const { userId, currentPassword, newPassword } = body as {
          userId: string;
          currentPassword: string;
          newPassword: string;
        };
        const user = state.profiles.find((p) => p.id === userId && p.is_active);
        if (!user) {
          return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
        }
        const key = user.email.toLowerCase();
        if (state.passwords[key] !== currentPassword) {
          return NextResponse.json({ error: 'La contraseña actual no es correcta.' }, { status: 400 });
        }
        const check = validatePasswordStrength(newPassword);
        if (!check.valid) {
          return NextResponse.json(
            { error: check.error || 'La nueva contraseña no cumple los requisitos de seguridad.' },
            { status: 400 }
          );
        }
        state.passwords[key] = newPassword;
        saveServerDemoDb(state);
        return NextResponse.json({ ok: true });
      }

      case 'heartbeat': {
        const { userId, isOnline } = body as { userId: string; isOnline?: boolean };
        const user = state.profiles.find((p) => p.id === userId);
        if (user) {
          user.is_online = isOnline !== false;
          user.last_seen_at = nowIso;
          saveServerDemoDb(state);
        }
        return NextResponse.json({ ok: true });
      }

      case 'reset_demo': {
        resetServerDemoDb();
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error en servidor demo' },
      { status: 500 }
    );
  }
}
