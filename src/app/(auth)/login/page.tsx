'use client';

import { useState } from 'react';
import { Eye, EyeOff, Loader2, Wrench } from 'lucide-react';
import { InstallBanner } from '@/components/pwa/InstallBanner';
import { InstallGuideSheet } from '@/components/pwa/InstallGuideSheet';

/**
 * Pantalla de Login — VistaSatPRO
 * Diseño Mobile-First con identidad visual Vistalegre.
 * En Fase 1 se conectará con Supabase Auth.
 */
export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    // TODO (Fase 1): Conectar con Supabase Auth
    // const { error } = await supabase.auth.signInWithPassword({ email, password });
    // if (error) { setError(error.message); setIsLoading(false); return; }
    // router.push('/dashboard');

    // Simulación temporal para Fase 0
    await new Promise((r) => setTimeout(r, 1200));
    setIsLoading(false);
    setError('La autenticación real se implementa en la Fase 1 (Supabase Auth).');
  };

  return (
    <>
      {/* Pantalla de login */}
      <main className="min-h-dvh flex flex-col bg-navy" style={{ paddingTop: 'var(--safe-top)' }}>

        {/* ── Cabecera con logo ── */}
        <div className="flex-shrink-0 px-6 pt-12 pb-8 text-center">
          {/* Icono de la app */}
          <div className="inline-flex items-center justify-center w-20 h-20 bg-white/10 rounded-lg mb-5 mx-auto">
            <svg width="44" height="44" viewBox="0 0 44 44" fill="none">
              <rect x="6" y="16" width="32" height="22" rx="3" stroke="white" strokeWidth="2.5"/>
              <path d="M15 16V13C15 11.3 16.3 10 18 10H26C27.7 10 29 11.3 29 13V16" stroke="#CF095E" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="6" y1="26" x2="38" y2="26" stroke="white" strokeWidth="2" strokeOpacity="0.4"/>
              <circle cx="22" cy="26" r="3" fill="#CF095E"/>
            </svg>
          </div>

          {/* Nombre de la app */}
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Vista<span className="text-magenta">Sat</span>PRO
          </h1>
          <p className="text-sm text-white/60 mt-1 font-medium">
            Gestión de Servicio Técnico
          </p>
        </div>

        {/* ── Card de login ── */}
        <div
          className="flex-1 bg-off-white rounded-t-lg px-6 pt-8 pb-8"
          style={{ paddingBottom: 'max(var(--safe-bottom), 32px)' }}
        >
          <h2 className="text-lg font-bold text-charcoal mb-1">
            Iniciar sesión
          </h2>
          <p className="text-sm text-mid-grey mb-7">
            Accede con tu cuenta corporativa
          </p>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">

            {/* Email */}
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
                placeholder="tecnico@empresa.com"
                className="
                  w-full px-4 py-3 bg-bg-input border border-border
                  text-charcoal placeholder:text-light-grey
                  focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy
                  transition-colors
                "
                // font-size 16px heredado de globals.css — evita zoom en iOS
              />
            </div>

            {/* Contraseña */}
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
                  className="
                    w-full px-4 py-3 pr-12 bg-bg-input border border-border
                    text-charcoal placeholder:text-light-grey
                    focus:outline-none focus:ring-2 focus:ring-navy focus:border-navy
                    transition-colors
                  "
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-mid-grey hover:text-charcoal transition-colors"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="p-3 bg-danger/10 border-l-4 border-danger text-sm text-danger font-medium">
                {error}
              </div>
            )}

            {/* Botón submit */}
            <button
              type="submit"
              disabled={isLoading || !email || !password}
              className="
                w-full py-4 mt-2 bg-navy text-white font-bold text-sm uppercase tracking-wider
                flex items-center justify-center gap-2
                disabled:opacity-50 disabled:cursor-not-allowed
                hover:bg-navy-dark active:opacity-90
                transition-colors
                min-h-[52px]
              "
            >
              {isLoading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Accediendo...
                </>
              ) : (
                'Acceder'
              )}
            </button>
          </form>

          {/* Indicador de demo (solo visible en desarrollo) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-6 p-3 border border-dashed border-border rounded-sm bg-white">
              <div className="flex items-center gap-2 mb-1.5">
                <Wrench size={13} className="text-mid-grey" />
                <span className="text-xs font-bold text-mid-grey uppercase tracking-wider">
                  Fase 0 — Sin auth real
                </span>
              </div>
              <p className="text-xs text-mid-grey leading-relaxed">
                La autenticación con Supabase se implementa en la <strong>Fase 1</strong>.
                Este formulario es solo estructural.
              </p>
            </div>
          )}

          {/* Footer con versión */}
          <p className="text-center text-xs text-light-grey mt-8">
            VistaSatPRO · v0.1.0 Fase 0
          </p>
        </div>
      </main>

      {/* Banners de instalación PWA — disponibles incluso en la pantalla de login */}
      <InstallBanner />
      <InstallGuideSheet />
    </>
  );
}
