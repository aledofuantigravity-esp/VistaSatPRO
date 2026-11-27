import { getSupabaseBrowserClient } from './supabase/client';
import { isSupabaseConfigured } from './supabase/config';
import { loadDemoState, saveDemoState } from './demo-store';
import { captureMonitoringError } from './monitoring';
import {
  normalizeNotificationPreferences,
  syncLegacyNotificationLevel,
} from './notification-preferences';
import { validatePasswordStrength } from './security';
import {
  enqueueOfflineAction,
  getPendingOfflineActions,
  removeOfflineAction,
} from './offline-queue';
import {
  type AppNotification,
  type Attachment,
  type AttachmentKind,
  type Customer,
  type MaterialItem,
  type NotificationLevel,
  type Profile,
  type PushSubscriptionRecord,
  type Task,
  type TaskComment,
  type TaskHistoryItem,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
  type UserRole,
  TASK_STATUS_META,
} from '@/types/database';

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

async function demoGet<T>(query: string): Promise<T> {
  const res = await fetch(`/api/demo?${query}`, { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Error leyendo servidor simulado');
  return json as T;
}

async function demoPost<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch('/api/demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Error guardando en servidor simulado');
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('vistasat:demo-updated'));
  }
  return json as T;
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
    const { actorId: _unused, ...safeBody } = body;
    void _unused;
    await fetch('/api/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(safeBody),
    });
  } catch (err) {
    console.warn('[Push] No se pudo contactar con /api/push/send:', err);
  }
}

// ─── PERFILES Y USUARIOS ─────────────────────────────────────────────────────

export async function listProfiles(): Promise<Profile[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    try {
      const data = await demoGet<{ profiles: Profile[] }>('resource=profiles');
      return data.profiles;
    } catch {
      return loadDemoState().profiles;
    }
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
  patch: Partial<
    Pick<
      Profile,
      | 'full_name'
      | 'phone'
      | 'role'
      | 'is_active'
      | 'notification_level'
      | 'notification_preferences'
    >
  >
): Promise<Profile> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const data = await demoPost<{ profile: Profile }>({
      action: 'update_profile',
      profileId,
      patch,
    });
    return data.profile;
  }

  // Si se cambia rol o estado activo, usar endpoint admin para propagar ban/unban en Auth
  if (patch.role !== undefined || patch.is_active !== undefined) {
    return adminUpdateUserProfile(profileId, patch);
  }

  const updatePayload: Record<string, unknown> = {
    ...patch,
    updated_at: new Date().toISOString(),
  };

  if (patch.notification_preferences) {
    const normalized = normalizeNotificationPreferences(patch.notification_preferences);
    updatePayload.notification_preferences = normalized;
    updatePayload.notification_level = syncLegacyNotificationLevel(normalized);
  }

  let { data, error } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', profileId)
    .select()
    .single();

  if (error?.code === '42703' && 'notification_preferences' in updatePayload) {
    const { notification_preferences: _omit, ...legacy } = updatePayload;
    void _omit;
    const retry = await supabase
      .from('profiles')
      .update(legacy)
      .eq('id', profileId)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) throw new Error(error.message);
  return data as Profile;
}

/**
 * Actualización administrativa de la ficha de cualquier usuario desde /users.
 */
