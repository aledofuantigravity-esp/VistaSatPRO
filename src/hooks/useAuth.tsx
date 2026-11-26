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
import { syncOfflineActions } from '@/lib/data-service';
import type { Profile } from '@/types/database';

interface AuthContextValue {
  profile: Profile | null;
  isLoading: boolean;
  isDemoMode: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signInDemoUser: (userId: string) => Promise<void>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

      setProfile((prof as Profile) || null);
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
      return { error: 'Correo o contraseña incorrectos.' };
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
