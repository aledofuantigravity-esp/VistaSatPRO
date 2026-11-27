'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import {
  Bell,
  Clock,
  Pencil,
  Plus,
  Send,
  Shield,
  Smartphone,
  Trash2,
  UserCheck,
  UserX,
  Users as UsersIcon,
  Wrench,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { NotificationPreferencesEditor } from '@/components/users/NotificationPreferencesEditor';
import { useAuth } from '@/hooks/useAuth';
import {
  adminListUserPushSubscriptions,
  adminRevokeUserPushSubscription,
  adminSendTestPushToUser,
  adminUpdateUserProfile,
  createUserAccount,
  listProfiles,
  listTasks,
  updateProfile,
} from '@/lib/data-service';
import {
  normalizeNotificationPreferences,
  summarizeNotificationPreferences,
} from '@/lib/notification-preferences';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { validatePasswordStrength } from '@/lib/security';
import {
  ROLE_LABELS,
  type NotificationPreferences,
  type Profile,
  type PushSubscriptionRecord,
  type Task,
  type UserRole,
} from '@/types/database';

export default function UsersPage() {
  return (
    <AppShell>
      <UsersContent />
    </AppShell>
  );
}

function isUserRecentlyActive(u: Profile, liveIds: Set<string>, currentId: string): boolean {
  if (u.id === currentId) return true;
  if (liveIds.has(u.id)) return true;
  if (!u.is_online || !u.last_seen_at) return false;
  const ageMs = Date.now() - new Date(u.last_seen_at).getTime();
  return ageMs < 2 * 60 * 1000; // Considerado en línea si hubo heartbeat < 2 min
}

