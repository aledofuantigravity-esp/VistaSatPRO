'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  BellRing,
  Check,
  Download,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  RotateCcw,
  Send,
  Shield,
  Smartphone,
  Sun,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { NotificationPreferencesEditor } from '@/components/users/NotificationPreferencesEditor';
import { useAuth } from '@/hooks/useAuth';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useTheme, type ThemePreference } from '@/hooks/useTheme';
import {
  changeOwnPassword,
  listPushSubscriptions,
  removePushSubscription,
  resetServerDemoData,
  savePushSubscription,
  sendServerTestPush,
  updateProfile,
} from '@/lib/data-service';
import { normalizeNotificationPreferences } from '@/lib/notification-preferences';
import {
  detectDeviceLabel,
  getCurrentDevicePushEndpoint,
  getPushSupportStatus,
  showLocalBrowserNotification,
  subscribeToBrowserPush,
} from '@/lib/push-client';
import { validatePasswordStrength } from '@/lib/security';
import {
  ROLE_LABELS,
  type NotificationPreferences,
  type PushSubscriptionRecord,
} from '@/types/database';

export default function ProfilePage() {
  return (
    <AppShell>
      <ProfileContent />
    </AppShell>
  );
}

function ProfileContent() {
  const { profile, isDemoMode, signOut, signOutAllDevices, refreshProfile } = useAuth();
  if (!profile) return null;
  return (
    <ProfileContentInner
      key={`${profile.id}-${profile.updated_at}`}
      profile={profile}
      isDemoMode={isDemoMode}
      signOut={signOut}
      signOutAllDevices={signOutAllDevices}
      refreshProfile={refreshProfile}
    />
  );
}

