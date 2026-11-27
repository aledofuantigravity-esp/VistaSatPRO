import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import {
  compressImageFile,
  mimeTypeForKind,
  validateFileMagicBytes,
  type AllowedBinaryKind,
} from '@/lib/file-validation';
import { captureMonitoringError } from '@/lib/monitoring';
import { enqueueOfflineAction } from '@/lib/offline-queue';
import { useAppCache } from '@/store/app-cache';
import type { Attachment, AttachmentKind, Profile, Task } from '@/types/database';
import { demoPost, isOnline, triggerPushEndpoint } from './shared';

async function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const MAX_RAW_IMAGE_INPUT_BYTES = 25 * 1024 * 1024; // 25 MB previos antes de comprimir
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB imágenes comprimidas
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

/**
 * Extrae el storage_path relativo del bucket `task-attachments` desde una URL firmada o path bruto.
 */
export function extractTaskAttachmentPath(pathOrUrl: string | null | undefined): string | null {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith('data:') || pathOrUrl.startsWith('blob:')) return null;
  if (!pathOrUrl.startsWith('http')) {
    return pathOrUrl.startsWith('demo/') ? null : pathOrUrl;
  }
  const marker = '/storage/v1/object/sign/task-attachments/';
  const idx = pathOrUrl.indexOf(marker);
  if (idx === -1) return null;
  const rest = pathOrUrl.slice(idx + marker.length).split('?')[0];
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

/**
 * Genera una URL firmada fresca (1 hora) para un archivo en el bucket privado `task-attachments`.
 */
export async function refreshSignedUrl(pathOrUrl: string | null | undefined): Promise<string | null> {
  const storagePath = extractTaskAttachmentPath(pathOrUrl);
  if (!storagePath) return null;

  const supabase = getSupabaseBrowserClient();
  if (!supabase || !isOnline()) return null;

  const { data, error } = await supabase.storage
    .from('task-attachments')
    .createSignedUrl(storagePath, 3600);

  if (error || !data?.signedUrl) {
    return null;
  }
  return data.signedUrl;
}

/**
 * Refresca todas las URLs firmadas de un parte y sus adjuntos antes de generar PDFs o reintentar cargas.
 */
export async function refreshTaskMediaUrls(
  task: Task,
  attachments: Attachment[]
): Promise<{ task: Task; attachments: Attachment[] }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase || !isOnline()) {
    return { task, attachments };
  }

  let nextTask = task;
  const sigPath = extractTaskAttachmentPath(task.client_signature_url);
  if (sigPath) {
    const freshSig = await refreshSignedUrl(sigPath);
    if (freshSig) {
      nextTask = { ...task, client_signature_url: freshSig };
    }
  }

  const nextAttachments = await Promise.all(
    attachments.map(async (att) => {
      const attPath = extractTaskAttachmentPath(att.storage_path || att.public_url);
      if (!attPath) return att;
      const freshUrl = await refreshSignedUrl(attPath);
      return freshUrl ? { ...att, public_url: freshUrl } : att;
    })
  );

  return { task: nextTask, attachments: nextAttachments };
}

