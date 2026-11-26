'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Check,
  Download,
  LogOut,
  RotateCcw,
  Send,
  Smartphone,
  Trash2,
  User as UserIcon,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import {
  listPushSubscriptions,
  removePushSubscription,
  resetServerDemoData,
  savePushSubscription,
  sendServerTestPush,
  updateProfile,
} from '@/lib/data-service';
import {
  getPushSupportStatus,
  showLocalBrowserNotification,
  subscribeToBrowserPush,
} from '@/lib/push-client';
import {
  ROLE_LABELS,
  type NotificationLevel,
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
  const { profile, isDemoMode, signOut, refreshProfile } = useAuth();
  if (!profile) return null;
  return (
    <ProfileContentInner
      key={`${profile.id}-${profile.updated_at}`}
      profile={profile}
      isDemoMode={isDemoMode}
      signOut={signOut}
      refreshProfile={refreshProfile}
    />
  );
}

function ProfileContentInner({
  profile,
  isDemoMode,
  signOut,
  refreshProfile,
}: {
  profile: NonNullable<ReturnType<typeof useAuth>['profile']>;
  isDemoMode: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}) {
  const { isInstalled, isIOSBrowser, canInstall, triggerInstall } = usePWAInstall();

  const [fullName, setFullName] = useState(profile.full_name);
  const [phone, setPhone] = useState(profile.phone || '');
  const [notifLevel, setNotifLevel] = useState<NotificationLevel>(profile.notification_level);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const [subs, setSubs] = useState<PushSubscriptionRecord[]>([]);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);

  const loadSubs = useCallback(async () => {
    await Promise.resolve();
    const data = await listPushSubscriptions(profile.id);
    setSubs(data);
  }, [profile.id]);

  useEffect(() => {
    const t = setTimeout(() => void loadSubs(), 0);
    return () => clearTimeout(t);
  }, [loadSubs]);

  const isCoord = profile.role === 'admin' || profile.role === 'coordinator';
  const pushSupport = getPushSupportStatus();

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    try {
      await updateProfile(profile.id, {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        notification_level: notifLevel,
      });
      await refreshProfile();
      setSavedMsg('Perfil y preferencias guardados.');
    } finally {
      setSaving(false);
    }
  };

  const handleEnablePush = async () => {
    setPushLoading(true);
    setPushFeedback(null);
    try {
      const sub = await subscribeToBrowserPush();
      if (!sub) {
        setPushFeedback(
          'Permiso denegado o navegador no compatible. Verifica los ajustes del navegador.'
        );
        return;
      }
      const label = /iPhone|iPad/.test(navigator.userAgent)
        ? 'iPhone / iPad Safari'
        : /Android/.test(navigator.userAgent)
        ? 'Smartphone Android'
        : 'Navegador Escritorio';

      await savePushSubscription(profile.id, sub, label);
      await loadSubs();
      await showLocalBrowserNotification(
        'Notificaciones VistaSatPRO activas',
        'Recibirás alertas instantáneas cuando te asignen o actualicen un parte.'
      );
      setPushFeedback('Dispositivo registrado correctamente para notificaciones Push.');
    } catch (err) {
      setPushFeedback(
        err instanceof Error ? err.message : 'Error al activar notificaciones push.'
      );
    } finally {
      setPushLoading(false);
    }
  };

  const handleRemoveSub = async (id: string) => {
    await removePushSubscription(id);
    await loadSubs();
  };

  const handleSendTestPush = async () => {
    const sent = await sendServerTestPush(profile.id);
    if (sent > 0) {
      setPushFeedback(`Push enviado desde el servidor a ${sent} dispositivo(s).`);
    } else {
      await showLocalBrowserNotification(
        'VistaSatPRO — Prueba Local',
        'El aviso del navegador funciona (activa Push arriba para pruebas reales en segundo plano).'
      );
      setPushFeedback('Mostrada notificación local (registra primero un dispositivo HTTPS para Push real).');
    }
  };

  const handleResetDemo = async () => {
    await resetServerDemoData();
    await refreshProfile();
    setSavedMsg('Datos de prueba restablecidos en el servidor.');
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
        className="bg-white rounded-md shadow-card p-5 space-y-4 border border-border/60"
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

        {isCoord && (
          <div className="pt-2 border-t border-border">
            <label className="block text-sm font-bold text-navy mb-1">
              Nivel de notificaciones (Coordinador / Admin)
            </label>
            <p className="text-xs text-mid-grey mb-2">
              Elige de qué partes quieres recibir alertas cuando otros usuarios los actualicen.
            </p>
            <select
              value={notifLevel}
              onChange={(e) => setNotifLevel(e.target.value as NotificationLevel)}
              className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal focus:outline-none focus:ring-2 focus:ring-navy"
            >
              <option value="assigned_or_created">
                Solo partes que yo creé o tengo asignados (Recomendado)
              </option>
              <option value="all">Todos los cambios de todos los partes del equipo</option>
              <option value="none">Silenciar avisos de coordinación</option>
            </select>
          </div>
        )}

        {savedMsg && (
          <div className="p-3 bg-success/10 border-l-4 border-success text-xs font-semibold text-success flex items-center gap-2">
            <Check size={15} /> {savedMsg}
          </div>
        )}

        <Button type="submit" isLoading={saving} className="w-full sm:w-auto">
          Guardar cambios
        </Button>
      </form>

      {/* Notificaciones Push */}
      <div className="bg-white rounded-md shadow-card p-5 space-y-4 border border-border/60">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Bell size={18} className="text-magenta" />
          <h2 className="text-base font-bold text-charcoal">Notificaciones Push (Móvil / PC)</h2>
        </div>

        {pushSupport === 'ios_requires_install' ? (
          <div className="p-3 bg-navy/5 border-l-4 border-navy text-xs text-dark-grey leading-relaxed">
            <strong>Requisito iOS:</strong> Para recibir notificaciones Push en iPhone/iPad,
            primero pulsa <em>Compartir → Añadir a pantalla de inicio</em> en Safari y abre
            VistaSatPRO desde el icono instalado.
          </div>
        ) : pushSupport === 'unsupported' ? (
          <p className="text-xs text-mid-grey">
            Este navegador no soporta Web Push en segundo plano.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-dark-grey leading-relaxed">
              Activa las notificaciones push en este dispositivo para recibir avisos al instante
              incluso con la app cerrada (nunca te notificarás a ti mismo por tus propias acciones).
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="accent"
                size="sm"
                isLoading={pushLoading}
                onClick={handleEnablePush}
              >
                <Bell size={15} /> Activar Push en este dispositivo
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleSendTestPush}
              >
                <Send size={15} /> Probar Push
              </Button>
            </div>
          </div>
        )}

        {pushFeedback && (
          <p className="text-xs font-semibold text-navy bg-navy/5 p-2.5 border-l-4 border-navy">
            {pushFeedback}
          </p>
        )}

        {subs.length > 0 && (
          <div className="pt-2 space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-mid-grey">
              Dispositivos vinculados ({subs.length})
            </p>
            {subs.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center justify-between p-2.5 bg-off-white border border-border rounded-sm"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Smartphone size={16} className="text-navy flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-charcoal truncate">
                      {sub.device_label || 'Dispositivo registrado'}
                    </p>
                    <p className="text-[11px] text-mid-grey">
                      Activo desde {new Date(sub.created_at).toLocaleDateString('es-ES')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveSub(sub.id)}
                  className="p-2 text-mid-grey hover:text-danger"
                  aria-label="Eliminar dispositivo"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Estado PWA */}
      <div className="bg-white rounded-md shadow-card p-5 space-y-3 border border-border/60">
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
        <div className="bg-white rounded-md shadow-card p-5 space-y-3 border border-magenta/30">
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
      <Button variant="danger" className="w-full" onClick={signOut}>
        <LogOut size={16} /> Cerrar sesión
      </Button>
    </div>
  );
}
