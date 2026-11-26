import { openDB, type IDBPDatabase } from 'idb';
import type { TaskStatus, MaterialItem } from '@/types/database';

export interface OfflineAction {
  id: string;
  taskId: string;
  actorId: string;
  actionType: 'status_change' | 'add_note' | 'update_materials';
  payload: {
    status?: TaskStatus;
    note?: string;
    materials?: MaterialItem[];
  };
  createdAt: string;
}

const DB_NAME = 'vistasat-offline-db';
const STORE_NAME = 'pending-actions';

async function getDB(): Promise<IDBPDatabase | null> {
  if (typeof window === 'undefined') return null;
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
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

export async function clearOfflineQueue(): Promise<void> {
  const db = await getDB();
  if (!db) return;
  await db.clear(STORE_NAME);
  window.dispatchEvent(new CustomEvent('vistasat:offline-queue-changed'));
}
