import { NextResponse } from 'next/server';
import { hydrateTasks } from '@/lib/demo-seed';
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
  TASK_STATUS_META,
  type Attachment,
  type Customer,
  type MaterialItem,
  type Profile,
  type PushSubscriptionRecord,
  type Task,
  type TaskPriority,
  type TaskStatus,
  type UserRole,
} from '@/types/database';

export async function GET(request: Request) {
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

    case 'tasks': {
      const viewer = state.profiles.find((p) => p.id === userId);
      if (!viewer) return NextResponse.json({ tasks: [] });
      const isCoord = viewer.role === 'admin' || viewer.role === 'coordinator';
      const filtered = isCoord
        ? state.tasks
        : state.tasks.filter(
            (t) => t.assigned_to === viewer.id || (!t.assigned_to && t.status === 'pending')
          );
      const tasks = hydrateTasks(state, filtered).sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      );
      return NextResponse.json({ tasks, revision: state.revision });
    }

    case 'task_detail': {
      const rawTask = state.tasks.find((t) => t.id === taskId);
      if (!rawTask) {
        return NextResponse.json({ task: null, history: [], attachments: [] });
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
      return NextResponse.json({ task, history, attachments, revision: state.revision });
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
        const { profileId, patch } = body as {
          profileId: string;
          patch: Partial<Profile>;
        };
        const idx = state.profiles.findIndex((p) => p.id === profileId);
        if (idx === -1) {
          return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
        }
        state.profiles[idx] = { ...state.profiles[idx], ...patch, updated_at: nowIso };
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

      case 'create_task': {
        const { payload, actorId } = body as {
          payload: {
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
          };
          actorId: string;
        };

        const year = new Date().getFullYear();
        const code = `VS-${year}-${String(state.seqCounter).padStart(4, '0')}`;
        state.seqCounter += 1;

        const newTask: Task = {
          id: `task-${Date.now()}`,
          code,
          customer_id: payload.customer_id,
          site_contact_name: payload.site_contact_name || null,
          site_contact_phone: payload.site_contact_phone || null,
          site_address: payload.site_address || null,
          site_city: payload.site_city || null,
          equipment_ref: payload.equipment_ref || null,
          equipment_sn: payload.equipment_sn || null,
          problem_desc: payload.problem_desc,
          priority: payload.priority,
          status: payload.assigned_to ? 'assigned' : 'pending',
          assigned_to: payload.assigned_to || null,
          assigned_at: payload.assigned_to ? nowIso : null,
          resolution_notes: null,
          materials_used: [],
          client_signature_url: null,
          signer_name: null,
          pdf_url: null,
          completed_at: null,
          estimated_duration: payload.estimated_duration || null,
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
          note: 'Parte de trabajo creado',
          metadata: {},
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
        if (prev.status === status) return NextResponse.json({ ok: true });

        state.tasks[idx] = {
          ...prev,
          status,
          completed_at:
            status === 'completed' ? prev.completed_at || nowIso : prev.completed_at,
          updated_at: nowIso,
        };

        state.history.push({
          id: `hist-${Date.now()}`,
          task_id: taskId,
          actor_id: actorId,
          event_type: 'status_changed',
          field_name: 'status',
          old_value: prev.status,
          new_value: status,
          note: null,
          metadata: {},
          created_at: nowIso,
        });

        await dispatchServerDemoNotifications(state, {
          task: state.tasks[idx],
          actorId,
          type: 'status_changed',
          title: `Estado actualizado en ${prev.code}`,
          body: `${actor?.full_name || 'Usuario'} cambió el estado a "${
            TASK_STATUS_META[status].label
          }".`,
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

        if (patch.assigned_to !== undefined && patch.assigned_to !== prev.assigned_to) {
          next.assigned_at = patch.assigned_to ? nowIso : null;
          if (patch.assigned_to && prev.status === 'pending' && !patch.status) {
            next.status = 'assigned';
          }
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

      case 'upload_attachment': {
        const { taskId, fileName, fileSize, mimeType, publicUrl, caption, actorId } =
          body as {
            taskId: string;
            fileName: string;
            fileSize: number;
            mimeType: string;
            publicUrl: string;
            caption?: string;
            actorId: string;
          };
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
          note: caption ? `Foto adjunta: ${caption}` : `Foto adjunta (${fileName})`,
          metadata: {},
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
