import { getSupabaseBrowserClient } from './supabase/client';
import { isSupabaseConfigured } from './supabase/config';
import {
  dispatchDemoNotifications,
  loadDemoState,
  saveDemoState,
} from './demo-store';
import {
  enqueueOfflineAction,
  getPendingOfflineActions,
  removeOfflineAction,
} from './offline-queue';
import {
  type AppNotification,
  type Attachment,
  type Customer,
  type MaterialItem,
  type NotificationLevel,
  type Profile,
  type PushSubscriptionRecord,
  type Task,
  type TaskHistoryItem,
  type TaskPriority,
  type TaskStatus,
  type UserRole,
  TASK_STATUS_META,
  TASK_PRIORITY_META,
} from '@/types/database';

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

async function triggerPushEndpoint(body: {
  taskId: string;
  actorId: string;
  type: AppNotification['type'];
  title: string;
  body: string;
  isNewTask?: boolean;
}) {
  if (!isSupabaseConfigured() || !isOnline()) return;
  try {
    await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn('[Push] No se pudo contactar con /api/push/send:', err);
  }
}

// ─── PERFILES Y USUARIOS ─────────────────────────────────────────────────────

export async function listProfiles(): Promise<Profile[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return loadDemoState().profiles;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as Profile[];
}

export async function updateProfile(
  profileId: string,
  patch: Partial<Pick<Profile, 'full_name' | 'phone' | 'role' | 'is_active' | 'notification_level'>>
): Promise<Profile> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const state = loadDemoState();
    const idx = state.profiles.findIndex((p) => p.id === profileId);
    if (idx === -1) throw new Error('Usuario no encontrado');
    state.profiles[idx] = {
      ...state.profiles[idx],
      ...patch,
      updated_at: new Date().toISOString(),
    };
    saveDemoState(state);
    return state.profiles[idx];
  }

  const { data, error } = await supabase
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', profileId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Profile;
}

export async function createUserAccount(input: {
  email: string;
  password: string;
  full_name: string;
  phone?: string;
  role: UserRole;
}): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const state = loadDemoState();
    if (state.profiles.some((p) => p.email.toLowerCase() === input.email.toLowerCase())) {
      throw new Error('Ya existe un usuario con ese correo electrónico.');
    }
    const nowIso = new Date().toISOString();
    const newProfile: Profile = {
      id: `user-${Date.now()}`,
      email: input.email.trim(),
      full_name: input.full_name.trim(),
      phone: input.phone?.trim() || null,
      avatar_url: null,
      role: input.role,
      notification_level: 'assigned_or_created',
      is_active: true,
      created_at: nowIso,
      updated_at: nowIso,
    };
    state.profiles.push(newProfile);
    state.passwords[newProfile.email.toLowerCase()] = input.password;
    saveDemoState(state);
    return;
  }

  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'No se pudo crear el usuario');
}

// ─── CLIENTES ────────────────────────────────────────────────────────────────

export async function listCustomers(): Promise<Customer[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return loadDemoState().customers.sort((a, b) => a.name.localeCompare(b.name));
  }

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []) as Customer[];
}

export async function createCustomer(
  input: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'is_active' | 'country'> & {
    country?: string;
  }
): Promise<Customer> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const state = loadDemoState();
    const nowIso = new Date().toISOString();
    const created: Customer = {
      ...input,
      id: `cust-${Date.now()}`,
      country: input.country || 'ES',
      is_active: true,
      created_at: nowIso,
      updated_at: nowIso,
    };
    state.customers.push(created);
    saveDemoState(state);
    return created;
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({ ...input, country: input.country || 'ES' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Customer;
}

export async function updateCustomer(
  customerId: string,
  patch: Partial<Customer>
): Promise<Customer> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const state = loadDemoState();
    const idx = state.customers.findIndex((c) => c.id === customerId);
    if (idx === -1) throw new Error('Cliente no encontrado');
    state.customers[idx] = {
      ...state.customers[idx],
      ...patch,
      updated_at: new Date().toISOString(),
    };
    saveDemoState(state);
    return state.customers[idx];
  }

  const { data, error } = await supabase
    .from('customers')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', customerId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Customer;
}

// ─── TAREAS / PARTES DE TRABAJO ──────────────────────────────────────────────

function hydrateDemoTasks(tasks: Task[]): Task[] {
  const state = loadDemoState();
  return tasks.map((t) => ({
    ...t,
    customer: state.customers.find((c) => c.id === t.customer_id),
    assignee: t.assigned_to ? state.profiles.find((p) => p.id === t.assigned_to) || null : null,
    creator: state.profiles.find((p) => p.id === t.created_by) || null,
  }));
}

