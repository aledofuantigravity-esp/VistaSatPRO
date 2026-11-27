'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, ShieldCheck, UserCheck, Wrench } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { isSupabaseConfigured } from '@/lib/supabase/config';
import { InstallBanner } from '@/components/pwa/InstallBanner';
import { InstallGuideSheet } from '@/components/pwa/InstallGuideSheet';
import { Button } from '@/components/ui/Button';

export default function LoginPage() {
  const { profile, isLoading: authLoading, isDemoMode, signIn, signInDemoUser } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && profile) {
      router.replace('/dashboard');
    }
  }, [authLoading, profile, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    const res = await signIn(email, password);
    if (res.error) {
      setError(res.error);
      setIsLoading(false);
    }
  };

  return (
    <>
      <main
        className="min-h-dvh flex flex-col bg-navy"
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        {/* Cabecera corporativa */}
        <div className="flex-shrink-0 px-6 pt-10 pb-7 text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 rounded-lg mb-4 mx-auto">
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
              <rect x="6" y="16" width="32" height="22" rx="3" stroke="white" strokeWidth="2.5" />
              <path
                d="M15 16V13C15 11.3 16.3 10 18 10H26C27.7 10 29 11.3 29 13V16"
                stroke="#CF095E"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
              <line x1="6" y1="26" x2="38" y2="26" stroke="white" strokeWidth="2" strokeOpacity="0.4" />
              <circle cx="22" cy="26" r="3" fill="#CF095E" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-white tracking-tight">
            Vista<span className="text-magenta">Sat</span>PRO
          </h1>
          <p className="text-sm text-white/70 mt-1 font-medium">
            Gestión Integral de Servicio Técnico
          </p>
        </div>

        {/* Formulario */}
        <div
          className="flex-1 bg-off-white rounded-t-lg px-6 pt-8 pb-8 flex flex-col items-center"
          style={{ paddingBottom: 'max(var(--safe-bottom), 32px)' }}
        >
          <div className="w-full max-w-md">
            <h2 className="text-lg font-bold text-charcoal mb-1">Iniciar sesión</h2>
            <p className="text-sm text-mid-grey mb-6">
              Accede con tu cuenta corporativa asignada
            </p>

            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-semibold text-dark-grey mb-1.5"
                >
                  Correo electrónico
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nombre@empresa.com"
                  className="w-full px-4 py-3 bg-white dark:bg-surface border border-border text-charcoal placeholder:text-light-grey focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-semibold text-dark-grey mb-1.5"
                >
                  Contraseña
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-4 py-3 pr-12 bg-white dark:bg-surface border border-border text-charcoal placeholder:text-light-grey focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-mid-grey hover:text-charcoal"
                    aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-danger/10 border-l-4 border-danger text-sm text-danger font-medium">
                  {error}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isLoading}
                disabled={!email || !password}
                className="w-full"
              >
                {isLoading ? 'Accediendo...' : 'Acceder'}
              </Button>
            </form>

            {/* Aviso cuando el entorno productivo no tiene backend configurado */}
            {!isSupabaseConfigured() && !isDemoMode && (
              <div className="mt-6 p-4 bg-warning/10 border-l-4 border-warning text-xs text-charcoal space-y-1">
                <p className="font-bold text-navy dark:text-sky-300 flex items-center gap-1.5">
                  <Lock size={14} /> Entorno privado en mantenimiento
                </p>
                <p className="text-mid-grey leading-relaxed">
                  El acceso rápido de pruebas está deshabilitado en producción por seguridad.
                  Contacta con el administrador si necesitas activar las credenciales de servicio.
                </p>
              </div>
            )}

            {/* Acceso rápido Demo cuando no hay credenciales Supabase configuradas */}
            {isDemoMode && (
              <div className="mt-7 p-4 bg-white dark:bg-surface border border-border rounded-md shadow-card">
                <div className="flex items-center gap-2 mb-2">
                  <Wrench size={15} className="text-magenta" />
                  <span className="text-xs font-extrabold text-navy dark:text-sky-300 uppercase tracking-wider">
                    Acceso rápido — Entorno de Prueba en Servidor
                  </span>
                </div>
                <p className="text-xs text-mid-grey mb-3 leading-relaxed">
                  Sin base de datos externa: todos los cambios y avisos se comparten en el
                  servidor entre dispositivos (clave manual: <code>demo1234</code>):
                </p>

                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    disabled={authLoading}
                    onClick={() => signInDemoUser('user-tech-1')}
                    className="flex items-center justify-between px-3 py-2.5 bg-off-white hover:bg-navy/5 border border-border text-left transition-colors min-h-[46px] disabled:opacity-60"
                  >
                    <div className="flex items-center gap-2.5">
                      <Wrench size={16} className="text-petrol dark:text-sky-400" />
                      <div>
                        <p className="text-xs font-bold text-charcoal">Javier Ruiz (Técnico)</p>
                        <p className="text-[11px] text-mid-grey">tecnico@vistalegre.com</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-navy dark:text-sky-300">Entrar →</span>
                  </button>

                  <button
                    type="button"
                    disabled={authLoading}
                    onClick={() => signInDemoUser('user-coord-1')}
                    className="flex items-center justify-between px-3 py-2.5 bg-off-white hover:bg-navy/5 dark:hover:bg-white/10 border border-border text-left transition-colors min-h-[46px] disabled:opacity-60"
                  >
                    <div className="flex items-center gap-2.5">
                      <UserCheck size={16} className="text-magenta" />
                      <div>
                        <p className="text-xs font-bold text-charcoal">Laura Navarro (Coordinadora)</p>
                        <p className="text-[11px] text-mid-grey">coordinador@vistalegre.com</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-navy dark:text-sky-300">Entrar →</span>
                  </button>

                  <button
                    type="button"
                    disabled={authLoading}
                    onClick={() => signInDemoUser('user-admin-1')}
                    className="flex items-center justify-between px-3 py-2.5 bg-off-white hover:bg-navy/5 dark:hover:bg-white/10 border border-border text-left transition-colors min-h-[46px] disabled:opacity-60"
                  >
                    <div className="flex items-center gap-2.5">
                      <ShieldCheck size={16} className="text-navy dark:text-sky-300" />
                      <div>
                        <p className="text-xs font-bold text-charcoal">Carlos Mendoza (Admin)</p>
                        <p className="text-[11px] text-mid-grey">admin@vistalegre.com</p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-navy dark:text-sky-300">Entrar →</span>
                  </button>
                </div>
              </div>
            )}

            <div className="mt-7 pt-4 border-t border-border/60 text-center space-y-1">
              <p className="text-xs font-semibold text-mid-grey">
                Portal interno de gestión técnica · Vistalegre Solutions
              </p>
              <p className="text-[11px] text-light-grey leading-relaxed">
                Uso exclusivo para personal autorizado de asistencia técnica. Conexión cifrada TLS.
              </p>
            </div>
          </div>
        </div>
      </main>

      <InstallBanner />
      <InstallGuideSheet />
    </>
  );
}