export async function adminUpdateUserProfile(
  targetUserId: string,
  patch: Partial<
    Pick<
      Profile,
      | 'full_name'
      | 'phone'
      | 'role'
      | 'is_active'
      | 'notification_level'
      | 'notification_preferences'
    >
  >
): Promise<Profile> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const data = await demoPost<{ profile: Profile }>({
      action: 'update_profile',
      profileId: targetUserId,
      patch,
    });
    return data.profile;
  }

  const res = await fetch(`/api/admin/users/${encodeURIComponent(targetUserId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const json = (await res.json()) as { profile?: Profile; error?: string };
  if (!res.ok || !json.profile) {
    throw new Error(json.error || 'No se pudo actualizar el usuario');
  }
  return json.profile;
}

export async function adminListUserPushSubscriptions(
  targetUserId: string
): Promise<PushSubscriptionRecord[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const res = await demoGet<{ subscriptions?: PushSubscriptionRecord[] }>(
      `resource=push_subscriptions&userId=${encodeURIComponent(targetUserId)}`
    );
    return res.subscriptions || [];
  }
  const res = await fetch(`/api/admin/users/${encodeURIComponent(targetUserId)}/push`, {
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { subscriptions?: PushSubscriptionRecord[] };
  return json.subscriptions || [];
}

export async function adminSendTestPushToUser(
  targetUserId: string
): Promise<{ sent: number }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const res = await demoPost<{ sent: number }>({
      action: 'test_push',
      userId: targetUserId,
    });
    return { sent: res.sent || 0 };
  }
  const res = await fetch(`/api/admin/users/${encodeURIComponent(targetUserId)}/push`, {
    method: 'POST',
  });
  const json = (await res.json()) as { sent?: number; error?: string };
  if (!res.ok) {
    throw new Error(json.error || 'No se pudo enviar la notificación Push de prueba.');
  }
  return { sent: json.sent || 0 };
}

export async function adminRevokeUserPushSubscription(
  targetUserId: string,
  subId: string
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    await demoPost({ action: 'remove_push_subscription', subId });
    return;
  }
  const res = await fetch(`/api/admin/users/${encodeURIComponent(targetUserId)}/push`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subId }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || 'No se pudo revocar el dispositivo.');
  }
}

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
  profile: Profile
): Promise<void> {
  const passCheck = validatePasswordStrength(newPassword);
  if (!passCheck.valid) {
    throw new Error(passCheck.error || 'La nueva contraseña no cumple los requisitos.');
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    await demoPost({
      action: 'change_password',
      userId: profile.id,
      currentPassword,
      newPassword,
    });
    return;
  }

  // Verificar contraseña actual antes de autorizar el cambio
  const { error: verifyErr } = await supabase.auth.signInWithPassword({
    email: profile.email,
    password: currentPassword,
  });
  if (verifyErr) {
    throw new Error('La contraseña actual no es correcta.');
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw new Error(error.message);
  }
}

export async function sendPresenceHeartbeat(
  userId: string,
  isOnlineNow: boolean,
  useBeacon = false
): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine) return;

  if (!isSupabaseConfigured()) {
    const body = JSON.stringify({ action: 'heartbeat', userId, isOnline: isOnlineNow });
    if (useBeacon && 'sendBeacon' in navigator) {
      navigator.sendBeacon('/api/demo', new Blob([body], { type: 'application/json' }));
      return;
    }
    await fetch('/api/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
    return;
  }

  const body = JSON.stringify({ is_online: isOnlineNow });
  if (useBeacon && 'sendBeacon' in navigator) {
    navigator.sendBeacon('/api/presence', new Blob([body], { type: 'application/json' }));
    return;
  }
  await fetch('/api/presence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
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
    await demoPost({ action: 'create_user', payload: input });
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
    try {
      const data = await demoGet<{ customers: Customer[] }>('resource=customers');
      return data.customers;
    } catch {
      return loadDemoState().customers.sort((a, b) => a.name.localeCompare(b.name));
    }
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
    const data = await demoPost<{ customer: Customer }>({
      action: 'create_customer',
      payload: input,
    });
    return data.customer;
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
    const data = await demoPost<{ customer: Customer }>({
      action: 'update_customer',
      customerId,
      patch,
    });
    return data.customer;
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

export async function listTasks(
  viewer: Profile,
  options?: { includeDeleted?: boolean }
): Promise<Task[]> {
  const includeDeleted = Boolean(options?.includeDeleted);
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    try {
      const data = await demoGet<{ tasks: Task[] }>(
        `resource=tasks&userId=${encodeURIComponent(viewer.id)}${
          includeDeleted ? '&includeDeleted=1' : ''
        }`
      );
      if (includeDeleted) {
        const local = loadDemoState();
        local.tasks = data.tasks;
        saveDemoState(local, false);
      }
      return data.tasks;
    } catch {
      const local = loadDemoState();
      const isCoord = viewer.role === 'admin' || viewer.role === 'coordinator';
      return local.tasks.filter((t) => {
        if (!includeDeleted && t.deleted_at) return false;
        if (isCoord) return true;
        return (
          t.assigned_to === viewer.id ||
          t.created_by === viewer.id ||
          t.deleted_by === viewer.id ||
          (!t.assigned_to && t.status === 'pending')
        );
      });
    }
  }

  let query = supabase
    .from('tasks')
    .select(
      '*, customer:customers(*), assignee:profiles!tasks_assigned_to_fkey(*), creator:profiles!tasks_created_by_fkey(*), deleter:profiles!tasks_deleted_by_fkey(*), attachments(id)'
    )
    .order('created_at', { ascending: false });

  if (!includeDeleted) {
    query = query.is('deleted_at', null);
  }

  const { data, error } = await query;
  if (error) {
    // Fallback elegante si la migración 0003 aún no se ha ejecutado en Supabase
    if (error.code === '42703' || error.code === 'PGRST200' || error.message.includes('deleted_')) {
      const legacy = await supabase
        .from('tasks')
        .select(
          '*, customer:customers(*), assignee:profiles!tasks_assigned_to_fkey(*), creator:profiles!tasks_created_by_fkey(*)'
        )
        .order('created_at', { ascending: false });
      if (legacy.error) {
        captureMonitoringError(legacy.error, { scope: 'listTasks.legacy' });
        throw new Error(legacy.error.message);
      }
      return (legacy.data || []) as Task[];
    }
    captureMonitoringError(error, { scope: 'listTasks' });
    throw new Error(error.message);
  }

  return ((data || []) as Array<Task & { attachments?: Array<{ id: string }> }>).map((row) => {
    const { attachments: rawAtts, ...rest } = row;
    return {
      ...rest,
      attachment_count: Array.isArray(rawAtts) ? rawAtts.length : 0,
    };
  });
}

export async function getTaskDetail(taskId: string): Promise<{
  task: Task | null;
  history: TaskHistoryItem[];
  attachments: Attachment[];
  comments: TaskComment[];
}> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const res = await demoGet<{
      task: Task | null;
      history: TaskHistoryItem[];
      attachments: Attachment[];
      comments?: TaskComment[];
    }>(`resource=task_detail&taskId=${encodeURIComponent(taskId)}`);
    return {
      task: res.task,
      history: res.history,
      attachments: res.attachments,
      comments: res.comments || [],
    };
  }

  const [initialTaskRes, histRes, attRes, commentsRes] = await Promise.all([
    supabase
      .from('tasks')
      .select(
        '*, customer:customers(*), assignee:profiles!tasks_assigned_to_fkey(*), creator:profiles!tasks_created_by_fkey(*), deleter:profiles!tasks_deleted_by_fkey(*)'
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
    supabase
      .from('task_comments')
      .select('*, author:profiles(*)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true }),
  ]);

  let taskRes = initialTaskRes;
  if (
    taskRes.error &&
    (taskRes.error.code === '42703' ||
      taskRes.error.code === 'PGRST200' ||
      taskRes.error.message.includes('deleted_'))
  ) {
    taskRes = (await supabase
      .from('tasks')
      .select(
        '*, customer:customers(*), assignee:profiles!tasks_assigned_to_fkey(*), creator:profiles!tasks_created_by_fkey(*)'
      )
      .eq('id', taskId)
      .single()) as unknown as typeof initialTaskRes;
  }

  if (taskRes.error) return { task: null, history: [], attachments: [], comments: [] };

  const taskData = taskRes.data as Task;
  const rawAttachments = (attRes.data || []) as Attachment[];

  // Firmar URLs temporales de bucket privado `task-attachments` (1 hora)
  const signedAttachments = await Promise.all(
    rawAttachments.map(async (att) => {
      if (!att.storage_path || att.storage_path.startsWith('demo/')) return att;
      const { data: signed } = await supabase.storage
        .from('task-attachments')
        .createSignedUrl(att.storage_path, 3600);
      return signed?.signedUrl ? { ...att, public_url: signed.signedUrl } : att;
    })
  );

  if (
    taskData.client_signature_url &&
    !taskData.client_signature_url.startsWith('data:') &&
    !taskData.client_signature_url.startsWith('http')
  ) {
    const { data: signedSig } = await supabase.storage
      .from('task-attachments')
      .createSignedUrl(taskData.client_signature_url, 3600);
    if (signedSig?.signedUrl) {
      taskData.client_signature_url = signedSig.signedUrl;
    }
  }

  return {
    task: taskData,
    history: (histRes.data || []) as TaskHistoryItem[],
    attachments: signedAttachments,
    comments: commentsRes.error ? [] : ((commentsRes.data || []) as TaskComment[]),
  };
}

export async function createTask(
  input: {
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
  },
  actor: Profile
): Promise<Task> {
  const effectiveType: TaskType = input.task_type || 'rma_incident';
  const supabase = getSupabaseBrowserClient();
  // Si quien crea el parte es técnico, siempre se autoasigna a él
  const effectiveAssignedTo =
    actor.role === 'technician' ? actor.id : input.assigned_to || null;
  const initialStatus: TaskStatus = effectiveAssignedTo ? 'assigned' : 'pending';
  const normalizedInput = {
    ...input,
    task_type: effectiveType,
    assigned_to: effectiveAssignedTo,
  };

  if (!supabase) {
    const data = await demoPost<{ task: Task }>({
      action: 'create_task',
      payload: normalizedInput,
      actorId: actor.id,
    });
    return data.task;
  }

  let { data, error } = await supabase
    .from('tasks')
    .insert({
      ...normalizedInput,
      code: '',
      status: initialStatus,
      assigned_at: effectiveAssignedTo ? new Date().toISOString() : null,
      created_by: actor.id,
    })
    .select('*, customer:customers(name)')
    .single();

  if (error && error.code === '42703') {
    const {
      due_date: _omitDue,
      task_type: _omitType,
      scheduled_date: _omitSched,
      merchandise_check_done: _omitMerch,
      merchandise_check_notes: _omitMerchNotes,
      meter_bw: _omitBw,
      meter_color: _omitColor,
      ...legacyPayload
    } = normalizedInput;
    void _omitDue;
    void _omitType;
    void _omitSched;
    void _omitMerch;
    void _omitMerchNotes;
    void _omitBw;
    void _omitColor;
    const retry = await supabase
      .from('tasks')
      .insert({
        ...legacyPayload,
        code: '',
        status: initialStatus,
        assigned_at: effectiveAssignedTo ? new Date().toISOString() : null,
        created_by: actor.id,
      })
      .select('*, customer:customers(name)')
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    captureMonitoringError(error, { scope: 'createTask' });
    throw new Error(error.message);
  }

  const created = data as Task;
  await triggerPushEndpoint({
    taskId: created.id,
    actorId: actor.id,
    type: created.assigned_to ? 'task_assigned' : 'task_created',
    title: created.assigned_to
      ? `Nueva tarea asignada: ${created.code}`
      : `Nueva tarea disponible: ${created.code}`,
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
    await demoPost({
      action: 'update_task_status',
      taskId,
      status: newStatus,
      actorId: actor.id,
    });
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

  if (!supabase) {
    await demoPost({
      action: 'add_task_note',
      taskId,
      note: cleanNote,
      actorId: actor.id,
    });
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
    task_type: TaskType;
    customer_id: string;
    site_contact_name: string | null;
    site_contact_phone: string | null;
    site_address: string | null;
    site_city: string | null;
    equipment_ref: string | null;
    equipment_sn: string | null;
    problem_desc: string;
    priority: TaskPriority;
    status: TaskStatus;
    assigned_to: string | null;
    estimated_duration: number | null;
    due_date: string | null;
    scheduled_date: string | null;
    merchandise_check_done: boolean | null;
    merchandise_check_notes: string | null;
    meter_bw: number | null;
    meter_color: number | null;
    materials_used: MaterialItem[];
    client_signature_url: string | null;
    signer_name: string | null;
    resolution_notes: string | null;
  }>,
  actor: Profile
): Promise<void> {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    await demoPost({
      action: 'update_task_fields',
      taskId,
      patch,
      actorId: actor.id,
    });
    return;
  }

  let { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', taskId)
    .select('code')
    .single();

  if (error && error.code === '42703') {
    const {
      due_date: _omitDue,
      task_type: _omitType,
      scheduled_date: _omitSched,
      merchandise_check_done: _omitMerch,
      merchandise_check_notes: _omitMerchNotes,
      meter_bw: _omitBw,
      meter_color: _omitColor,
      ...legacyPatch
    } = patch;
    void _omitDue;
    void _omitType;
    void _omitSched;
    void _omitMerch;
    void _omitMerchNotes;
    void _omitBw;
    void _omitColor;
    if (Object.keys(legacyPatch).length === 0) return;
    const retry = await supabase
      .from('tasks')
      .update(legacyPatch)
      .eq('id', taskId)
      .select('code')
      .single();
    data = retry.data;
    error = retry.error;
  }

  if (error || !data) {
    captureMonitoringError(error, { scope: 'updateTaskFields', taskId });
    throw new Error(error?.message || 'Error actualizando el parte');
  }

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
    type:
      patch.assigned_to !== undefined
        ? 'reassigned'
        : patch.priority !== undefined
        ? 'priority_changed'
        : 'task_updated',
    title: `Parte ${data.code} actualizado`,
    body: `${actor.full_name} ha actualizado el parte.`,
  });
}

export async function softDeleteTask(
  taskId: string,
  reason: string | undefined,
  actor: Profile
): Promise<void> {
  const cleanReason = reason?.trim() || null;
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    await demoPost({
      action: 'soft_delete_task',
      taskId,
      reason: cleanReason,
      actorId: actor.id,
    });
    return;
  }

  const { data, error } = await supabase
    .from('tasks')
    .update({
      deleted_at: new Date().toISOString(),
      deleted_by: actor.id,
      deletion_reason: cleanReason,
    })
    .eq('id', taskId)
    .select('code')
    .single();
  if (error) throw new Error(error.message);

  await triggerPushEndpoint({
    taskId,
    actorId: actor.id,
    type: 'task_updated',
    title: `Parte eliminado: ${data.code}`,
    body: `${actor.full_name} movió el parte a la papelera${
      cleanReason ? ` (${cleanReason})` : ''
    }.`,
  });
}

export async function restoreTask(
  taskId: string,
  actor: Profile
): Promise<void> {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    await demoPost({
      action: 'restore_task',
      taskId,
      actorId: actor.id,
    });
    return;
  }

  const { data, error } = await supabase
    .from('tasks')
    .update({
      deleted_at: null,
      deleted_by: null,
      deletion_reason: null,
    })
    .eq('id', taskId)
    .select('code')
    .single();
  if (error) throw new Error(error.message);

  await triggerPushEndpoint({
    taskId,
    actorId: actor.id,
    type: 'task_updated',
    title: `Parte restaurado: ${data.code}`,
    body: `${actor.full_name} ha recuperado el parte desde la papelera.`,
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

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_ORDER_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB imágenes
const MAX_ORDER_BYTES = 10 * 1024 * 1024; // 10 MB pedidos PDF/imagen

function dataUrlToPngBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const binary = atob(parts[1] || '');
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return new Blob([array], { type: 'image/png' });
}

export async function saveTaskSignature(
  taskId: string,
  dataUrl: string,
  signerName: string,
  actor: Profile
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    await updateTaskFields(
      taskId,
      { client_signature_url: dataUrl, signer_name: signerName },
      actor
    );
    return;
  }

  const path = `${taskId}/signature-${Date.now()}.png`;
  const blob = dataUrlToPngBlob(dataUrl);
  const { error: uploadErr } = await supabase.storage
    .from('task-attachments')
    .upload(path, blob, { contentType: 'image/png', upsert: false });
  if (uploadErr) throw new Error(uploadErr.message);

  await updateTaskFields(
    taskId,
    { client_signature_url: path, signer_name: signerName },
    actor
  );
}

export async function uploadTaskAttachment(
  taskId: string,
  file: File,
  caption: string | undefined,
  actor: Profile,
  options?: { kind?: AttachmentKind }
): Promise<Attachment> {
  const kind: AttachmentKind = options?.kind || 'photo';
  const allowedMimes = kind === 'installation_order' ? ALLOWED_ORDER_MIME : ALLOWED_IMAGE_MIME;
  const maxBytes = kind === 'installation_order' ? MAX_ORDER_BYTES : MAX_UPLOAD_BYTES;

  if (!allowedMimes.has(file.type)) {
    throw new Error(
      kind === 'installation_order'
        ? 'Formato no permitido. Usa PDF, JPG, PNG o WEBP para el pedido de instalación.'
        : 'Formato no permitido. Usa únicamente imágenes JPG, PNG o WEBP.'
    );
  }
  if (file.size > maxBytes) {
    throw new Error(
      `El archivo supera el tamaño máximo permitido (${kind === 'installation_order' ? '10 MB' : '5 MB'}).`
    );
  }

  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    const dataUrl = await fileToDataUrl(file);
    const data = await demoPost<{ attachment: Attachment }>({
      action: 'upload_attachment',
      taskId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: file.type,
      publicUrl: dataUrl,
      caption,
      kind,
      actorId: actor.id,
    });
    return data.attachment;
  }

  const ext =
    file.type === 'application/pdf'
      ? 'pdf'
      : file.type === 'image/png'
      ? 'png'
      : file.type === 'image/webp'
      ? 'webp'
      : 'jpg';
  const prefix = kind === 'installation_order' ? 'pedido' : 'foto';
  const path = `${taskId}/${prefix}-${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('task-attachments')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { data: signedData } = await supabase.storage
    .from('task-attachments')
    .createSignedUrl(path, 3600);

  let { data: attData, error: dbError } = await supabase
    .from('attachments')
    .insert({
      task_id: taskId,
      uploaded_by: actor.id,
      storage_path: path,
      public_url: path, // Almacenamos ruta; siempre se sirve vía URL firmada temporal
      file_name: file.name,
      file_size: file.size,
      mime_type: file.type,
      caption: caption || null,
      attachment_kind: kind,
    })
    .select()
    .single();

  if (dbError && dbError.code === '42703') {
    const fallbackCaption =
      kind === 'installation_order'
        ? `[PEDIDO_INSTALACION] ${caption || file.name}`.trim()
        : caption || null;
    const retry = await supabase
      .from('attachments')
      .insert({
        task_id: taskId,
        uploaded_by: actor.id,
        storage_path: path,
        public_url: path,
        file_name: file.name,
        file_size: file.size,
        mime_type: file.type,
        caption: fallbackCaption,
      })
      .select()
      .single();
    attData = retry.data;
    dbError = retry.error;
  }

  if (dbError) throw new Error(dbError.message);

  await supabase.from('task_history').insert({
    task_id: taskId,
    actor_id: actor.id,
    event_type: 'attachment_added',
    new_value: file.name,
    note:
      kind === 'installation_order'
        ? `Pedido de instalación adjunto: ${file.name}`
        : caption || `Adjunto: ${file.name}`,
  });

  await triggerPushEndpoint({
    taskId,
    actorId: actor.id,
    type: 'task_updated',
    title:
      kind === 'installation_order'
        ? 'Pedido de instalación adjunto'
        : 'Nueva fotografía adjunta',
    body: `${actor.full_name} adjuntó ${file.name}.`,
  });

  const att = attData as Attachment;
  if (signedData?.signedUrl) {
    att.public_url = signedData.signedUrl;
  }
  return att;
}

export async function deleteTaskAttachment(
  taskId: string,
  attachment: Attachment,
  actor: Profile
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    await demoPost({
      action: 'delete_attachment',
      taskId,
      attachmentId: attachment.id,
      actorId: actor.id,
    });
    return;
  }

  if (attachment.storage_path && !attachment.storage_path.startsWith('demo/')) {
    await supabase.storage.from('task-attachments').remove([attachment.storage_path]);
  }

  const { error } = await supabase.from('attachments').delete().eq('id', attachment.id);
  if (error) {
    captureMonitoringError(error, { scope: 'deleteTaskAttachment', taskId });
    throw new Error(error.message);
  }

  await supabase.from('task_history').insert({
    task_id: taskId,
    actor_id: actor.id,
    event_type: 'field_updated',
    field_name: 'attachments',
    old_value: attachment.file_name,
    note: `Fotografía eliminada (${attachment.file_name})`,
  });
}

