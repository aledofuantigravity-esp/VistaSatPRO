import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { loadDemoState } from '@/lib/demo-store';
import {
  normalizeNotificationPreferences,
  syncLegacyNotificationLevel,
} from '@/lib/notification-preferences';
import { validatePasswordStrength } from '@/lib/security';
import { useAppCache } from '@/store/app-cache';
import type {
  Profile,
  PushSubscriptionRecord,
  UserRole,
} from '@/types/database';
import { demoGet, demoPost } from './shared';

const PROFILES_CACHE_TTL_MS = 45_000;
let inFlightProfiles: Promise<Profile[]> | null = null;

export async function listProfiles(options?: { force?: boolean }): Promise<Profile[]> {
  const force = Boolean(options?.force);
  const cache = useAppCache.getState();
  if (
    !force &&
    cache.profilesLoadedAt !== null &&
    Date.now() - cache.profilesLoadedAt < PROFILES_CACHE_TTL_MS
  ) {
    return cache.profiles;
  }

  if (!force && inFlightProfiles) return inFlightProfiles;

  const run = (async (): Promise<Profile[]> => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      try {
        const data = await demoGet<{ profiles: Profile[] }>('resource=profiles');
        useAppCache.getState().setProfiles(data.profiles);
        return data.profiles;
      } catch {
        const fallback = loadDemoState().profiles;
        useAppCache.getState().setProfiles(fallback);
        return fallback;
      }
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('full_name', { ascending: true });
    if (error) throw new Error(error.message);
    const profiles = (data || []) as Profile[];
    useAppCache.getState().setProfiles(profiles);
    return profiles;
  })().finally(() => {
    if (inFlightProfiles === run) inFlightProfiles = null;
  });

  if (!force) inFlightProfiles = run;
  return run;
}

export async function updateProfile(
  profileId: string,
  patch: Partial<
    Pick<
      Profile,
      | 'full_name'
      | 'phone'
      | 'role'
      | 'is_active'
      | 'notification_level'
      | 'notification_preferences'
    >
  >
): Promise<Profile> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const data = await demoPost<{ profile: Profile }>({
      action: 'update_profile',
      profileId,
      patch,
    });
    useAppCache.getState().upsertProfile(data.profile);
    return data.profile;
  }

  if (patch.role !== undefined || patch.is_active !== undefined) {
    return adminUpdateUserProfile(profileId, patch);
  }

  const updatePayload: Record<string, unknown> = {
    ...patch,
    updated_at: new Date().toISOString(),
  };

  if (patch.notification_preferences) {
    const normalized = normalizeNotificationPreferences(patch.notification_preferences);
    updatePayload.notification_preferences = normalized;
    updatePayload.notification_level = syncLegacyNotificationLevel(normalized);
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(updatePayload)
    .eq('id', profileId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  const updated = data as Profile;
  useAppCache.getState().upsertProfile(updated);
  return updated;
}

/**
 * Actualización administrativa de la ficha de cualquier usuario desde /users.
 */
export async function adminUpdateUserProfile(
  targetUserId: string,
  patch: Partial<
    Pick<
      Profile,
      | 'full_name'
      | 'phone'
      | 'role'
      | 'is_active'
      | 'notification_level'
      | 'notification_preferences'
    >
  >
): Promise<Profile> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const data = await demoPost<{ profile: Profile }>({
      action: 'update_profile',
      profileId: targetUserId,
      patch,
    });
    useAppCache.getState().upsertProfile(data.profile);
    return data.profile;
  }

  const res = await fetch(`/api/admin/users/${encodeURIComponent(targetUserId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const json = (await res.json()) as { profile?: Profile; error?: string };
  if (!res.ok || !json.profile) {
    throw new Error(json.error || 'No se pudo actualizar el usuario');
  }
  useAppCache.getState().upsertProfile(json.profile);
  return json.profile;
}

export async function adminListUserPushSubscriptions(
  targetUserId: string
): Promise<PushSubscriptionRecord[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const res = await demoGet<{ subscriptions?: PushSubscriptionRecord[] }>(
      `resource=push_subscriptions&userId=${encodeURIComponent(targetUserId)}`
    );
    return res.subscriptions || [];
  }
  const res = await fetch(`/api/admin/users/${encodeURIComponent(targetUserId)}/push`, {
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { subscriptions?: PushSubscriptionRecord[] };
  return json.subscriptions || [];
}

export async function adminSendTestPushToUser(
  targetUserId: string
): Promise<{ sent: number }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const res = await demoPost<{ sent: number }>({
      action: 'test_push',
      userId: targetUserId,
    });
    return { sent: res.sent || 0 };
  }
  const res = await fetch(`/api/admin/users/${encodeURIComponent(targetUserId)}/push`, {
    method: 'POST',
  });
  const json = (await res.json()) as { sent?: number; error?: string };
  if (!res.ok) {
    throw new Error(json.error || 'No se pudo enviar la notificación Push de prueba.');
  }
  return { sent: json.sent || 0 };
}

export async function adminRevokeUserPushSubscription(
  targetUserId: string,
  subId: string
): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    await demoPost({ action: 'remove_push_subscription', subId });
    return;
  }
  const res = await fetch(`/api/admin/users/${encodeURIComponent(targetUserId)}/push`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ subId }),
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(json.error || 'No se pudo revocar el dispositivo.');
  }
}

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string,
  profile: Profile
): Promise<void> {
  const passCheck = validatePasswordStrength(newPassword);
  if (!passCheck.valid) {
    throw new Error(passCheck.error || 'La nueva contraseña no cumple los requisitos.');
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
