import { sendNotification, setVapidDetails } from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';
import { captureMonitoringError } from '@/lib/monitoring';
import { getServerVapidConfig } from '@/lib/vapid-server';

interface PushSubRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface SendWebPushBatchParams {
  supabaseAdmin: SupabaseClient;
  userIds: string[];
  payload: Record<string, unknown>;
  scope: string;
  route: string;
}

export interface SendWebPushBatchResult {
  pushCount: number;
  pushedUserIds: Set<string>;
}

/**
 * Envía Web Push VAPID en paralelo (Promise.allSettled) realizando una única consulta de
 * suscripciones activas y desactivando en lote las suscripciones caducadas/inválidas (401/403/404/410).
 */
export async function sendWebPushBatch({
  supabaseAdmin,
  userIds,
  payload,
  scope,
  route,
}: SendWebPushBatchParams): Promise<SendWebPushBatchResult> {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));
  const pushedUserIds = new Set<string>();
  if (uniqueUserIds.length === 0) {
    return { pushCount: 0, pushedUserIds };
  }

  const vapidCfg = getServerVapidConfig();
  if (!vapidCfg) {
    return { pushCount: 0, pushedUserIds };
  }

  setVapidDetails(vapidCfg.subject, vapidCfg.publicKey, vapidCfg.privateKey);

  const { data: subs, error: subsErr } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', uniqueUserIds)
    .eq('is_active', true);

  if (subsErr || !subs || subs.length === 0) {
    return { pushCount: 0, pushedUserIds };
  }

  const serializedPayload = JSON.stringify(payload);
  const typedSubs = subs as PushSubRow[];

  const results = await Promise.allSettled(
    typedSubs.map((sub) =>
      sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        serializedPayload,
        { TTL: 86400, urgency: 'high' }
      )
    )
  );

  let pushCount = 0;
  const invalidSubIds: string[] = [];

  results.forEach((res, idx) => {
    const sub = typedSubs[idx];
    if (res.status === 'fulfilled') {
      pushCount++;
      pushedUserIds.add(sub.user_id);
      return;
    }

    const err = res.reason as unknown;
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (statusCode === 410 || statusCode === 404 || statusCode === 403 || statusCode === 401) {
      invalidSubIds.push(sub.id);
    }
    console.error(`[Push/${scope}] Error enviando Web Push:`, statusCode, err);
    captureMonitoringError(err, {
      route,
      scope,
      statusCode,
      recipientId: sub.user_id,
    });
  });

  if (invalidSubIds.length > 0) {
    await supabaseAdmin
      .from('push_subscriptions')
      .update({ is_active: false })
      .in('id', invalidSubIds);
  }

  return { pushCount, pushedUserIds };
}