// ─── COMENTARIOS / CHAT INTERNO DEL PARTE (M4) ───────────────────────────────

export async function listTaskComments(taskId: string): Promise<TaskComment[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const res = await demoGet<{ comments?: TaskComment[] }>(
      `resource=task_detail&taskId=${encodeURIComponent(taskId)}`
    );
    return res.comments || [];
  }

  const { data, error } = await supabase
    .from('task_comments')
    .select('*, author:profiles(*)')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });

  if (error) return [];
  return (data || []) as TaskComment[];
}

export async function addTaskComment(
  taskId: string,
  body: string,
  actor: Profile
): Promise<TaskComment> {
  const cleanBody = body.trim();
  if (!cleanBody) throw new Error('Escribe un mensaje antes de enviarlo.');

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const res = await demoPost<{ comment: TaskComment }>({
      action: 'add_task_comment',
      taskId,
      body: cleanBody,
      actorId: actor.id,
    });
    return res.comment;
  }

  const { data, error } = await supabase
    .from('task_comments')
    .insert({
      task_id: taskId,
      author_id: actor.id,
      body: cleanBody,
    })
    .select('*, author:profiles(*)')
    .single();

  if (error) {
    captureMonitoringError(error, { scope: 'addTaskComment', taskId });
    throw new Error(
      error.code === '42P01' || error.code === 'PGRST205'
        ? 'Falta aplicar la migración 0004 en Supabase para activar comentarios internos.'
        : error.message
    );
  }

  const { data: taskRow } = await supabase
    .from('tasks')
    .select('code')
    .eq('id', taskId)
    .single();

  await triggerPushEndpoint({
    taskId,
    actorId: actor.id,
    type: 'comment_added',
    title: `Nuevo mensaje en ${taskRow?.code || 'parte'}`,
    body: `${actor.full_name}: "${cleanBody.slice(0, 90)}"`,
  });

  return data as TaskComment;
}