export async function listTasks(viewer: Profile): Promise<Task[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const state = loadDemoState();
    const isCoord = viewer.role === 'admin' || viewer.role === 'coordinator';
    const filtered = isCoord
      ? state.tasks
      : state.tasks.filter(
          (t) => t.assigned_to === viewer.id || (!t.assigned_to && t.status === 'pending')
        );
    return hydrateDemoTasks(filtered).sort((a, b) =>
      b.created_at.localeCompare(a.created_at)
    );
  }

  const { data, error } = await supabase
    .from('tasks')
    .select(
      '*, customer:customers(*), assignee:profiles!tasks_assigned_to_fkey(*), creator:profiles!tasks_created_by_fkey(*)'
    )
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as Task[];
}

export async function getTaskDetail(taskId: string): Promise<{
  task: Task | null;
  history: TaskHistoryItem[];
  attachments: Attachment[];
}> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const state = loadDemoState();
    const rawTask = state.tasks.find((t) => t.id === taskId);
    if (!rawTask) return { task: null, history: [], attachments: [] };
    const [task] = hydrateDemoTasks([rawTask]);
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
    return { task, history, attachments };
  }

  const [taskRes, histRes, attRes] = await Promise.all([
    supabase
      .from('tasks')
      .select(
        '*, customer:customers(*), assignee:profiles!tasks_assigned_to_fkey(*), creator:profiles!tasks_created_by_fkey(*)'
      )
      .eq('id', taskId)
      .single(),
    supabase
      .from('task_history')
      .select('*, actor:profiles(*)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false }),
    supabase
      .from('attachments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: false }),
  ]);

  if (taskRes.error) return { task: null, history: [], attachments: [] };
  return {
    task: taskRes.data as Task,
    history: (histRes.data || []) as TaskHistoryItem[],
    attachments: (attRes.data || []) as Attachment[],
  };
}

export async function createTask(
  input: {
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
  },
  actor: Profile
): Promise<Task> {
  const supabase = getSupabaseBrowserClient();
  const initialStatus: TaskStatus = input.assigned_to ? 'assigned' : 'pending';

  if (!supabase) {
    const state = loadDemoState();
    const nowIso = new Date().toISOString();
    const year = new Date().getFullYear();
    const code = `VS-${year}-${String(state.seqCounter).padStart(4, '0')}`;
    state.seqCounter += 1;

    const newTask: Task = {
      id: `task-${Date.now()}`,
      code,
      customer_id: input.customer_id,
      site_contact_name: input.site_contact_name || null,
      site_contact_phone: input.site_contact_phone || null,
      site_address: input.site_address || null,
      site_city: input.site_city || null,
      equipment_ref: input.equipment_ref || null,
      equipment_sn: input.equipment_sn || null,
      problem_desc: input.problem_desc,
      priority: input.priority,
      status: initialStatus,
      assigned_to: input.assigned_to || null,
      assigned_at: input.assigned_to ? nowIso : null,
      resolution_notes: null,
      materials_used: [],
      client_signature_url: null,
      signer_name: null,
      pdf_url: null,
      completed_at: null,
      estimated_duration: input.estimated_duration || null,
      created_by: actor.id,
      created_at: nowIso,
      updated_at: nowIso,
    };
    state.tasks.unshift(newTask);

    state.history.push({
      id: `hist-${Date.now()}-1`,
      task_id: newTask.id,
      actor_id: actor.id,
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
        actor_id: actor.id,
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
    dispatchDemoNotifications(state, {
      task: newTask,
      actorId: actor.id,
      type: newTask.assigned_to ? 'task_assigned' : 'task_created',
      title: newTask.assigned_to
        ? `Nuevo parte asignado: ${code}`
        : `Parte disponible sin asignar: ${code}`,
      body: `${customer?.name || 'Cliente'} — ${input.equipment_ref || input.problem_desc.slice(0, 60)}`,
      isNewTask: true,
    });

    saveDemoState(state);
    return hydrateDemoTasks([newTask])[0];
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      ...input,
      code: '', // El trigger SQL genera VS-YYYY-XXXX automáticamente
      status: initialStatus,
      assigned_at: input.assigned_to ? new Date().toISOString() : null,
      created_by: actor.id,
    })
    .select('*, customer:customers(name)')
    .single();
  if (error) throw new Error(error.message);

  const created = data as Task;
  await triggerPushEndpoint({
    taskId: created.id,
    actorId: actor.id,
    type: created.assigned_to ? 'task_assigned' : 'task_created',
    title: created.assigned_to
      ? `Nuevo parte asignado: ${created.code}`
      : `Nuevo parte disponible: ${created.code}`,
    body: `${created.customer?.name || 'Cliente'} — ${input.equipment_ref || input.problem_desc.slice(0, 60)}`,
    isNewTask: true,
  });

  return created;
}

export async function updateTaskStatus(
  taskId: string,
  newStatus: TaskStatus,
  actor: Profile
): Promise<{ offlineQueued?: boolean }> {
  if (!isOnline()) {
    await enqueueOfflineAction({
      taskId,
      actorId: actor.id,
      actionType: 'status_change',
      payload: { status: newStatus },
    });
    return { offlineQueued: true };
  }

  const supabase = getSupabaseBrowserClient();
  const nowIso = new Date().toISOString();

  if (!supabase) {
    const state = loadDemoState();
    const idx = state.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) throw new Error('Parte no encontrado');
    const prev = state.tasks[idx];
    const oldStatus = prev.status;
    if (oldStatus === newStatus) return {};

    state.tasks[idx] = {
      ...prev,
      status: newStatus,
      completed_at: newStatus === 'completed' ? prev.completed_at || nowIso : prev.completed_at,
      updated_at: nowIso,
    };

    state.history.push({
      id: `hist-${Date.now()}`,
      task_id: taskId,
      actor_id: actor.id,
      event_type: 'status_changed',
      field_name: 'status',
      old_value: oldStatus,
      new_value: newStatus,
      note: null,
      metadata: {},
      created_at: nowIso,
    });

    dispatchDemoNotifications(state, {
      task: state.tasks[idx],
      actorId: actor.id,
      type: 'status_changed',
      title: `Estado actualizado en ${prev.code}`,
      body: `${actor.full_name} cambió el estado a "${TASK_STATUS_META[newStatus].label}".`,
    });

    saveDemoState(state);
    return {};
  }

  const patch: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'completed') patch.completed_at = nowIso;

  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', taskId)
    .select('code')
    .single();
  if (error) throw new Error(error.message);

  await triggerPushEndpoint({
    taskId,
    actorId: actor.id,
    type: 'status_changed',
    title: `Estado actualizado en ${data.code}`,
    body: `${actor.full_name} cambió el estado a "${TASK_STATUS_META[newStatus].label}".`,
  });

  return {};
}