function ProfileContentInner({
  profile,
  isDemoMode,
  signOut,
  signOutAllDevices,
  refreshProfile,
}: {
  profile: NonNullable<ReturnType<typeof useAuth>['profile']>;
  isDemoMode: boolean;
  signOut: () => Promise<void>;
  signOutAllDevices: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}) {
  const { isInstalled, isIOSBrowser, canInstall, triggerInstall } = usePWAInstall();
  const { theme, setTheme } = useTheme();

  const [fullName, setFullName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone || '');
  const [notifPrefs, setNotifPrefs] = useState<NotificationPreferences>(() =>
    normalizeNotificationPreferences(
      profile.notification_preferences,
      profile.role,
      profile.notification_level
    )
  );
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [subs, setSubs] = useState<PushSubscriptionRecord[]>([]);
  const [currentEndpoint, setCurrentEndpoint] = useState<string | null>(null);
  const [activatingPush, setActivatingPush] = useState(false);
  const [testingPush, setTestingPush] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(
    null
  );

  // Cambio de contraseña
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPass, setChangingPass] = useState(false);
  const [passMsg, setPassMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadSubs = useCallback(async () => {
    await Promise.resolve();
    const [data, endpoint] = await Promise.all([
      listPushSubscriptions(profile.id),
      getCurrentDevicePushEndpoint(),
    ]);
    setSubs(data);
    setCurrentEndpoint(endpoint);
  }, [profile.id]);

  useEffect(() => {
    const t = setTimeout(() => void loadSubs(), 0);
    return () => clearTimeout(t);
  }, [loadSubs]);

  const isCoord = profile.role === 'admin' || profile.role === 'coordinator';
  const isAdmin = profile.role === 'admin';
  const isCurrentDeviceLinked = Boolean(
    currentEndpoint && subs.some((s) => s.endpoint === currentEndpoint)
  );
  const pushSupportStatus = getPushSupportStatus();

  const handleActivatePushDevice = async (forceResubscribe = false) => {
    setActivatingPush(true);
    setPushFeedback(null);
    try {
      const sub = await subscribeToBrowserPush({ forceResubscribe });
      const label = detectDeviceLabel();
      await savePushSubscription(profile.id, sub, label);
      await loadSubs();
      setPushFeedback({
        type: 'ok',
        text: `Dispositivo "${label}" vinculado. Recibirás avisos Push incluso con la app cerrada.`,
      });
    } catch (err) {
      setPushFeedback({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'No se pudieron activar las notificaciones Push en este dispositivo.',
      });
    } finally {
      setActivatingPush(false);
    }
  };

  const handleTestPush = async () => {
    setTestingPush(true);
    setPushFeedback(null);
    try {
      const count = await sendServerTestPush(profile.id);
      if (count > 0) {
        setPushFeedback({
          type: 'ok',
          text: `Notificación Push real enviada a ${count} dispositivo(s) vinculados.`,
        });
      } else if (isDemoMode) {
        await showLocalBrowserNotification(
          'VistaSatPRO — Prueba Local',
          'Notificación verificada en modo prueba.'
        );
        setPushFeedback({
          type: 'ok',
          text: 'Prueba local mostrada (entorno demo).',
        });
      } else {
        await loadSubs();
        setPushFeedback({
          type: 'err',
          text: 'El servidor Push rechazó la suscripción antigua de este dispositivo. Pulsa "Activar / Re-vincular este dispositivo" para renovarla con las claves actuales.',
        });
      }
    } catch (err) {
      setPushFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error enviando notificación de prueba.',
      });
    } finally {
      setTestingPush(false);
    }
  };

  const handleRemoveDevice = async (subId: string) => {
    setPushFeedback(null);
    try {
      await removePushSubscription(subId);
      await loadSubs();
      setPushFeedback({
        type: 'ok',
        text: 'Dispositivo antiguo desvinculado de tu cuenta.',
      });
    } catch (err) {
      setPushFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'No se pudo desvincular el dispositivo.',
      });
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    try {
      await updateProfile(profile.id, {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
      });
      await refreshProfile();
      setSavedMsg('Datos personales guardados.');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDemo = async () => {
    await resetServerDemoData();
    await refreshProfile();
    setSavedMsg('Datos de prueba restablecidos en el servidor.');
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg(null);
    const check = validatePasswordStrength(newPassword);
    if (!check.valid) {
      setPassMsg({
        type: 'err',
        text: check.error || 'La nueva contraseña no cumple los requisitos.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPassMsg({
        type: 'err',
        text: 'La nueva contraseña y su confirmación no coinciden.',
      });
      return;
    }
    setChangingPass(true);
    try {
      await changeOwnPassword(currentPassword, newPassword, profile);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPassMsg({ type: 'ok', text: 'Contraseña actualizada correctamente.' });
    } catch (err) {
      setPassMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.',
      });
    } finally {
      setChangingPass(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
      {/* Tarjeta cabecera de usuario */}
      <div className="bg-navy text-white rounded-md p-5 flex items-center gap-4 shadow-card">
        <div className="w-14 h-14 rounded-full bg-magenta flex items-center justify-center text-xl font-bold flex-shrink-0">
          {profile.full_name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold truncate">{profile.full_name}</h1>
          <p className="text-xs text-white/75 truncate">{profile.email}</p>
          <span className="inline-block mt-1.5 px-2 py-0.5 bg-white/15 text-[11px] font-bold uppercase tracking-wider rounded-sm">
            {ROLE_LABELS[profile.role]}
          </span>
        </div>
      </div>

      {/* Formulario de datos y nivel de notificaciones (Decisión 2) */}
      <form
        onSubmit={handleSaveProfile}
        className="bg-white dark:bg-surface rounded-md shadow-card p-5 space-y-4 border border-border/60"
      >
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <UserIcon size={18} className="text-navy" />
          <h2 className="text-base font-bold text-charcoal">Datos Personales</h2>
        </div>

        <div>
          <label className="block text-sm font-semibold text-dark-grey mb-1">
            Nombre completo
          </label>
          <input
            type="text"
            required
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal focus:outline-none focus:ring-2 focus:ring-navy"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-dark-grey mb-1">
            Teléfono de contacto
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+34 600 000 000"
            className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal focus:outline-none focus:ring-2 focus:ring-navy"
          />
        </div>

        {savedMsg && (
          <div className="p-3 bg-success/10 border-l-4 border-success text-xs font-semibold text-success flex items-center gap-2">
            <Check size={15} /> {savedMsg}
          </div>
        )}

        <Button type="submit" isLoading={saving} className="w-full sm:w-auto">
          Guardar datos personales
        </Button>
      </form>

      {/* Preferencias detalladas de notificaciones y Push (solo lectura en Mi Perfil) */}
      <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 space-y-4 border border-border/60">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Bell size={18} className="text-magenta" />
            <h2 className="text-base font-bold text-charcoal">
              Configuración de Notificaciones y Push
            </h2>
          </div>
          {isAdmin && (
            <Link
              href="/users"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-navy text-white hover:bg-navy-dark rounded-sm"
            >
              <Shield size={13} /> Modificar en Usuarios
            </Link>
          )}
        </div>

        <NotificationPreferencesEditor
          value={notifPrefs}
          onChange={setNotifPrefs}
          readOnly
        />
      </div>

      {/* Seguridad — Cambiar contraseña */}
      <form
        onSubmit={handleChangePassword}
        className="bg-white dark:bg-surface rounded-md shadow-card p-5 space-y-4 border border-border/60"
      >
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <KeyRound size={18} className="text-navy" />
          <h2 className="text-base font-bold text-charcoal">Seguridad y Contraseña</h2>
        </div>

        <div>
          <label className="block text-sm font-semibold text-dark-grey mb-1">
            Contraseña actual *
          </label>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal focus:outline-none focus:ring-2 focus:ring-navy"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-semibold text-dark-grey mb-1">
              Nueva contraseña * (mín. 10, letras y números)
            </label>
            <input
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••••"
              className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal focus:outline-none focus:ring-2 focus:ring-navy"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-dark-grey mb-1">
              Confirmar contraseña *
            </label>
            <input
              type="password"
              required
              minLength={10}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••"
              className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal focus:outline-none focus:ring-2 focus:ring-navy"
            />
          </div>
        </div>

        {passMsg && (
          <div
            className={`p-3 border-l-4 text-xs font-semibold ${
              passMsg.type === 'ok'
                ? 'bg-success/10 border-success text-success'
                : 'bg-danger/10 border-danger text-danger'
            }`}
          >
            {passMsg.text}
          </div>
        )}

        <Button type="submit" variant="primary" isLoading={changingPass} className="w-full sm:w-auto">
          Actualizar contraseña
        </Button>
      </form>

      {/* Apariencia / Modo Oscuro (M5) */}
      <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 space-y-3 border border-border/60">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Moon size={18} className="text-navy dark:text-sky-300" />
          <h2 className="text-base font-bold text-charcoal">Apariencia</h2>
        </div>
        <p className="text-xs text-mid-grey">
          Elige el tema visual de VistaSatPRO. En exteriores o de noche, el modo oscuro reduce la fatiga visual.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              { id: 'light', label: 'Claro', icon: Sun },
              { id: 'dark', label: 'Oscuro', icon: Moon },
              { id: 'system', label: 'Automático', icon: Monitor },
            ] as Array<{ id: ThemePreference; label: string; icon: typeof Sun }>
          ).map((opt) => {
            const Icon = opt.icon;
            const active = theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTheme(opt.id)}
                className={`py-2.5 px-3 border text-xs font-bold flex items-center justify-center gap-1.5 min-h-[44px] transition-colors ${
                  active
                    ? 'bg-navy text-white border-navy'
                    : 'bg-off-white text-dark-grey border-border hover:bg-navy/5'
                }`}
              >
                <Icon size={15} /> {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Dispositivos Push (vinculación de dispositivo propio para entrega con la app cerrada) */}
      <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 space-y-3 border border-border/60">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Smartphone size={18} className="text-magenta" />
            <h2 className="text-base font-bold text-charcoal">
              Dispositivos Push vinculados ({subs.length})
            </h2>
          </div>
          {isCurrentDeviceLinked ? (
            <span className="px-2 py-0.5 text-[11px] font-bold uppercase bg-success/15 text-success rounded-sm">
              Este dispositivo activo
            </span>
          ) : (
            <span className="px-2 py-0.5 text-[11px] font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 rounded-sm">
              Este dispositivo sin vincular
            </span>
          )}
        </div>

        <p className="text-xs text-mid-grey leading-relaxed">
          Si has cambiado de móvil o ordenador, activa las notificaciones Push aquí para vincular
          este dispositivo y recibir alertas <strong>aunque tengas la aplicación cerrada</strong>.
          Las reglas sobre qué tipos de aviso recibes las sigue gestionando el Administrador.
        </p>

        {!notifPrefs.push_enabled && (
          <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border-l-4 border-amber-500 text-xs text-charcoal">
            Puedes vincular este dispositivo ahora, pero actualmente el Administrador tiene
            desactivado el canal Push para tu usuario.
          </div>
        )}

        {pushSupportStatus === 'ios_requires_install' && (
          <div className="p-3 bg-navy/5 border-l-4 border-navy text-xs text-dark-grey">
            <strong>iPhone / iPad:</strong> para recibir avisos con la app cerrada, pulsa{' '}
            <em>Compartir → Añadir a pantalla de inicio</em> en Safari y abre VistaSatPRO desde el
            icono instalado.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="accent"
            size="sm"
            isLoading={activatingPush}
            onClick={() => handleActivatePushDevice(isCurrentDeviceLinked)}
          >
            <BellRing size={15} />{' '}
            {isCurrentDeviceLinked
              ? 'Re-vincular este dispositivo'
              : 'Activar Push en este dispositivo'}
          </Button>

          {subs.length > 0 && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              isLoading={testingPush}
              onClick={handleTestPush}
            >
              <Send size={14} /> Probar Push
            </Button>
          )}
        </div>

        {pushFeedback && (
          <div
            className={`p-3 border-l-4 text-xs font-semibold ${
              pushFeedback.type === 'ok'
                ? 'bg-success/10 border-success text-success'
                : 'bg-danger/10 border-danger text-danger'
            }`}
          >
            {pushFeedback.text}
          </div>
        )}

        {subs.length === 0 ? (
          <p className="text-xs text-mid-grey bg-off-white p-3 border border-border rounded-sm">
            No hay dispositivos Push vinculados actualmente a tu cuenta.
          </p>
        ) : (
          <div className="space-y-2">
            {subs.map((sub) => {
              const isThisDevice = Boolean(currentEndpoint && sub.endpoint === currentEndpoint);
              return (
                <div
                  key={sub.id}
                  className="flex items-center justify-between gap-2.5 p-2.5 bg-off-white border border-border rounded-sm"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Smartphone size={16} className="text-navy flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-charcoal truncate flex items-center gap-1.5">
                        {sub.device_label || 'Dispositivo registrado'}
                        {isThisDevice && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-success/15 text-success rounded-xs uppercase">
                            Actual
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-mid-grey">
                        Activo desde {new Date(sub.created_at).toLocaleDateString('es-ES')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveDevice(sub.id)}
                    className="p-1.5 text-mid-grey hover:text-danger flex-shrink-0"
                    aria-label={`Desvincular ${sub.device_label || 'dispositivo'}`}
                    title="Desvincular dispositivo antiguo"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Estado PWA */}
      <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 space-y-3 border border-border/60">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-charcoal">Instalación como App (PWA)</h2>
            <p className="text-xs text-mid-grey mt-0.5">
              {isInstalled
                ? 'Ejecutándose en modo nativo instalado (standalone).'
                : isIOSBrowser
                ? 'En iPhone: usa Compartir → Añadir a pantalla de inicio en Safari.'
                : 'Instala VistaSatPRO en la pantalla de inicio para acceso directo.'}
            </p>
          </div>
          {canInstall && !isInstalled && (
            <Button size="sm" variant="secondary" onClick={triggerInstall}>
              <Download size={15} /> Instalar
            </Button>
          )}
        </div>
      </div>

      {/* Controles del Entorno de Prueba Simulado */}
      {isDemoMode && isCoord && (
        <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 space-y-3 border border-magenta/30">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-navy">Entorno de Prueba Simulado</h2>
              <p className="text-xs text-mid-grey mt-0.5">
                Los cambios están compartidos en el servidor. Puedes restaurar los datos
                iniciales en cualquier momento.
              </p>
            </div>
            <Button size="sm" variant="secondary" onClick={handleResetDemo}>
              <RotateCcw size={15} /> Restablecer datos
            </Button>
          </div>
        </div>
      )}

      {/* Cerrar sesión */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button variant="secondary" className="w-full" onClick={signOutAllDevices}>
          <KeyRound size={16} /> Cerrar sesión en todos los dispositivos
        </Button>
        <Button variant="danger" className="w-full" onClick={signOut}>
          <LogOut size={16} /> Cerrar sesión
        </Button>
      </div>
    </div>
  );
}