// ─── BÚSQUEDA GLOBAL (M3) ────────────────────────────────────────────────────

export interface GlobalSearchResults {
  tasks: Task[];
  customers: Customer[];
  profiles: Profile[];
}

export async function globalSearch(
  query: string,
  viewer: Profile
): Promise<GlobalSearchResults> {
  const clean = query.trim();
  if (clean.length < 2) {
    return { tasks: [], customers: [], profiles: [] };
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return demoGet<GlobalSearchResults>(
      `resource=search&userId=${encodeURIComponent(viewer.id)}&q=${encodeURIComponent(clean)}`
    );
  }

  const safePattern = `%${clean.replace(/[%_]/g, '')}%`;
  const isCoord = viewer.role === 'admin' || viewer.role === 'coordinator';

  const [tasksRes, custRes, profRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, customer:customers(*), assignee:profiles!tasks_assigned_to_fkey(*)')
      .is('deleted_at', null)
      .or(
        `code.ilike.${safePattern},equipment_ref.ilike.${safePattern},equipment_sn.ilike.${safePattern},problem_desc.ilike.${safePattern},site_address.ilike.${safePattern},site_city.ilike.${safePattern}`
      )
      .order('created_at', { ascending: false })
      .limit(8),
    supabase
      .from('customers')
      .select('*')
      .or(
        `name.ilike.${safePattern},tax_id.ilike.${safePattern},city.ilike.${safePattern},contact_name.ilike.${safePattern}`
      )
      .order('name', { ascending: true })
      .limit(6),
    isCoord
      ? supabase
          .from('profiles')
          .select('*')
          .or(`full_name.ilike.${safePattern},email.ilike.${safePattern},phone.ilike.${safePattern}`)
          .order('full_name', { ascending: true })
          .limit(5)
      : Promise.resolve({ data: [] as Profile[], error: null }),
  ]);

  let resolvedTasks = (tasksRes.data || []) as Task[];
  if (
    tasksRes.error &&
    (tasksRes.error.code === '42703' || tasksRes.error.message.includes('deleted_at'))
  ) {
    const legacy = await supabase
      .from('tasks')
      .select('*, customer:customers(*), assignee:profiles!tasks_assigned_to_fkey(*)')
      .or(
        `code.ilike.${safePattern},equipment_ref.ilike.${safePattern},equipment_sn.ilike.${safePattern},problem_desc.ilike.${safePattern},site_address.ilike.${safePattern},site_city.ilike.${safePattern}`
      )
      .limit(8);
    resolvedTasks = (legacy.data || []) as Task[];
  }

  const matchedCustomers = (custRes.data || []) as Customer[];
  if (matchedCustomers.length > 0 && resolvedTasks.length < 8) {
    const custIds = matchedCustomers.map((c) => c.id);
    const { data: byCustomer } = await supabase
      .from('tasks')
      .select('*, customer:customers(*), assignee:profiles!tasks_assigned_to_fkey(*)')
      .in('customer_id', custIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5);
    const seenIds = new Set(resolvedTasks.map((t) => t.id));
    for (const row of (byCustomer || []) as Task[]) {
      if (!seenIds.has(row.id)) {
        resolvedTasks.push(row);
        seenIds.add(row.id);
      }
    }
  }

  return {
    tasks: resolvedTasks.slice(0, 8),
    customers: matchedCustomers,
    profiles: (profRes.data || []) as Profile[],
  };
}