export async function saveTaskSignature(
  taskId: string,
  dataUrl: string,
  signerName: string,
  actor: Profile
): Promise<{ offlineQueued?: boolean }> {
  const cleanSigner = signerName.trim();

  if (!isOnline()) {
    await enqueueOfflineAction({
      taskId,
      actorId: actor.id,
      actionType: 'save_signature',
      payload: {
        signature: {
          dataUrl,
          signerName: cleanSigner,
        },
      },
    });
    useAppCache.getState().patchTaskOptimistic(taskId, {
      client_signature_url: dataUrl,
      signer_name: cleanSigner,
    });
    return { offlineQueued: true };
  }

  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    await demoPost({
      action: 'update_task_fields',
      taskId,
      patch: { client_signature_url: dataUrl, signer_name: cleanSigner },
      actorId: actor.id,
    });
    useAppCache.getState().invalidateTaskDetail(taskId);
    useAppCache.getState().invalidateTasks();
    return {};
  }

  const path = `${taskId}/signature-${Date.now()}.png`;
  const blob = dataUrlToPngBlob(dataUrl);
  const { error: uploadErr } = await supabase.storage
    .from('task-attachments')
    .upload(path, blob, { contentType: 'image/png', upsert: false });
  if (uploadErr) throw new Error(uploadErr.message);

  const { data: taskRow, error: updateErr } = await supabase
    .from('tasks')
    .update({ client_signature_url: path, signer_name: cleanSigner })
    .eq('id', taskId)
    .select('code')
    .single();
  if (updateErr || !taskRow) {
    throw new Error(updateErr?.message || 'Error guardando la firma en el parte');
  }

  useAppCache.getState().invalidateTaskDetail(taskId);
  useAppCache.getState().invalidateTasks();

  triggerPushEndpoint({
    taskId,
    actorId: actor.id,
    type: 'task_updated',
    title: `Firma registrada en ${taskRow.code}`,
    body: `${actor.full_name} registró la firma de conformidad (${cleanSigner || 'Cliente'}).`,
  });

  return {};
}

