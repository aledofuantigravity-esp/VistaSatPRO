'use client';

import { useCallback, useEffect, useState } from 'react';
import { Plus, Shield, UserCheck, UserX, Users as UsersIcon, Wrench, X } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import {
  createUserAccount,
  listProfiles,
  listTasks,
  updateProfile,
} from '@/lib/data-service';
import { ROLE_LABELS, type Profile, type Task, type UserRole } from '@/types/database';

export default function UsersPage() {
  return (
    <AppShell>
      <UsersContent />
    </AppShell>
  );
}

function UsersContent() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Formulario nuevo usuario (Decisión 3: email + contraseña inicial manual)
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('technician');
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile) return;
    await Promise.resolve();
    setLoading(true);
    try {
      const [u, t] = await Promise.all([listProfiles(), listTasks(profile)]);
      setUsers(u);
      setTasks(t);
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  if (!profile) return null;

  if (profile.role === 'technician') {
    return (
      <div className="p-6 text-center">
        <Shield size={40} className="text-danger mx-auto mb-2" />
        <h1 className="text-lg font-bold text-charcoal">Acceso restringido</h1>
        <p className="text-sm text-mid-grey mt-1">
          Solo administradores y coordinadores pueden gestionar cuentas del equipo.
        </p>
      </div>
    );
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (password.length < 6) {
      setFormError('La contraseña inicial debe tener al menos 6 caracteres.');
      return;
    }
    setCreating(true);
    try {
      await createUserAccount({
        email,
        password,
        full_name: fullName,
        phone,
        role,
      });
      setShowCreate(false);
      setFullName('');
      setEmail('');
      setPhone('');
      setPassword('');
      setRole('technician');
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al crear la cuenta');
    } finally {
      setCreating(false);
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

  return (
    <div className="p-4 sm:p-6 space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-charcoal flex items-center gap-2">
            <UsersIcon size={22} className="text-navy" /> Equipo y Usuarios
          </h1>
          <p className="text-xs text-mid-grey mt-0.5">
            Alta manual con email y contraseña inicial · Gestión de roles RBAC
          </p>
        </div>

        <Button variant="accent" size="sm" onClick={() => setShowCreate(true)}>
          <Plus size={16} /> Nuevo Usuario
        </Button>
      </div>

      {/* Lista de usuarios */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 bg-white rounded-md animate-pulse shadow-card" />
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
            return (
              <div
                key={u.id}
                className={`bg-white rounded-md shadow-card p-4 border-l-4 ${
                  u.is_active ? 'border-navy' : 'border-light-grey opacity-65'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-charcoal truncate">
                        {u.full_name}
                      </h3>
                      {!u.is_active && (
                        <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-danger/15 text-danger rounded-sm">
                          Inactivo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-mid-grey truncate">{u.email}</p>
                    {u.phone && <p className="text-xs text-dark-grey mt-0.5">{u.phone}</p>}
                  </div>

                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-navy/10 text-navy text-xs font-bold rounded-sm">
                    {u.role === 'technician' ? <Wrench size={12} /> : <UserCheck size={12} />}
                    {ROLE_LABELS[u.role]}
                  </span>
                </div>

                <div className="mt-4 pt-3 border-t border-border flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-dark-grey">
                    Partes activos asignados: <strong>{activeTasks}</strong>
                  </span>

                  {u.id !== profile.id && (
                    <div className="flex items-center gap-2">
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
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal crear usuario */}
      {showCreate && (
        <div className="fixed inset-0 z-50 bg-charcoal/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-lg sm:rounded-lg shadow-elevated overflow-hidden">
            <div className="bg-navy text-white px-5 py-4 flex items-center justify-between">
              <h2 className="text-base font-bold">Alta de Nuevo Usuario</h2>
              <button
                onClick={() => setShowCreate(false)}
                className="p-1 text-white/80 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="p-5 space-y-3.5">
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="miguel@empresa.com"
                  className="w-full px-3 py-2.5 bg-bg-input border border-border"
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
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2.5 bg-bg-input border border-border"
                  >
                    <option value="technician">Técnico</option>
                    <option value="coordinator">Coordinador</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-dark-grey uppercase mb-1">
                  Contraseña inicial * (mín. 6 caracteres)
                </label>
                <input
                  type="text"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Clave temporal para entregar al técnico"
                  className="w-full px-3 py-2.5 bg-bg-input border border-border"
                />
              </div>

              {formError && (
                <p className="text-xs font-semibold text-danger bg-danger/10 p-2.5 border-l-4 border-danger">
                  {formError}
                </p>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="accent" isLoading={creating}>
                  Crear cuenta
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