export async function addTaskNote(
  taskId: string,
  note: string,
  actor: Profile
): Promise<{ offlineQueued?: boolean }> {
  const cleanNote = note.trim();
  if (!cleanNote) return {};

  if (!isOnline()) {
    await enqueueOfflineAction({
      taskId,
      actorId: actor.id,
      actionType: 'add_note',
      payload: { note: cleanNote },
    });
    return { offlineQueued: true };
  }

  const supabase = getSupabaseBrowserClient();
  const nowIso = new Date().toISOString();

  if (!supabase) {
    const state = loadDemoState();
    const idx = state.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) throw new Error('Parte no encontrado');

    state.tasks[idx] = {
      ...state.tasks[idx],
      resolution_notes: cleanNote,
      updated_at: nowIso,
    };

    state.history.push({
      id: `hist-${Date.now()}`,
      task_id: taskId,
      actor_id: actor.id,
      event_type: 'note_added',
      field_name: 'resolution_notes',
      old_value: null,
      new_value: null,
      note: cleanNote,
      metadata: {},
      created_at: nowIso,
    });

    dispatchDemoNotifications(state, {
      task: state.tasks[idx],
      actorId: actor.id,
      type: 'comment_added',
      title: `Nueva nota en ${state.tasks[idx].code}`,
      body: `${actor.full_name}: "${cleanNote.slice(0, 90)}"`,
    });

    saveDemoState(state);
    return {};
  }

  const { data, error } = await supabase
    .from('tasks')
    .update({ resolution_notes: cleanNote })
    .eq('id', taskId)
    .select('code')
    .single();
  if (error) throw new Error(error.message);

  await triggerPushEndpoint({
    taskId,
    actorId: actor.id,
    type: 'comment_added',
    title: `Nueva nota en ${data.code}`,
    body: `${actor.full_name}: "${cleanNote.slice(0, 90)}"`,
  });

  return {};
}

