import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { loadDemoState, saveDemoState } from '@/lib/demo-store';
import { captureMonitoringError } from '@/lib/monitoring';
import {
  enqueueOfflineAction,
  loadOfflineSnapshot,
  saveOfflineSnapshot,
} from '@/lib/offline-queue';
import { useAppCache, type CachedTaskDetail } from '@/store/app-cache';
import {
  getTaskStatusLabel,
  normalizeTaskStatus,
  TASK_PRIORITY_META,
  type Attachment,
  type Customer,
  type MaterialItem,
  type Profile,
  type Task,
  type TaskComment,
  type TaskHistoryItem,
  type TaskPriority,
  type TaskStatus,
  type TaskType,
} from '@/types/database';
import { demoGet, demoPost, isOnline, triggerPushEndpoint } from './shared';

export interface ListTasksResult {
  tasks: Task[];
  hasMoreClosed: boolean;
}

/**
 * Consulta partes de trabajo visibles para el usuario.
 * Si se pasa `limitClosed`, descarga todos los partes abiertos + hasta `limitClosed`
 * partes cerrados/cancelados para mantener respuestas rápidas en históricos grandes.
 */
export async function listTasks(
  viewer: Profile,
  options?: { includeDeleted?: boolean; limitClosed?: number }
): Promise<Task[]> {
  const includeDeleted = Boolean(options?.includeDeleted);
  const limitClosed = options?.limitClosed;
  const snapshotKey = `tasks:${viewer.id}:${includeDeleted ? 'all' : 'active'}`;
  const viewerKey = `${viewer.id}:${viewer.role}`;

  if (!isOnline()) {
    const snap = await loadOfflineSnapshot<Task[]>(snapshotKey);
    if (snap?.data) {
      useAppCache.getState().setTasks(snap.data, viewerKey, includeDeleted);
      return snap.data;
    }
    const cached = useAppCache.getState().tasks;
    if (cached.length > 0) return cached;
  }

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
      useAppCache.getState().setTasks(data.tasks, viewerKey, includeDeleted);
      void saveOfflineSnapshot(snapshotKey, data.tasks);
      return data.tasks;
    } catch {
      const local = loadDemoState();
      const isCoord = viewer.role === 'admin' || viewer.role === 'coordinator';
      const fallback = local.tasks.filter((t) => {
        if (!includeDeleted && t.deleted_at) return false;
        if (isCoord) return true;
        return (
          t.assigned_to === viewer.id ||
          t.created_by === viewer.id ||
          t.deleted_by === viewer.id ||
          (!t.assigned_to && t.status === 'pending')
        );
      });
      useAppCache.getState().setTasks(fallback, viewerKey, includeDeleted);
      return fallback;
    }
  }

  const selectClause =
    '*, customer:customers(*), assignee:profiles!tasks_assigned_to_fkey(*), creator:profiles!tasks_created_by_fkey(*), deleter:profiles!tasks_deleted_by_fkey(*), attachments(id)';

  const mapRows = (
    rows: Array<Task & { attachments?: Array<{ id: string }> }> | null
  ): Task[] =>
    (rows || []).map((row) => {
      const { attachments: rawAtts, ...rest } = row;
      return {
        ...rest,
        status: normalizeTaskStatus(rest.status),
        attachment_count: Array.isArray(rawAtts) ? rawAtts.length : 0,
      };
    });

  let tasks: Task[];

  if (limitClosed && limitClosed > 0 && !includeDeleted) {
    const [openRes, closedRes] = await Promise.all([
      supabase
        .from('tasks')
        .select(selectClause)
        .is('deleted_at', null)
        .not('status', 'in', '("completed","cancelled")')
        .order('created_at', { ascending: false }),
      supabase
        .from('tasks')
        .select(selectClause)
        .is('deleted_at', null)
        .in('status', ['completed', 'cancelled'])
        .order('created_at', { ascending: false })
        .limit(limitClosed),
    ]);

    if (openRes.error || closedRes.error) {
      const err = openRes.error || closedRes.error!;
      captureMonitoringError(err, { scope: 'listTasks.paginated' });
      throw new Error(err.message);
    }

    const combined = [
      ...mapRows(openRes.data as Array<Task & { attachments?: Array<{ id: string }> }>),
      ...mapRows(closedRes.data as Array<Task & { attachments?: Array<{ id: string }> }>),
    ];
    tasks = combined.sort((a, b) => b.created_at.localeCompare(a.created_at));
  } else {
    let query = supabase
      .from('tasks')
      .select(selectClause)
      .order('created_at', { ascending: false });

    if (!includeDeleted) {
      query = query.is('deleted_at', null);
    }

    const { data, error } = await query;
    if (error) {
      captureMonitoringError(error, { scope: 'listTasks' });
      throw new Error(error.message);
    }

    tasks = mapRows(data as Array<Task & { attachments?: Array<{ id: string }> }>);
  }

  useAppCache.getState().setTasks(tasks, viewerKey, includeDeleted);
  void saveOfflineSnapshot(snapshotKey, tasks);
  return tasks;
}

