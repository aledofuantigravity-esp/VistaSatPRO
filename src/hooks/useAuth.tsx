'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import {
  getDemoSessionUserId,
  setDemoSessionUserId,
} from '@/lib/demo-store';
import {
  sendPresenceHeartbeat,
  syncOfflineActions,
} from '@/lib/data-service';
import { clearOfflineQueue } from '@/lib/offline-queue';
import type { Profile } from '@/types/database';

interface AuthContextValue {
  profile: Profile | null;
  isLoading: boolean;
  isDemoMode: boolean;
  onlineUserIds: string[];
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signInDemoUser: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function purgeClientSessionData() {
  try {
    await clearOfflineQueue();
  } catch {
    // Silencioso
  }
  if (typeof window !== 'undefined') {
    Object.keys(localStorage).forEach((k) => {
      if (k.startsWith('vistasat')) {
        localStorage.removeItem(k);
      }
    });
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_USER_CACHES' });
    }
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const router = useRouter();
  const isDemoMode = !isSupabaseConfigured();

  const loadCurrentUser = useCallback(async () => {
    await Promise.resolve();
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      const uid = getDemoSessionUserId();
      if (!uid) {
        setProfile(null);
        setIsLoading(false);
        return;
      }
      try {
        const res = await fetch(
          `/api/demo?resource=profile&userId=${encodeURIComponent(uid)}`,
          { cache: 'no-store' }
        );
        const data = (await res.json()) as { profile: Profile | null };
        if (data.profile && !data.profile.is_active) {
          setDemoSessionUserId(null);
          setProfile(null);
          return;
        }
        setProfile((prev) => {
          if (
            prev &&
            data.profile &&
            prev.id === data.profile.id &&
            prev.updated_at === data.profile.updated_at &&
            prev.role === data.profile.role &&
            prev.notification_level === data.profile.notification_level
          ) {
            return prev;
          }
          return data.profile;
        });
      } catch {
        // Mantener perfil en memoria si falla puntualmente una petición
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setProfile(null);
        setIsLoading(false);
        return;
      }

      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      const typedProf = (prof as Profile) || null;
      if (typedProf && !typedProf.is_active) {
        await supabase.auth.signOut();
        await purgeClientSessionData();
        setProfile(null);
        setIsLoading(false);
        return;
      }

      setProfile(typedProf);
    } catch {
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void loadCurrentUser(), 0);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      const handleUpdate = () => void loadCurrentUser();
      window.addEventListener('vistasat:demo-updated', handleUpdate);
      return () => {
        clearTimeout(t);
        window.removeEventListener('vistasat:demo-updated', handleUpdate);
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadCurrentUser();
    });

    return () => {
      clearTimeout(t);
      subscription.unsubscribe();
    };
  }, [loadCurrentUser]);

  // Sincronización automática de acciones offline al recuperar red
  useEffect(() => {
    if (!profile) return;
    const handleOnline = () => {
      syncOfflineActions(profile);
    };
    window.addEventListener('online', handleOnline);
    if (navigator.onLine) {
      syncOfflineActions(profile);
    }
    return () => window.removeEventListener('online', handleOnline);
  }, [profile]);

  // Presencia en tiempo real + heartbeat de última conexión
  const profileId = profile?.id;
  useEffect(() => {
    if (!profileId) return;

    void sendPresenceHeartbeat(profileId, true);

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void sendPresenceHeartbeat(profileId, true);
      }
    }, 45000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void sendPresenceHeartbeat(profileId, true);
      } else {
        void sendPresenceHeartbeat(profileId, false, true);
      }
    };

    const handlePageHide = () => {
      void sendPresenceHeartbeat(profileId, false, true);
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', handlePageHide);

    const supabase = getSupabaseBrowserClient();
    let presenceChannel: ReturnType<NonNullable<typeof supabase>['channel']> | null = null;
    if (supabase) {
      presenceChannel = supabase.channel('presence:online-users', {
        config: { presence: { key: profileId } },
      });
      presenceChannel
        .on('presence', { event: 'sync' }, () => {
          const state = presenceChannel?.presenceState() || {};
          setOnlineUserIds(Object.keys(state));
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            void presenceChannel?.track({
              user_id: profileId,
              online_at: new Date().toISOString(),
            });
          }
        });
    }

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', handlePageHide);
      if (presenceChannel && supabase) {
        void supabase.removeChannel(presenceChannel);
      }
    };
  }, [profileId]);

  const signIn = async (email: string, password: string) => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      try {
        const res = await fetch('/api/demo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'login', email, password }),
        });
        const data = (await res.json()) as { profile?: Profile; error?: string };
        if (!res.ok || !data.profile) {
          return { error: data.error || 'Credenciales incorrectas o cuenta inactiva.' };
        }
        setDemoSessionUserId(data.profile.id);
        setProfile(data.profile);
        router.push('/dashboard');
        return {};
      } catch {
        return { error: 'No se pudo conectar con el servidor de prueba.' };
      }
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return { error: 'Correo o contraseña incorrectos o cuenta desactivada.' };
    }
    await loadCurrentUser();
    router.push('/dashboard');
    return {};
  };

  const signInDemoUser = async (userId: string) => {
    const res = await fetch(
      `/api/demo?resource=profile&userId=${encodeURIComponent(userId)}`,
      { cache: 'no-store' }
    );
    const data = (await res.json()) as { profile: Profile | null };
    if (!data.profile) return;
    setDemoSessionUserId(data.profile.id);
    setProfile(data.profile);
    router.push('/dashboard');
  };

  const signOut = async () => {
    if (profile?.id) {
      await sendPresenceHeartbeat(profile.id, false);
    }
    await purgeClientSessionData();

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setDemoSessionUserId(null);
      setProfile(null);
      router.push('/login');
      return;
    }
    await supabase.auth.signOut();
    setProfile(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        profile,
        isLoading,
        isDemoMode,
        onlineUserIds,
        signIn,
        signInDemoUser,
        signOut,
        refreshProfile: loadCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}
