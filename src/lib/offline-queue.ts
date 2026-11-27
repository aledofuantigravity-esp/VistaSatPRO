import { openDB, type IDBPDatabase } from 'idb';
import type { AttachmentKind, MaterialItem, TaskStatus } from '@/types/database';

export interface OfflineAction {
  id: string;
  taskId: string;
  actorId: string;
  actionType:
    | 'status_change'
    | 'add_note'
    | 'update_resolution'
    | 'update_materials'
    | 'update_cxc'
    | 'add_comment'
    | 'save_signature'
    | 'upload_photo';
  payload: {
    status?: TaskStatus;
    note?: string;
    resolution?: string | null;
    materials?: MaterialItem[];
    cxc?: {
      equipment_sn?: string | null;
      meter_bw?: number | null;
      meter_color?: number | null;
    };
    commentBody?: string;
    signature?: {
      dataUrl: string;
      signerName: string;
    };
    photo?: {
      blob: Blob;
      fileName: string;
      mimeType: string;
      caption?: string;
      kind: AttachmentKind;
    };
  };
  createdAt: string;
}

interface SnapshotEntry<T = unknown> {
  key: string;
  data: T;
  savedAt: string;
}

const DB_NAME = 'vistasat-offline-db';
const DB_VERSION = 2;
const STORE_NAME = 'pending-actions';
const SNAPSHOT_STORE = 'offline-snapshots';

async function getDB(): Promise<IDBPDatabase | null> {
  if (typeof window === 'undefined' || typeof indexedDB === 'undefined') return null;
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'key' });
      }
    },
  });
}

export async function enqueueOfflineAction(
  action: Omit<OfflineAction, 'id' | 'createdAt'>
): Promise<OfflineAction | null> {
  const db = await getDB();
  if (!db) return null;

  const entry: OfflineAction = {
    ...action,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };

  await db.put(STORE_NAME, entry);

  // Solicitar Background Sync al Service Worker si está soportado
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const syncReg = reg as ServiceWorkerRegistration & {
        sync?: { register: (tag: string) => Promise<void> };
      };
      await syncReg.sync?.register('sync-pending-actions');
    } catch {
      // Fallback: se sincronizará al detectar evento 'online'
    }
  }

  window.dispatchEvent(new CustomEvent('vistasat:offline-queue-changed'));
  return entry;
}

export async function getPendingOfflineActions(): Promise<OfflineAction[]> {
  const db = await getDB();
  if (!db) return [];
  const items = (await db.getAll(STORE_NAME)) as OfflineAction[];
  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeOfflineAction(id: string): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.delete(STORE_NAME, id);
  window.dispatchEvent(new CustomEvent('vistasat:offline-queue-changed'));
}

export async function saveOfflineSnapshot<T>(key: string, data: T): Promise<void> {
  try {
    const db = await getDB();
    if (!db) return;
    const entry: SnapshotEntry<T> = {
      key,
      data,
      savedAt: new Date().toISOString(),
    };
    await db.put(SNAPSHOT_STORE, entry);
  } catch {
    // Silencioso: p. ej. si algún objeto puntual no fuera serializable o cuota agotada
  }
}

export async function loadOfflineSnapshot<T>(
  key: string
): Promise<{ data: T; savedAt: string } | null> {
  try {
    const db = await getDB();
    if (!db) return null;
    const entry = (await db.get(SNAPSHOT_STORE, key)) as SnapshotEntry<T> | undefined;
    if (!entry) return null;
    return { data: entry.data, savedAt: entry.savedAt };
  } catch {
    return null;
  }
}

export async function clearOfflineSnapshots(): Promise<void> {
  try {
    const db = await getDB();
    if (!db) return;
    await db.clear(SNAPSHOT_STORE);
  } catch {
    // Silencioso
  }
}

export async function clearOfflineQueue(): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.clear(STORE_NAME);
  await db.clear(SNAPSHOT_STORE);
  window.dispatchEvent(new CustomEvent('vistasat:offline-queue-changed'));
}