// ─── NOTIFICACIONES IN-APP & PUSH SUBSCRIPTIONS ──────────────────────────────

export async function listNotifications(userId: string): Promise<AppNotification[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const data = await demoGet<{ notifications: AppNotification[] }>(
      `resource=notifications&userId=${encodeURIComponent(userId)}`
    );
    return data.notifications;
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
  if (!supabase) {
    await demoPost({ action: 'mark_notification_read', id });
    return;
  }
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('id', id);
}

export async function markAllNotificationsRead(userId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    await demoPost({ action: 'mark_all_notifications_read', userId });
    return;
  }
  await supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() })
    .eq('recipient_id', userId)
    .eq('is_read', false);
}

export async function listPushSubscriptions(userId: string): Promise<PushSubscriptionRecord[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const data = await demoGet<{ subscriptions: PushSubscriptionRecord[] }>(
      `resource=push_subscriptions&userId=${encodeURIComponent(userId)}`
    );
    return data.subscriptions;
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
    const data = await demoPost<{ subscription: PushSubscriptionRecord }>({
      action: 'save_push_subscription',
      userId,
      sub,
      deviceLabel,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    });
    return data.subscription;
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
    await demoPost({ action: 'remove_push_subscription', subId });
    return;
  }
  await supabase.from('push_subscriptions').delete().eq('id', subId);
}

export async function sendServerTestPush(userId: string): Promise<number> {
  if (!isSupabaseConfigured()) {
    const data = await demoPost<{ sent: number }>({
      action: 'test_push',
      userId,
    });
    return data.sent || 0;
  }

  const res = await fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ testSelf: true }),
  });
  const json = (await res.json()) as { pushCount?: number };
  return json.pushCount || 0;
}

export async function resetServerDemoData(): Promise<void> {
  if (isSupabaseConfigured()) return;
  await demoPost({ action: 'reset_demo' });
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