export async function getTaskDetail(taskId: string): Promise<{
  task: Task | null;
  history: TaskHistoryItem[];
  attachments: Attachment[];
  comments: TaskComment[];
}> {
  const detailSnapshotKey = `detail:${taskId}`;

  if (!isOnline()) {
    const snap = await loadOfflineSnapshot<{
      task: Task | null;
      history: TaskHistoryItem[];
      attachments: Attachment[];
      comments: TaskComment[];
    }>(detailSnapshotKey);
    if (snap?.data) {
      return snap.data;
    }
    const cached = useAppCache.getState().taskDetails[taskId];
    if (cached) {
      return {
        task: cached.task,
        history: cached.history,
        attachments: cached.attachments,
        comments: cached.comments,
      };
    }
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const res = await demoGet<{
      task: Task | null;
      history: TaskHistoryItem[];
      attachments: Attachment[];
      comments?: TaskComment[];
    }>(`resource=task_detail&taskId=${encodeURIComponent(taskId)}`);
    const result = {
      task: res.task ? { ...res.task, status: normalizeTaskStatus(res.task.status) } : null,
      history: res.history,
      attachments: res.attachments,
      comments: res.comments || [],
    };
    if (result.task) {
      useAppCache.getState().setTaskDetail(taskId, result as Omit<CachedTaskDetail, 'loadedAt'>);
      void saveOfflineSnapshot(detailSnapshotKey, result);
    }
    return result;
  }

  const [taskRes, histRes, attRes, commentsRes] = await Promise.all([
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

  if (taskRes.error) return { task: null, history: [], attachments: [], comments: [] };

  const taskData = taskRes.data as Task;
  taskData.status = normalizeTaskStatus(taskData.status);
  const rawAttachments = (attRes.data || []) as Attachment[];

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

  const result = {
    task: taskData,
    history: (histRes.data || []) as TaskHistoryItem[],
    attachments: signedAttachments,
    comments: commentsRes.error ? [] : ((commentsRes.data || []) as TaskComment[]),
  };

  useAppCache.getState().setTaskDetail(taskId, result);
  void saveOfflineSnapshot(detailSnapshotKey, result);
  return result;
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

  const initialAssignedTo =
    actor.role === 'technician' ? actor.id : input.assigned_to || null;
  let effectiveAssignedTo: string | null = initialAssignedTo;

  if (!effectiveAssignedTo && supabase) {
    const { data: activeTechs } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'technician')
      .eq('is_active', true);
    if (activeTechs && activeTechs.length === 1) {
      effectiveAssignedTo = activeTechs[0].id;
    }
  }

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
    useAppCache.getState().invalidateTasks();
    return data.task;
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert({
      ...normalizedInput,
      code: '',
      status: 'pending' as TaskStatus,
      assigned_at: effectiveAssignedTo ? new Date().toISOString() : null,
      created_by: actor.id,
    })
    .select('*, customer:customers(name)')
    .single();

  if (error) {
    captureMonitoringError(error, { scope: 'createTask' });
    throw new Error(error.message);
  }

  const created = data as Task;
  useAppCache.getState().invalidateTasks();

  triggerPushEndpoint({
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
  const nowIso = new Date().toISOString();

  if (!isOnline()) {
    await enqueueOfflineAction({
      taskId,
      actorId: actor.id,
      actionType: 'status_change',
      payload: { status: newStatus },
    });
    useAppCache.getState().patchTaskOptimistic(taskId, {
      status: newStatus,
      ...(newStatus === 'completed' ? { completed_at: nowIso } : {}),
    });
    return { offlineQueued: true };
  }

  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    await demoPost({
      action: 'update_task_status',
      taskId,
      status: newStatus,
      actorId: actor.id,
    });
    useAppCache.getState().invalidateTaskDetail(taskId);
    useAppCache.getState().invalidateTasks();
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

  useAppCache.getState().invalidateTaskDetail(taskId);
  useAppCache.getState().invalidateTasks();

  triggerPushEndpoint({
    taskId,
    actorId: actor.id,
    type: 'status_changed',
    title: `Estado actualizado en ${data.code}`,
    body: `${actor.full_name} cambió el estado a "${getTaskStatusLabel(newStatus)}".`,
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
    useAppCache.getState().patchTaskOptimistic(taskId, {
      resolution_notes: cleanNote,
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
    useAppCache.getState().invalidateTaskDetail(taskId);
    useAppCache.getState().invalidateTasks();
    return {};
  }

  const { data, error } = await supabase
    .from('tasks')
    .update({ resolution_notes: cleanNote })
    .eq('id', taskId)
    .select('code')
    .single();
  if (error) throw new Error(error.message);

  useAppCache.getState().invalidateTaskDetail(taskId);
  useAppCache.getState().invalidateTasks();

  triggerPushEndpoint({
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
    physical_work_order_attached: boolean | null;
    meter_bw: number | null;
    meter_color: number | null;
    materials_used: MaterialItem[];
    client_signature_url: string | null;
    signer_name: string | null;
    resolution_notes: string | null;
  }>,
  actor: Profile
): Promise<{ offlineQueued?: boolean }> {
  // Soporte offline para actualización de materiales o lecturas CXC
  if (!isOnline()) {
    const keys = Object.keys(patch);
    const onlyMaterials = keys.length === 1 && keys[0] === 'materials_used';
    const isCxcUpdate = keys.every((k) =>
      ['equipment_sn', 'meter_bw', 'meter_color'].includes(k)
    );

    if (onlyMaterials && patch.materials_used) {
      await enqueueOfflineAction({
        taskId,
        actorId: actor.id,
        actionType: 'update_materials',
        payload: { materials: patch.materials_used },
      });
      useAppCache.getState().patchTaskOptimistic(taskId, {
        materials_used: patch.materials_used,
      });
      return { offlineQueued: true };
    }

    if (isCxcUpdate) {
      await enqueueOfflineAction({
        taskId,
        actorId: actor.id,
        actionType: 'update_cxc',
        payload: {
          cxc: {
            equipment_sn: patch.equipment_sn,
            meter_bw: patch.meter_bw,
            meter_color: patch.meter_color,
          },
        },
      });
      useAppCache.getState().patchTaskOptimistic(taskId, patch);
      return { offlineQueued: true };
    }

    throw new Error('Esta modificación requiere conexión a Internet.');
  }

  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    await demoPost({
      action: 'update_task_fields',
      taskId,
      patch,
      actorId: actor.id,
    });
    useAppCache.getState().invalidateTaskDetail(taskId);
    useAppCache.getState().invalidateTasks();
    return {};
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(patch)
    .eq('id', taskId)
    .select('code')
    .single();

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

  useAppCache.getState().invalidateTaskDetail(taskId);
  useAppCache.getState().invalidateTasks();

  triggerPushEndpoint({
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

  return {};
}

/**
 * Actualización en lote de técnico asignado o prioridad sobre múltiples partes seleccionados.
 */
export async function bulkUpdateTasks(
  taskIds: string[],
  patch: { assigned_to?: string | null; priority?: TaskPriority },
  actor: Profile
): Promise<number> {
  if (taskIds.length === 0) return 0;
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    const res = await demoPost<{ updatedCount?: number }>({
      action: 'bulk_update_tasks',
      taskIds,
      patch,
      actorId: actor.id,
    });
    useAppCache.getState().invalidateTasks();
    return res.updatedCount ?? taskIds.length;
  }

  const updatePayload: Record<string, unknown> = { ...patch };
  if (patch.assigned_to !== undefined) {
    updatePayload.assigned_at = patch.assigned_to ? new Date().toISOString() : null;
  }

  const { data, error } = await supabase
    .from('tasks')
    .update(updatePayload)
    .in('id', taskIds)
    .is('deleted_at', null)
    .select('id, code');

  if (error) {
    captureMonitoringError(error, { scope: 'bulkUpdateTasks' });
    throw new Error(error.message);
  }

  const updatedRows = (data || []) as Array<{ id: string; code: string }>;
  useAppCache.getState().invalidateTasks();
  for (const row of updatedRows) {
    useAppCache.getState().invalidateTaskDetail(row.id);
    triggerPushEndpoint({
      taskId: row.id,
      actorId: actor.id,
      type:
        patch.assigned_to !== undefined
          ? 'reassigned'
          : patch.priority !== undefined
          ? 'priority_changed'
          : 'task_updated',
      title: `Parte ${row.code} actualizado`,
      body:
        patch.priority !== undefined
          ? `${actor.full_name} cambió la prioridad a ${TASK_PRIORITY_META[patch.priority].label}.`
          : `${actor.full_name} actualizó la asignación en lote.`,
    });
  }

  return updatedRows.length;
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
    useAppCache.getState().invalidateTaskDetail(taskId);
    useAppCache.getState().invalidateTasks();
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

  useAppCache.getState().invalidateTaskDetail(taskId);
  useAppCache.getState().invalidateTasks();

  triggerPushEndpoint({
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
    useAppCache.getState().invalidateTaskDetail(taskId);
    useAppCache.getState().invalidateTasks();
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

  useAppCache.getState().invalidateTaskDetail(taskId);
  useAppCache.getState().invalidateTasks();

  triggerPushEndpoint({
    taskId,
    actorId: actor.id,
    type: 'task_updated',
    title: `Parte restaurado: ${data.code}`,
    body: `${actor.full_name} ha recuperado el parte desde la papelera.`,
  });
}

// ─── COMENTARIOS / CHAT INTERNO DEL PARTE ────────────────────────────────────

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
): Promise<TaskComment & { offlineQueued?: boolean }> {
  const cleanBody = body.trim();
  if (!cleanBody) throw new Error('Escribe un mensaje antes de enviarlo.');

  if (!isOnline()) {
    await enqueueOfflineAction({
      taskId,
      actorId: actor.id,
      actionType: 'add_comment',
      payload: { commentBody: cleanBody },
    });
    return {
      id: `offline-comm-${Date.now()}`,
      task_id: taskId,
      author_id: actor.id,
      body: `${cleanBody} (Pendiente de enviar sin red)`,
      created_at: new Date().toISOString(),
      author: actor,
      offlineQueued: true,
    };
  }

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
    throw new Error(error.message);
  }

  const { data: taskRow } = await supabase
    .from('tasks')
    .select('code')
    .eq('id', taskId)
    .single();

  triggerPushEndpoint({
    taskId,
    actorId: actor.id,
    type: 'comment_added',
    title: `Nuevo mensaje en ${taskRow?.code || 'parte'}`,
    body: `${actor.full_name}: "${cleanBody.slice(0, 90)}"`,
  });

  return data as TaskComment;
}

// ─── BÚSQUEDA GLOBAL ─────────────────────────────────────────────────────────

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

  const resolvedTasks = (tasksRes.data || []) as Task[];
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
