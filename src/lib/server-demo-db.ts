import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { generateVAPIDKeys, sendNotification, setVapidDetails } from 'web-push';
import {
  createInitialDemoState,
  evaluateDemoNotificationRecipients,
  type DemoDatabaseState,
} from './demo-seed';
import type { AppNotification, NotificationType, Task } from '@/types/database';

const DEMO_DB_PATH = path.join(os.tmpdir(), 'vistasat-pro-demo-db.json');

declare global {
  var __vistasatDemoDb: DemoDatabaseState | undefined;
}

function ensureVapidKeys(state: DemoDatabaseState): {
  publicKey: string;
  privateKey: string;
} {
  const envPub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const envPriv = process.env.VAPID_PRIVATE_KEY;

  if (
    envPub &&
    envPriv &&
    !envPub.startsWith('BEl62i...') &&
    envPub.length > 20
  ) {
    return { publicKey: envPub, privateKey: envPriv };
  }

  if (!state.vapidKeys) {
    state.vapidKeys = generateVAPIDKeys();
  }
  return state.vapidKeys;
}

export function getServerDemoDb(): DemoDatabaseState {
  if (globalThis.__vistasatDemoDb) {
    ensureVapidKeys(globalThis.__vistasatDemoDb);
    return globalThis.__vistasatDemoDb;
  }

  let loaded: DemoDatabaseState | null = null;
  try {
    if (existsSync(DEMO_DB_PATH)) {
      const raw = readFileSync(DEMO_DB_PATH, 'utf-8');
      loaded = JSON.parse(raw) as DemoDatabaseState;
    }
  } catch {
    loaded = null;
  }

  const state = loaded ?? createInitialDemoState();
  if (!Array.isArray(state.comments)) {
    state.comments = [];
  }
  ensureVapidKeys(state);
  globalThis.__vistasatDemoDb = state;
  saveServerDemoDb(state);
  return state;
}

export function saveServerDemoDb(state: DemoDatabaseState): void {
  state.revision = (state.revision || 1) + 1;
  globalThis.__vistasatDemoDb = state;
  try {
    mkdirSync(path.dirname(DEMO_DB_PATH), { recursive: true });
    writeFileSync(DEMO_DB_PATH, JSON.stringify(state), 'utf-8');
  } catch {
    // En entornos serverless con FS de solo lectura, queda en memoria caliente
  }
}

export function resetServerDemoDb(): DemoDatabaseState {
  const prevKeys = globalThis.__vistasatDemoDb?.vapidKeys;
  const fresh = createInitialDemoState();
  if (prevKeys) {
    fresh.vapidKeys = prevKeys;
  } else {
    ensureVapidKeys(fresh);
  }
  saveServerDemoDb(fresh);
  return fresh;
}

export function getServerDemoVapidPublicKey(): string {
  const state = getServerDemoDb();
  return ensureVapidKeys(state).publicKey;
}

export async function dispatchServerDemoNotifications(
  state: DemoDatabaseState,
  params: {
    task: Task;
    actorId: string;
    type: NotificationType;
    title: string;
    body: string;
    isNewTask?: boolean;
  }
): Promise<AppNotification[]> {
  const { created, pushEntries } = evaluateDemoNotificationRecipients(state, params);
  if (created.length === 0 && pushEntries.length === 0) return [];

  const keys = ensureVapidKeys(state);
  setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:soporte@vistasat.pro',
    keys.publicKey,
    keys.privateKey
  );

  for (const entry of pushEntries) {
    const subs = state.pushSubscriptions.filter(
      (s) =>
        s.user_id === entry.recipientId &&
        s.is_active &&
        s.endpoint.startsWith('https://')
    );

    for (const sub of subs) {
      try {
        await sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify({
            title: entry.title,
            body: entry.body,
            taskId: entry.taskId,
            type: entry.type,
          })
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number })?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          sub.is_active = false;
        }
      }
    }
  }

  return created;
}

export async function sendTestPushForUser(userId: string): Promise<number> {
  const state = getServerDemoDb();
  const keys = ensureVapidKeys(state);
  setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:soporte@vistasat.pro',
    keys.publicKey,
    keys.privateKey
  );

  const subs = state.pushSubscriptions.filter(
    (s) => s.user_id === userId && s.is_active && s.endpoint.startsWith('https://')
  );

  let sent = 0;
  for (const sub of subs) {
    try {
      await sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({
          title: 'VistaSatPRO — Prueba Push Real',
          body: 'Las notificaciones Push en segundo plano funcionan correctamente en este dispositivo.',
          taskId: null,
          type: 'generic',
        })
      );
      sent++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number })?.statusCode;
      if (statusCode === 410 || statusCode === 404) {
        sub.is_active = false;
      }
    }
  }
  saveServerDemoDb(state);
  return sent;
}