export async function updateTaskFields(
  taskId: string,
  patch: Partial<{
    assigned_to: string | null;
    priority: TaskPriority;
    status: TaskStatus;
    materials_used: MaterialItem[];
    client_signature_url: string | null;
    signer_name: string | null;
    resolution_notes: string | null;
    problem_desc: string;
    equipment_ref: string | null;
  }>,
  actor: Profile
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const nowIso = new Date().toISOString();

  if (!supabase) {
    const state = loadDemoState();
    const idx = state.tasks.findIndex((t) => t.id === taskId);
    if (idx === -1) throw new Error('Parte no encontrado');

    const prev = state.tasks[idx];
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
        actor_id: actor.id,
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
        ? state.profiles.find((p) => p.id === prev.assigned_to)?.full_name || prev.assigned_to
        : null;
      const newTech = patch.assigned_to
        ? state.profiles.find((p) => p.id === patch.assigned_to)?.full_name || patch.assigned_to
        : 'Sin asignar';
      state.history.push({
        id: `hist-${Date.now()}-a`,
        task_id: taskId,
        actor_id: actor.id,
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
        actor_id: actor.id,
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
        actor_id: actor.id,
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
        actor_id: actor.id,
        event_type: 'status_changed',
        field_name: 'status',
        old_value: prev.status,
        new_value: patch.status,
        note: null,
        metadata: {},
        created_at: nowIso,
      });
    }

    dispatchDemoNotifications(state, {
      task: next,
      actorId: actor.id,
      type:
        patch.assigned_to !== undefined && patch.assigned_to !== prev.assigned_to
          ? 'reassigned'
          : patch.priority
          ? 'priority_changed'
          : 'task_updated',
      title: `Parte ${prev.code} actualizado`,
      body: `${actor.full_name} ha actualizado los datos del parte.`,
    });

    saveDemoState(state);
    return;
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', taskId)
    .select('code')
    .single();
  if (error) throw new Error(error.message);

  if (patch.materials_used) {
    await supabase.from('task_history').insert({
      task_id: taskId,
      actor_id: actor.id,
      event_type: 'field_updated',
      field_name: 'materials_used',
      note: `Materiales actualizados (${patch.materials_used.length} ítem/s)`,
    });
  }

  await triggerPushEndpoint({
    taskId,
    actorId: actor.id,
    type: patch.assigned_to !== undefined ? 'reassigned' : 'task_updated',
    title: `Parte ${data.code} actualizado`,
    body: `${actor.full_name} ha actualizado el parte.`,
  });
}

// ─── ADJUNTOS / FOTOS ────────────────────────────────────────────────────────

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function uploadTaskAttachment(
  taskId: string,
  file: File,
  caption: string | undefined,
  actor: Profile
): Promise<Attachment> {
  const supabase = getSupabaseBrowserClient();
  const nowIso = new Date().toISOString();

  if (!supabase) {
    const dataUrl = await fileToDataUrl(file);
    const state = loadDemoState();
    const att: Attachment = {
      id: `att-${Date.now()}`,
      task_id: taskId,
      uploaded_by: actor.id,
      storage_path: `demo/${taskId}/${file.name}`,
      public_url: dataUrl,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      caption: caption || null,
      created_at: nowIso,
    };
    state.attachments.unshift(att);
    state.history.push({
      id: `hist-${Date.now()}`,
      task_id: taskId,
      actor_id: actor.id,
      event_type: 'attachment_added',
      field_name: null,
      old_value: null,
      new_value: file.name,
      note: caption ? `Foto adjunta: ${caption}` : `Foto adjunta (${file.name})`,
      metadata: {},
      created_at: nowIso,
    });
    const task = state.tasks.find((t) => t.id === taskId);
    if (task) {
      dispatchDemoNotifications(state, {
        task,
        actorId: actor.id,
        type: 'task_updated',
        title: `Nueva fotografía en ${task.code}`,
        body: `${actor.full_name} adjuntó ${file.name}.`,
      });
    }
    saveDemoState(state);
    return att;
  }

  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${taskId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('task-attachments')
    .upload(path, file, { upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { data: urlData } = supabase.storage.from('task-attachments').getPublicUrl(path);

  const { data: attData, error: dbError } = await supabase
    .from('attachments')
    .insert({
      task_id: taskId,
      uploaded_by: actor.id,
      storage_path: path,
      public_url: urlData.publicUrl,
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      caption: caption || null,
    })
    .select()
    .single();
  if (dbError) throw new Error(dbError.message);

  await supabase.from('task_history').insert({
    task_id: taskId,
    actor_id: actor.id,
    event_type: 'attachment_added',
    new_value: file.name,
    note: caption || `Adjunto: ${file.name}`,
  });

  return attData as Attachment;
}

// ─── NOTIFICACIONES IN-APP & PUSH SUBSCRIPTIONS ──────────────────────────────

export async function listNotifications(userId: string): Promise<AppNotification[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const state = loadDemoState();
    return state.notifications
      .filter((n) => n.recipient_id === userId && n.actor_id !== userId)
      .map((n) => ({
        ...n,
        actor: state.profiles.find((p) => p.id === n.actor_id),
      }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  const { data, error } = await supabase
    .from('notifications')
    .select('*, actor:profiles!notifications_actor_id_fkey(*)')
    .eq('recipient_id', userId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data || []) as AppNotification[];
}

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const nowIso = new Date().toISOString();
  if (!supabase) {
    const state = loadDemoState();
    const item = state.notifications.find((n) => n.id === id);
    if (item && !item.is_read) {
      item.is_read = true;
      item.read_at = nowIso;
      saveDemoState(state);
    }
    return;
  }
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: nowIso })
    .eq('id', id);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  const nowIso = new Date().toISOString();
  if (!supabase) {
    const state = loadDemoState();
    state.notifications.forEach((n) => {
      if (n.recipient_id === userId && !n.is_read) {
        n.is_read = true;
        n.read_at = nowIso;
      }
    });
    saveDemoState(state);
    return;
  }
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: nowIso })
    .eq('recipient_id', userId)
    .eq('is_read', false);
}

