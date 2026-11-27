import { isSupabaseConfigured } from '@/lib/supabase/config';
import type { AppNotification } from '@/types/database';

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

export async function demoGet<T>(query: string): Promise<T> {
  const res = await fetch(`/api/demo?${query}`, { cache: 'no-store' });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Error leyendo servidor simulado');
  return json as T;
}

export async function demoPost<T>(body: Record<string, unknown>): Promise<T> {
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

/**
 * Dispara /api/push/send en segundo plano sin bloquear la respuesta visual de la interfaz.
 */
export function triggerPushEndpoint(body: {
  taskId: string;
  actorId: string;
  type: AppNotification['type'];
  title: string;
  body: string;
  isNewTask?: boolean;
}): void {
  if (!isSupabaseConfigured() || !isOnline()) return;
  const { actorId: _unused, ...safeBody } = body;
  void _unused;
  void fetch('/api/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(safeBody),
    keepalive: true,
  }).catch((err) => {
    console.warn('[Push] No se pudo contactar con /api/push/send:', err);
  });
}