export async function uploadTaskAttachment(
  taskId: string,
  file: File,
  caption: string | undefined,
  actor: Profile,
  options?: { kind?: AttachmentKind; skipOfflineQueue?: boolean }
): Promise<Attachment & { offlineQueued?: boolean }> {
  const kind: AttachmentKind = options?.kind || 'photo';
  const allowedBinaryKinds: AllowedBinaryKind[] =
    kind === 'installation_order' ? ['jpeg', 'png', 'webp', 'pdf'] : ['jpeg', 'png', 'webp'];
  const rawLimit = kind === 'installation_order' ? MAX_ORDER_BYTES : MAX_RAW_IMAGE_INPUT_BYTES;

  if (file.size > rawLimit) {
    throw new Error(
      `El archivo supera el tamaño máximo permitido (${kind === 'installation_order' ? '10 MB' : '25 MB antes de comprimir'}).`
    );
  }

  // Validar contenido binario real (magic bytes), no solo la extensión/MIME declarado
  const magicCheck = await validateFileMagicBytes(file, allowedBinaryKinds);
  if (!magicCheck.valid || !magicCheck.detectedKind) {
    throw new Error(magicCheck.error || 'Archivo no válido.');
  }

  const detectedKind = magicCheck.detectedKind;
  let processedFile: File = file;
  let effectiveMime = mimeTypeForKind(detectedKind);

  // Comprimir y redimensionar automáticamente fotografías en cliente antes de subir
  if (detectedKind !== 'pdf') {
    const compressed = await compressImageFile(file, {
      maxDimension: kind === 'physical_work_order' ? 2000 : 1600,
      quality: kind === 'physical_work_order' ? 0.88 : 0.82,
    });
    processedFile = compressed;
    const afterCheck = await validateFileMagicBytes(processedFile, ['jpeg', 'png', 'webp']);
    if (afterCheck.valid && afterCheck.detectedKind) {
      effectiveMime = mimeTypeForKind(afterCheck.detectedKind);
    }
  }

  const finalLimit = kind === 'installation_order' ? MAX_ORDER_BYTES : MAX_UPLOAD_BYTES;
  if (processedFile.size > finalLimit) {
    throw new Error(
      `El archivo sigue superando el límite (${kind === 'installation_order' ? '10 MB' : '5 MB'}) tras optimizarse.`
    );
  }

  // Modo sin conexión real: guardar el Blob comprimido en IndexedDB para subir al reconectar
  if (!isOnline() && !options?.skipOfflineQueue) {
    await enqueueOfflineAction({
      taskId,
      actorId: actor.id,
      actionType: 'upload_photo',
      payload: {
        photo: {
          blob: processedFile,
          fileName: processedFile.name,
          mimeType: effectiveMime,
          caption: caption?.trim() || undefined,
          kind,
        },
      },
    });

    const previewUrl =
      typeof URL !== 'undefined' ? URL.createObjectURL(processedFile) : '';

    return {
      id: `offline-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      task_id: taskId,
      uploaded_by: actor.id,
      storage_path: '',
      public_url: previewUrl,
      file_name: processedFile.name,
      file_size: processedFile.size,
      mime_type: effectiveMime,
      caption: caption?.trim() || null,
      attachment_kind: kind,
      created_at: new Date().toISOString(),
      offlineQueued: true,
    };
  }

  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    const dataUrl = await fileToDataUrl(processedFile);
    const data = await demoPost<{ attachment: Attachment }>({
      action: 'upload_attachment',
      taskId,
      fileName: processedFile.name,
      fileSize: processedFile.size,
      mimeType: effectiveMime,
      publicUrl: dataUrl,
      caption,
      kind,
      actorId: actor.id,
    });
    useAppCache.getState().invalidateTaskDetail(taskId);
    useAppCache.getState().invalidateTasks();
    return data.attachment;
  }

  const ext =
    effectiveMime === 'application/pdf'
      ? 'pdf'
      : effectiveMime === 'image/png'
      ? 'png'
      : effectiveMime === 'image/webp'
      ? 'webp'
      : 'jpg';
  const prefix =
    kind === 'installation_order'
      ? 'pedido'
      : kind === 'physical_work_order'
      ? 'parte-fisico'
      : 'foto';
  const path = `${taskId}/${prefix}-${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from('task-attachments')
    .upload(path, processedFile, { contentType: effectiveMime, upsert: false });
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
      public_url: path,
      file_name: processedFile.name,
      file_size: processedFile.size,
      mime_type: effectiveMime,
      caption: caption || null,
      attachment_kind: kind,
    })
    .select()
    .single();

  if (dbError) {
    // Limpiar el binario subido si falló el registro en BD
    await supabase.storage.from('task-attachments').remove([path]).catch(() => undefined);
    throw new Error(dbError.message);
  }

  await supabase.from('task_history').insert({
    task_id: taskId,
    actor_id: actor.id,
    event_type: 'attachment_added',
    new_value: processedFile.name,
    note:
      kind === 'installation_order'
        ? `Pedido de instalación adjunto: ${processedFile.name}`
        : kind === 'physical_work_order'
        ? `Parte de trabajo físico adjunto: ${processedFile.name}`
        : caption || `Adjunto: ${processedFile.name}`,
  });

  useAppCache.getState().invalidateTaskDetail(taskId);
  useAppCache.getState().invalidateTasks();

  triggerPushEndpoint({
    taskId,
    actorId: actor.id,
    type: 'task_updated',
    title:
      kind === 'installation_order'
        ? 'Pedido de instalación adjunto'
        : 'Nueva fotografía adjunta',
    body: `${actor.full_name} adjuntó ${processedFile.name}.`,
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
    useAppCache.getState().invalidateTaskDetail(taskId);
    useAppCache.getState().invalidateTasks();
    return;
  }

  // Verificar primero borrado del registro en BD para respetar RLS antes de borrar el objeto
  const { error: dbError } = await supabase
    .from('attachments')
    .delete()
    .eq('id', attachment.id);

  if (dbError) {
    captureMonitoringError(dbError, { scope: 'deleteTaskAttachment.db', taskId });
    throw new Error(dbError.message);
  }

  if (attachment.storage_path && !attachment.storage_path.startsWith('demo/')) {
    const { error: storageError } = await supabase.storage
      .from('task-attachments')
      .remove([attachment.storage_path]);
    if (storageError) {
      captureMonitoringError(storageError, {
        scope: 'deleteTaskAttachment.storage',
        taskId,
        storagePath: attachment.storage_path,
      });
    }
  }

  await supabase.from('task_history').insert({
    task_id: taskId,
    actor_id: actor.id,
    event_type: 'field_updated',
    field_name: 'attachments',
    old_value: attachment.file_name,
    note: `Fotografía eliminada (${attachment.file_name})`,
  });

  useAppCache.getState().invalidateTaskDetail(taskId);
  useAppCache.getState().invalidateTasks();
}
