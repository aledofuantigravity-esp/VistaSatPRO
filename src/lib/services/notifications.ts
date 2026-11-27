import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import type { AppNotification, PushSubscriptionRecord } from '@/types/database';
import { demoGet, demoPost } from './shared';

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
