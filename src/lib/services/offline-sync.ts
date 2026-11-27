import { getPendingOfflineActions, removeOfflineAction } from '@/lib/offline-queue';
import type { Profile } from '@/types/database';
import { saveTaskSignature, uploadTaskAttachment } from './attachments';
import { isOnline } from './shared';
import {
  addTaskComment,
  addTaskNote,
  updateTaskFields,
  updateTaskStatus,
} from './tasks';

let syncInProgress: Promise<number> | null = null;

/**
 * Procesa ordenadamente todas las acciones almacenadas en IndexedDB cuando el dispositivo
 * recupera conexión a Internet.
 */
export async function syncOfflineActions(actor: Profile): Promise<number> {
  if (!isOnline()) return 0;
  if (syncInProgress) return syncInProgress;

  syncInProgress = (async () => {
    const actions = await getPendingOfflineActions();
    if (actions.length === 0) return 0;

    let synced = 0;
    for (const action of actions) {
      try {
        if (action.actionType === 'status_change' && action.payload.status) {
          await updateTaskStatus(action.taskId, action.payload.status, actor);
        } else if (action.actionType === 'add_note' && action.payload.note) {
          await addTaskNote(action.taskId, action.payload.note, actor);
        } else if (action.actionType === 'update_resolution') {
          await updateTaskFields(
            action.taskId,
            { resolution: action.payload.resolution ?? null },
            actor
          );
        } else if (action.actionType === 'update_materials' && action.payload.materials) {
          await updateTaskFields(
            action.taskId,
            { materials_used: action.payload.materials },
            actor
          );
        } else if (action.actionType === 'update_cxc' && action.payload.cxc) {
          await updateTaskFields(action.taskId, action.payload.cxc, actor);
        } else if (action.actionType === 'add_comment' && action.payload.commentBody) {
          await addTaskComment(action.taskId, action.payload.commentBody, actor);
        } else if (action.actionType === 'save_signature' && action.payload.signature) {
          await saveTaskSignature(
            action.taskId,
            action.payload.signature.dataUrl,
            action.payload.signature.signerName,
            actor
          );
        } else if (action.actionType === 'upload_photo' && action.payload.photo) {
          const p = action.payload.photo;
          const reconstructed = new File([p.blob], p.fileName, {
            type: p.mimeType || 'image/jpeg',
            lastModified: Date.now(),
          });
          await uploadTaskAttachment(action.taskId, reconstructed, p.caption, actor, {
            kind: p.kind,
            skipOfflineQueue: true,
          });
        }
        await removeOfflineAction(action.id);
        synced++;
      } catch (err) {
        console.warn('[OfflineSync] Error sincronizando acción:', action.id, err);
      }
    }

    if (synced > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('vistasat:offline-synced', { detail: { count: synced } })
      );
    }
    return synced;
  })();

  try {
    return await syncInProgress;
  } finally {
    syncInProgress = null;
  }
}
