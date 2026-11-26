import { getSupabaseBrowserClient } from './supabase/client';
import { isSupabaseConfigured } from './supabase/config';
import { loadDemoState, saveDemoState } from './demo-store';
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
  patch: Partial<Pick<Profile, 'full_name' | 'phone' | 'role' | 'is_active' | 'notification_level'>>
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

  // Si un Administrador cambia rol, estado activo o edita a otro usuario, usar endpoint server-side
  // para propagar también ban/unban en Supabase Auth y revocar suscripciones Push.
  if (patch.role !== undefined || patch.is_active !== undefined) {
    const res = await fetch(`/api/admin/users/${encodeURIComponent(profileId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: patch.full_name,
        phone: patch.phone,
        role: patch.role,
        is_active: patch.is_active,
      }),
    });
    const json = (await res.json()) as { profile?: Profile; error?: string };
    if (!res.ok || !json.profile) {
      throw new Error(json.error || 'No se pudo actualizar el usuario');
    }
    return json.profile;
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

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
  profile: Profile
): Promise<void> {
  if (newPassword.length < 8) {
    throw new Error('La nueva contraseña debe tener al menos 8 caracteres.');
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

export async function listTasks(viewer: Profile): Promise<Task[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    try {
      const data = await demoGet<{ tasks: Task[] }>(
        `resource=tasks&userId=${encodeURIComponent(viewer.id)}`
      );
      // Guardar caché offline local de forma silenciosa (sin emitir evento de mutación)
      const local = loadDemoState();
      local.tasks = data.tasks;
      saveDemoState(local, false);
      return data.tasks;
    } catch {
      const local = loadDemoState();
      const isCoord = viewer.role === 'admin' || viewer.role === 'coordinator';
      return local.tasks.filter(
        (t) =>
          isCoord ||
          t.assigned_to === viewer.id ||
          (!t.assigned_to && t.status === 'pending')
      );
    }
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
    return demoGet<{
      task: Task | null;
      history: TaskHistoryItem[];
      attachments: Attachment[];
    }>(`resource=task_detail&taskId=${encodeURIComponent(taskId)}`);
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
  // Si quien crea el parte es técnico, siempre se autoasigna a él
  const effectiveAssignedTo =
    actor.role === 'technician' ? actor.id : input.assigned_to || null;
  const initialStatus: TaskStatus = effectiveAssignedTo ? 'assigned' : 'pending';
  const normalizedInput = { ...input, assigned_to: effectiveAssignedTo };

  if (!supabase) {
    const data = await demoPost<{ task: Task }>({
      action: 'create_task',
      payload: normalizedInput,
      actorId: actor.id,
    });
    return data.task;
  }

  const { data, error } = await supabase
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

  if (!supabase) {
    await demoPost({
      action: 'update_task_fields',
      taskId,
      patch,
      actorId: actor.id,
    });
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

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

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
  actor: Profile
): Promise<Attachment> {
  if (!ALLOWED_IMAGE_MIME.has(file.type)) {
    throw new Error('Formato no permitido. Usa únicamente imágenes JPG, PNG o WEBP.');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error('La imagen supera el tamaño máximo permitido (5 MB).');
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
      actorId: actor.id,
    });
    return data.attachment;
  }

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${taskId}/${Date.now()}.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from('task-attachments')
    .upload(path, file, { contentType: file.type, upsert: false });
  if (uploadError) throw new Error(uploadError.message);

  const { data: signedData } = await supabase.storage
    .from('task-attachments')
    .createSignedUrl(path, 3600);

  const { data: attData, error: dbError } = await supabase
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

  await triggerPushEndpoint({
    taskId,
    actorId: actor.id,
    type: 'task_updated',
    title: 'Nueva fotografía adjunta',
    body: `${actor.full_name} adjuntó ${file.name}.`,
  });

  const att = attData as Attachment;
  if (signedData?.signedUrl) {
    att.public_url = signedData.signedUrl;
  }
  return att;
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