export async function listPushSubscriptions(userId: string): Promise<PushSubscriptionRecord[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return loadDemoState().pushSubscriptions.filter(
      (s) => s.user_id === userId && s.is_active
    );
  }
  const { data } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);
  return (data || []) as PushSubscriptionRecord[];
}

export async function savePushSubscription(
  userId: string,
  sub: { endpoint: string; p256dh: string; auth: string },
  deviceLabel: string
): Promise<PushSubscriptionRecord> {
  const supabase = getSupabaseBrowserClient();
  const nowIso = new Date().toISOString();
  if (!supabase) {
    const state = loadDemoState();
    const existing = state.pushSubscriptions.find(
      (s) => s.user_id === userId && s.endpoint === sub.endpoint
    );
    if (existing) {
      existing.is_active = true;
      existing.last_used_at = nowIso;
      saveDemoState(state);
      return existing;
    }
    const record: PushSubscriptionRecord = {
      id: `sub-${Date.now()}`,
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: sub.p256dh,
      auth: sub.auth,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      device_label: deviceLabel,
      is_active: true,
      created_at: nowIso,
      last_used_at: nowIso,
    };
    state.pushSubscriptions.push(record);
    saveDemoState(state);
    return record;
  }

  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert(
      {
        user_id: userId,
        endpoint: sub.endpoint,
        p256dh: sub.p256dh,
        auth: sub.auth,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
        device_label: deviceLabel,
        is_active: true,
        last_used_at: nowIso,
      },
      { onConflict: 'user_id,endpoint' }
    )
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as PushSubscriptionRecord;
}

export async function removePushSubscription(subId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const state = loadDemoState();
    state.pushSubscriptions = state.pushSubscriptions.filter((s) => s.id !== subId);
    saveDemoState(state);
    return;
  }
  await supabase.from('push_subscriptions').delete().eq('id', subId);
}

// ─── SINCRONIZACIÓN DE COLA OFFLINE ──────────────────────────────────────────

export async function syncOfflineActions(actor: Profile): Promise<number> {
  if (!isOnline()) return 0;
  const actions = await getPendingOfflineActions();
  if (actions.length === 0) return 0;

  let synced = 0;
  for (const action of actions) {
    try {
      if (action.actionType === 'status_change' && action.payload.status) {
        await updateTaskStatus(action.taskId, action.payload.status, actor);
      } else if (action.actionType === 'add_note' && action.payload.note) {
        await addTaskNote(action.taskId, action.payload.note, actor);
      } else if (action.actionType === 'update_materials' && action.payload.materials) {
        await updateTaskFields(
          action.taskId,
          { materials_used: action.payload.materials },
          actor
        );
      }
      await removeOfflineAction(action.id);
      synced++;
    } catch (err) {
      console.warn('[OfflineSync] Error sincronizando acción:', action.id, err);
    }
  }
  return synced;
}

export type { NotificationLevel };