function UsersContent() {
  const { profile, onlineUserIds } = useAuth();
  const channelUid = useId();
  const [users, setUsers] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const liveOnlineIds = useMemo(() => new Set(onlineUserIds), [onlineUserIds]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<Profile | null>(null);

  // Formulario creación / edición
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('technician');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<'profile' | 'notifications'>('profile');

  // Preferencias granulares y dispositivos Push del usuario en edición
  const [notifDraft, setNotifDraft] = useState<NotificationPreferences | null>(null);
  const [notifSubs, setNotifSubs] = useState<PushSubscriptionRecord[]>([]);
  const [notifFeedback, setNotifFeedback] = useState<{
    type: 'ok' | 'err';
    text: string;
  } | null>(null);

  const profileId = profile?.id;
  const profileRole = profile?.role;

  const load = useCallback(async () => {
    if (!profileId || !profileRole) return;
    await Promise.resolve();
    try {
      const viewer = { id: profileId, role: profileRole } as Profile;
      const [u, t] = await Promise.all([listProfiles(), listTasks(viewer)]);
      setUsers(u);
      setTasks(t);
    } finally {
      setLoading(false);
    }
  }, [profileId, profileRole]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  // Escucha en vivo de presencia y cambios en profiles para que el Admin vea quién está conectado
  useEffect(() => {
    if (profileRole !== 'admin') return;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void load();
      }
    }, 15000);

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      const handleDemo = () => void load();
      window.addEventListener('vistasat:demo-updated', handleDemo);
      return () => {
        clearInterval(interval);
        window.removeEventListener('vistasat:demo-updated', handleDemo);
      };
    }

    const channel = supabase
      .channel(`profiles-admin-watch:${channelUid}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        () => {
          void load();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      void supabase.removeChannel(channel);
    };
  }, [profileRole, channelUid, load]);

  if (!profile) return null;

  if (profile.role !== 'admin') {
    return (
      <div className="p-6 text-center">
        <Shield size={40} className="text-danger mx-auto mb-2" />
        <h1 className="text-lg font-bold text-charcoal">Acceso exclusivo de Administrador</h1>
        <p className="text-sm text-mid-grey mt-1">
          Únicamente el usuario Administrador puede crear, editar o cambiar roles de usuarios.
        </p>
      </div>
    );
  }

  const openCreateModal = () => {
    setEditingUser(null);
    setModalTab('profile');
    setFullName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setRole('technician');
    setNotifDraft(null);
    setNotifSubs([]);
    setNotifFeedback(null);
    setFormError(null);
    setShowCreate(true);
  };

  const openEditModal = async (
    u: Profile,
    initialTab: 'profile' | 'notifications' = 'profile'
  ) => {
    setEditingUser(u);
    setModalTab(initialTab);
    setFullName(u.full_name);
    setEmail(u.email);
    setPhone(u.phone || '');
    setPassword('');
    setRole(u.role);
    setNotifDraft(
      normalizeNotificationPreferences(
        u.notification_preferences,
        u.role,
        u.notification_level
      )
    );
    setNotifSubs([]);
    setNotifFeedback(null);
    setFormError(null);
    setShowCreate(true);

    const subs = await adminListUserPushSubscriptions(u.id);
    setNotifSubs(subs);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setNotifFeedback(null);

    if (!editingUser) {
      const check = validatePasswordStrength(password);
      if (!check.valid) {
        setFormError(check.error || 'La contraseña inicial no cumple los requisitos.');
        return;
      }
    } else if (fullName.trim().length < 2) {
      setModalTab('profile');
      setFormError('El nombre completo debe tener al menos 2 caracteres.');
      return;
    }

    setSaving(true);
    try {
      if (editingUser) {
        await adminUpdateUserProfile(editingUser.id, {
          full_name: fullName.trim(),
          phone: phone.trim() || null,
          role: editingUser.id === profile.id ? editingUser.role : role,
          ...(notifDraft
            ? {
                notification_preferences: {
                  ...notifDraft,
                  allow_user_override: false,
                },
              }
            : {}),
        });
      } else {
        await createUserAccount({
          email,
          password,
          full_name: fullName,
          phone,
          role,
        });
      }
      setShowCreate(false);
      setEditingUser(null);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar el usuario');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: Profile) => {
    await updateProfile(u.id, { is_active: !u.is_active });
    await load();
  };

  const changeRole = async (u: Profile, newRole: UserRole) => {
    await updateProfile(u.id, { role: newRole });
    await load();
  };

  const handleAdminSendTestPush = async () => {
    if (!editingUser) return;
    setNotifFeedback(null);
    try {
      const { sent } = await adminSendTestPushToUser(editingUser.id);
      setNotifFeedback({
        type: sent > 0 ? 'ok' : 'err',
        text:
          sent > 0
            ? `Push de prueba enviado a ${sent} dispositivo(s) de ${editingUser.full_name}.`
            : `${editingUser.full_name} no tiene dispositivos Push activos registrados.`,
      });
    } catch (err) {
      setNotifFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'Error enviando Push de prueba.',
      });
    }
  };

  const handleAdminRevokeSub = async (subId: string) => {
    if (!editingUser) return;
    try {
      await adminRevokeUserPushSubscription(editingUser.id, subId);
      setNotifSubs((prev) => prev.filter((s) => s.id !== subId));
      setNotifFeedback({
        type: 'ok',
        text: 'Suscripción Push revocada para ese dispositivo.',
      });
    } catch (err) {
      setNotifFeedback({
        type: 'err',
        text: err instanceof Error ? err.message : 'No se pudo revocar el dispositivo.',
      });
    }
  };

  const onlineCount = users.filter((u) =>
    isUserRecentlyActive(u, liveOnlineIds, profile.id)
  ).length;

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-charcoal flex items-center gap-2">
            <UsersIcon size={22} className="text-navy" /> Equipo y Usuarios
          </h1>
          <p className="text-xs text-mid-grey mt-0.5">
            Solo Administrador · {onlineCount} en línea ahora de {users.length} usuarios
          </p>
        </div>

        <Button variant="accent" size="sm" onClick={openCreateModal}>
          <Plus size={16} /> Nuevo Usuario
        </Button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-white dark:bg-surface rounded-md animate-pulse shadow-card" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {users.map((u) => {
            const activeTasks = tasks.filter(
              (t) =>
                t.assigned_to === u.id &&
                t.status !== 'completed' &&
                t.status !== 'cancelled'
            ).length;
            const online = u.is_active && isUserRecentlyActive(u, liveOnlineIds, profile.id);
            const notifSummary = summarizeNotificationPreferences(u);

            return (
              <div
                key={u.id}
                onClick={() => openEditModal(u, 'profile')}
                className={`bg-white dark:bg-surface rounded-md shadow-card hover:shadow-elevated transition-shadow cursor-pointer p-4 border-l-4 ${
                  u.is_active ? 'border-navy' : 'border-light-grey opacity-65'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-bold text-charcoal truncate">
                        {u.full_name}
                      </h3>
                      {!u.is_active && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-danger/15 text-danger rounded-sm">
                          Desactivado
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-mid-grey truncate">{u.email}</p>
                    {u.phone && <p className="text-xs text-dark-grey mt-0.5">{u.phone}</p>}

                    {/* Estado de conexión en vivo y última conexión */}
                    <div className="mt-2 flex items-center gap-1.5 text-xs">
                      {online ? (
                        <span className="inline-flex items-center gap-1.5 font-bold text-success">
                          <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                          En línea ahora
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-mid-grey font-medium">
                          <Clock size={12} />
                          {u.last_seen_at
                            ? `Desconectado · Última conexión: ${new Date(
                                u.last_seen_at
                              ).toLocaleString('es-ES', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                              })}`
                            : 'Desconectado · Sin conexiones registradas'}
                        </span>
                      )}
                    </div>

                    {/* Resumen visual de notificaciones y Push */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-sm ${
                          notifSummary.isMuted
                            ? 'bg-danger/10 text-danger'
                            : 'bg-off-white border border-border text-dark-grey'
                        }`}
                      >
                        <Bell size={10} /> {notifSummary.scopeLabel}
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-sm bg-magenta/10 text-magenta">
                        <Smartphone size={10} /> {notifSummary.pushLabel}
                      </span>
                      {notifSummary.extraBadges.map((b) => (
                        <span
                          key={b}
                          className="px-2 py-0.5 text-[10px] font-semibold rounded-sm bg-navy/10 text-navy dark:text-sky-300"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-navy/10 dark:bg-white/10 text-navy dark:text-sky-300 text-xs font-bold rounded-sm flex-shrink-0">
                    {u.role === 'technician' ? <Wrench size={12} /> : <UserCheck size={12} />}
                    {ROLE_LABELS[u.role]}
                  </span>
                </div>

                <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-dark-grey">
                    Partes activos asignados: <strong>{activeTasks}</strong>
                  </span>

                  <div
                    className="flex flex-wrap items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => openEditModal(u, 'notifications')}
                      className="px-2.5 py-1.5 text-xs font-bold border border-magenta/40 text-magenta hover:bg-magenta/5 inline-flex items-center gap-1"
                    >
                      <Bell size={13} /> Notificaciones y Push
                    </button>

                    <button
                      type="button"
                      onClick={() => openEditModal(u, 'profile')}
                      className="px-2.5 py-1.5 text-xs font-bold border border-border hover:bg-off-white inline-flex items-center gap-1 text-navy dark:text-sky-300"
                    >
                      <Pencil size={13} /> Editar
                    </button>

                    {u.id !== profile.id && (
                      <>
                        <select
                          value={u.role}
                          onChange={(e) => changeRole(u, e.target.value as UserRole)}
                          className="text-xs bg-bg-input border border-border px-2 py-1.5"
                        >
                          <option value="technician">Técnico</option>
                          <option value="coordinator">Coordinador</option>
                          <option value="admin">Admin</option>
                        </select>

                        <button
                          type="button"
                          onClick={() => toggleActive(u)}
                          className="px-2.5 py-1.5 text-xs font-bold border border-border hover:bg-off-white inline-flex items-center gap-1"
                        >
                          {u.is_active ? (
                            <>
                              <UserX size={13} className="text-danger" /> Desactivar
                            </>
                          ) : (
                            <>
                              <UserCheck size={13} className="text-success" /> Activar
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 bg-charcoal/75 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className={`bg-white dark:bg-surface w-full ${
              editingUser ? 'sm:max-w-2xl' : 'sm:max-w-md'
            } rounded-t-lg sm:rounded-lg shadow-elevated overflow-hidden flex flex-col max-h-[92dvh]`}
          >
            <div className="bg-navy text-white px-5 py-4 flex items-center justify-between flex-shrink-0">
              <div className="min-w-0">
                <h2 className="text-base font-bold truncate">
                  {editingUser
                    ? `Editar Usuario · ${editingUser.full_name}`
                    : 'Alta de Nuevo Usuario'}
                </h2>
                {editingUser && (
                  <p className="text-[11px] text-white/70 truncate">
                    {ROLE_LABELS[editingUser.role]} · {editingUser.email}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="p-1 text-white/80 hover:text-white"
                aria-label="Cerrar ficha de usuario"
              >
                <X size={20} />
              </button>
            </div>

            {/* Pestañas + Resumen de información del usuario seleccionado */}
            {editingUser && (
              <>
                <div className="px-5 py-2.5 bg-off-white/80 border-b border-border flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-dark-grey flex-shrink-0">
                  <span>
                    Estado:{' '}
                    <strong className={editingUser.is_active ? 'text-success' : 'text-danger'}>
                      {editingUser.is_active ? 'Activo' : 'Desactivado'}
                    </strong>
                  </span>
                  <span>
                    Teléfono: <strong>{editingUser.phone || 'Sin especificar'}</strong>
                  </span>
                  <span>
                    Partes activos:{' '}
                    <strong>
                      {
                        tasks.filter(
                          (t) =>
                            t.assigned_to === editingUser.id &&
                            t.status !== 'completed' &&
                            t.status !== 'cancelled'
                        ).length
                      }
                    </strong>
                  </span>
                  <span>
                    Conexión:{' '}
                    <strong>
                      {editingUser.is_active &&
                      isUserRecentlyActive(editingUser, liveOnlineIds, profile.id)
                        ? 'En línea ahora'
                        : editingUser.last_seen_at
                        ? new Date(editingUser.last_seen_at).toLocaleString('es-ES', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })
                        : 'Sin registro'}
                    </strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 border-b border-border bg-off-white flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setModalTab('profile')}
                    className={`py-2.5 px-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                      modalTab === 'profile'
                        ? 'border-navy text-navy bg-white dark:bg-surface'
                        : 'border-transparent text-mid-grey hover:text-charcoal'
                    }`}
                  >
                    <Pencil size={13} /> Datos y Rol
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalTab('notifications')}
                    className={`py-2.5 px-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                      modalTab === 'notifications'
                        ? 'border-magenta text-magenta bg-white dark:bg-surface'
                        : 'border-transparent text-mid-grey hover:text-charcoal'
                    }`}
                  >
                    <Bell size={13} /> Notificaciones y Push
                  </button>
                </div>
              </>
            )}

            <form onSubmit={handleSave} className="flex flex-col flex-1 min-h-0">
              <div className="p-5 overflow-y-auto space-y-4 flex-1">
                {(!editingUser || modalTab === 'profile') && (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-dark-grey uppercase mb-1">
                        Nombre completo *
                      </label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="Ej. Miguel Ángel Torres"
                        className="w-full px-3 py-2.5 bg-bg-input border border-border"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-dark-grey uppercase mb-1">
                        Correo electrónico *
                      </label>
                      <input
                        type="email"
                        required
                        disabled={Boolean(editingUser)}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="miguel@empresa.com"
                        className="w-full px-3 py-2.5 bg-bg-input border border-border disabled:opacity-60"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-dark-grey uppercase mb-1">
                          Teléfono
                        </label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="+34 600..."
                          className="w-full px-3 py-2.5 bg-bg-input border border-border"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-dark-grey uppercase mb-1">
                          Rol *
                        </label>
                        <select
                          value={role}
                          disabled={editingUser?.id === profile.id}
                          onChange={(e) => setRole(e.target.value as UserRole)}
                          className="w-full px-3 py-2.5 bg-bg-input border border-border disabled:opacity-60"
                        >
                          <option value="technician">Técnico</option>
                          <option value="coordinator">Coordinador</option>
                          <option value="admin">Administrador</option>
                        </select>
                      </div>
                    </div>

                    {editingUser && (
                      <button
                        type="button"
                        onClick={() => setModalTab('notifications')}
                        className="w-full px-3 py-2.5 text-xs font-bold border border-magenta/40 bg-magenta/5 text-magenta hover:bg-magenta/10 rounded-sm flex items-center justify-center gap-2"
                      >
                        <Bell size={14} /> Configurar notificaciones y Push de este usuario →
                      </button>
                    )}

                    {!editingUser && (
                      <div>
                        <label className="block text-xs font-bold text-dark-grey uppercase mb-1">
                          Contraseña inicial * (mín. 10 chars, letras y números)
                        </label>
                        <input
                          type="text"
                          required
                          minLength={10}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Clave temporal segura para entregar al usuario"
                          className="w-full px-3 py-2.5 bg-bg-input border border-border"
                        />
                      </div>
                    )}
                  </>
                )}

                {editingUser && modalTab === 'notifications' && notifDraft && (
                  <div className="space-y-6">
                    <NotificationPreferencesEditor
                      value={notifDraft}
                      onChange={setNotifDraft}
                      isAdminView
                    />

                    {/* Dispositivos Push del usuario */}
                    <div className="border-t border-border pt-4 space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wider text-navy flex items-center gap-1.5">
                            <Smartphone size={14} className="text-magenta" /> Dispositivos Push
                            vinculados ({notifSubs.length})
                          </p>
                          <p className="text-[11px] text-mid-grey">
                            Envía un aviso de prueba o revoca dispositivos antiguos de este usuario.
                          </p>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={handleAdminSendTestPush}
                        >
                          <Send size={13} /> Enviar Push de prueba
                        </Button>
                      </div>

                      {notifSubs.length === 0 ? (
                        <p className="text-xs text-mid-grey bg-off-white p-3 border border-border rounded-sm">
                          Este usuario aún no ha vinculado ningún navegador o móvil para Web Push.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {notifSubs.map((sub) => (
                            <div
                              key={sub.id}
                              className="flex items-center justify-between p-2.5 bg-off-white border border-border rounded-sm"
                            >
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-charcoal truncate">
                                  {sub.device_label || 'Dispositivo registrado'}
                                </p>
                                <p className="text-[11px] text-mid-grey">
                                  Activo desde{' '}
                                  {new Date(sub.created_at).toLocaleDateString('es-ES')}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleAdminRevokeSub(sub.id)}
                                className="p-1.5 text-mid-grey hover:text-danger"
                                aria-label="Revocar dispositivo Push"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {notifFeedback && (
                      <div
                        className={`p-3 border-l-4 text-xs font-semibold ${
                          notifFeedback.type === 'ok'
                            ? 'bg-success/10 border-success text-success'
                            : 'bg-danger/10 border-danger text-danger'
                        }`}
                      >
                        {notifFeedback.text}
                      </div>
                    )}
                  </div>
                )}

                {formError && (
                  <p className="text-xs font-semibold text-danger bg-danger/10 p-2.5 border-l-4 border-danger">
                    {formError}
                  </p>
                )}
              </div>

              <div className="px-5 py-3.5 bg-off-white border-t border-border grid grid-cols-2 gap-3 flex-shrink-0">
                <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="accent" isLoading={saving}>
                  {editingUser ? 'Guardar cambios' : 'Crear cuenta'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
