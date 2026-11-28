'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Building2,
  ChevronRight,
  ExternalLink,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Power,
  Search,
  StickyNote,
  X,
} from 'lucide-react';
import { PriorityBadge, StatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import {
  createCustomer,
  listCustomers,
  listCustomerTaskCounts,
  listTasksByCustomer,
  updateCustomer,
} from '@/lib/data-service';
import { useAppCache } from '@/store/app-cache';
import type { Customer, Profile, Task } from '@/types/database';

export default function CustomersPage() {
  return <CustomersContent />;
}

function CustomersContent() {
  const { profile } = useAuth();
  const cachedCustomers = useAppCache((s) => s.customers);
  const customersLoadedAt = useAppCache((s) => s.customersLoadedAt);
  const cachedCounts = useAppCache((s) => s.customerCounts);

  const [customers, setCustomers] = useState<Customer[]>(cachedCustomers);
  const [counts, setCounts] = useState<Record<string, { total: number; active: number }>>(
    cachedCounts
  );
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [cityFilter, setCityFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [loading, setLoading] = useState(!customersLoadedAt);

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedCustomerTasks, setSelectedCustomerTasks] = useState<Task[]>([]);
  const [loadingCustomerTasks, setLoadingCustomerTasks] = useState(false);

  const [editing, setEditing] = useState<Customer | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Campos formulario
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingActive, setTogglingActive] = useState(false);

  const profileId = profile?.id;
  const profileRole = profile?.role;

  const load = useCallback(
    async (silent = false) => {
      if (!profileId || !profileRole) return;
      await Promise.resolve();
      const hasCached = useAppCache.getState().customersLoadedAt !== null;
      if (!silent && !hasCached) setLoading(true);
      try {
        const [c, taskCounts] = await Promise.all([
          listCustomers({ force: silent }),
          listCustomerTaskCounts({ force: silent }),
        ]);
        setCustomers(c);
        setCounts(taskCounts);
        setSelectedCustomer((prev) =>
          prev ? c.find((item) => item.id === prev.id) || null : null
        );
      } finally {
        setLoading(false);
      }
    },
    [profileId, profileRole]
  );

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    const handler = () => void load(true);
    window.addEventListener('vistasat:demo-updated', handler);
    return () => {
      clearTimeout(t);
      window.removeEventListener('vistasat:demo-updated', handler);
    };
  }, [load]);

  // Cargar historial de partes bajo demanda solo cuando se abre la ficha del cliente
  useEffect(() => {
    if (!selectedCustomer || !profileId || !profileRole) return;
    let active = true;
    const t = setTimeout(() => {
      setLoadingCustomerTasks(true);
      const viewer = { id: profileId, role: profileRole } as Profile;
      void listTasksByCustomer(selectedCustomer.id, viewer)
        .then((list) => {
          if (active) setSelectedCustomerTasks(list);
        })
        .catch(() => {
          if (active) setSelectedCustomerTasks([]);
        })
        .finally(() => {
          if (active) setLoadingCustomerTasks(false);
        });
    }, 0);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [selectedCustomer, profileId, profileRole]);

  // Abrir detalle automáticamente si viene `?selected=<id>` desde Búsqueda Global
  useEffect(() => {
    if (customers.length === 0) return;
    const selectedId = new URLSearchParams(window.location.search).get('selected');
    if (selectedId) {
      const match = customers.find((c) => c.id === selectedId);
      if (match) {
        const t = setTimeout(() => setSelectedCustomer(match), 0);
        return () => clearTimeout(t);
      }
    }
  }, [customers]);

  const availableCities = useMemo(() => {
    const set = new Set<string>();
    customers.forEach((c) => {
      if (c.city?.trim()) set.add(c.city.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [customers]);

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      if (statusFilter === 'active' && !c.is_active) return false;
      if (statusFilter === 'inactive' && c.is_active) return false;
      if (cityFilter !== 'all' && (c.city?.trim() || '') !== cityFilter) return false;
      if (deferredSearch.trim()) {
        const q = deferredSearch.toLowerCase();
        const text = [c.name, c.tax_id, c.city, c.contact_name, c.contact_email, c.address]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [customers, deferredSearch, cityFilter, statusFilter]);

  if (!profile) return null;
  const isCoord = profile.role === 'admin' || profile.role === 'coordinator';

  const openNew = () => {
    setEditing(null);
    setName('');
    setTaxId('');
    setAddress('');
    setCity('');
    setPostalCode('');
    setContactName('');
    setContactPhone('');
    setContactEmail('');
    setNotes('');
    setShowModal(true);
  };

  const openEdit = (c: Customer) => {
    setEditing(c);
    setName(c.name);
    setTaxId(c.tax_id || '');
    setAddress(c.address || '');
    setCity(c.city || '');
    setPostalCode(c.postal_code || '');
    setContactName(c.contact_name || '');
    setContactPhone(c.contact_phone || '');
    setContactEmail(c.contact_email || '');
    setNotes(c.notes || '');
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) {
        await updateCustomer(editing.id, {
          name: name.trim(),
          tax_id: taxId.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          postal_code: postalCode.trim() || null,
          contact_name: contactName.trim() || null,
          contact_phone: contactPhone.trim() || null,
          contact_email: contactEmail.trim() || null,
          notes: notes.trim() || null,
        });
      } else {
        await createCustomer({
          name: name.trim(),
          tax_id: taxId.trim() || null,
          address: address.trim() || null,
          city: city.trim() || null,
          postal_code: postalCode.trim() || null,
          contact_name: contactName.trim() || null,
          contact_phone: contactPhone.trim() || null,
          contact_email: contactEmail.trim() || null,
          notes: notes.trim() || null,
          created_by: profile.id,
        });
      }
      setShowModal(false);
      await load(true);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (c: Customer) => {
    setTogglingActive(true);
    try {
      await updateCustomer(c.id, { is_active: !c.is_active });
      await load(true);
    } finally {
      setTogglingActive(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-charcoal flex items-center gap-2">
            <Building2 size={22} className="text-navy" /> Directorio de Clientes
          </h1>
          <p className="text-xs text-mid-grey mt-0.5">
            {filtered.length} de {customers.length} clientes · Pulsa en cualquier ficha para ver su historial
          </p>
        </div>
        <Button variant="accent" size="sm" onClick={openNew}>
          <Plus size={16} /> Nuevo Cliente
        </Button>
      </div>

      {/* Buscador y filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <div className="relative sm:col-span-2">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-mid-grey" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente por nombre, CIF, dirección o contacto..."
            className="w-full pl-10 pr-3 py-2.5 bg-white border border-border text-charcoal"
          />
        </div>
        <select
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-border text-sm text-charcoal"
          aria-label="Filtrar por ciudad"
        >
          <option value="all">Todas las ciudades</option>
          {availableCities.map((cityName) => (
            <option key={cityName} value={cityName}>
              {cityName}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'active' | 'inactive' | 'all')}
          className="px-3 py-2.5 bg-white border border-border text-sm text-charcoal"
          aria-label="Filtrar por estado"
        >
          <option value="active">Solo activos</option>
          <option value="inactive">Desactivados</option>
          <option value="all">Todos</option>
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-36 bg-white rounded-md animate-pulse shadow-card" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-md p-8 text-center shadow-card">
          <p className="font-bold text-charcoal">No hay clientes que coincidan</p>
          <p className="text-sm text-mid-grey mt-1">
            Prueba a limpiar el filtro de ciudad o buscar otro término.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((c) => {
            const cCount = counts[c.id] || { total: 0, active: 0 };

            return (
              <div
                key={c.id}
                className={`bg-white rounded-md shadow-card p-4 border-l-4 flex flex-col justify-between gap-3 transition-opacity ${
                  c.is_active ? 'border-navy' : 'border-light-grey opacity-65'
                }`}
              >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedCustomer(c)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedCustomer(c);
                    }
                  }}
                  className="cursor-pointer text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold text-charcoal">{c.name}</h3>
                        {!c.is_active && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-danger/15 text-danger rounded-xs">
                            Inactivo
                          </span>
                        )}
                      </div>
                    </div>
                    {c.tax_id && (
                      <span className="text-[11px] font-bold px-2 py-0.5 bg-off-white border border-border flex-shrink-0">
                        {c.tax_id}
                      </span>
                    )}
                  </div>
                  {(c.address || c.city) && (
                    <p className="text-xs text-mid-grey flex items-center gap-1 mt-1.5">
                      <MapPin size={13} className="text-magenta flex-shrink-0" />
                      {[c.address, c.city].filter(Boolean).join(', ')}
                    </p>
                  )}
                  {c.contact_phone && (
                    <p className="text-xs text-dark-grey flex items-center gap-1 mt-1">
                      <Phone size={13} className="text-petrol flex-shrink-0" />
                      {c.contact_name ? `${c.contact_name} · ` : ''}
                      {c.contact_phone}
                    </p>
                  )}
                  {c.notes && (
                    <p className="text-xs text-mid-grey flex items-start gap-1 mt-1.5 line-clamp-1 italic">
                      <StickyNote size={12} className="mt-0.5 flex-shrink-0 text-amber-600" />
                      {c.notes}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                  <span className="font-semibold text-mid-grey">
                    Partes: <strong>{cCount.total}</strong>
                    {cCount.active > 0 && (
                      <span className="text-magenta font-bold"> ({cCount.active} activos)</span>
                    )}
                  </span>
                  <div className="flex items-center gap-3">
                    {(isCoord || c.created_by === profile.id) && (
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        className="font-bold text-navy hover:underline inline-flex items-center gap-1"
                      >
                        <Pencil size={12} /> Editar
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedCustomer(c)}
                      className="font-bold text-magenta hover:underline inline-flex items-center gap-0.5"
                    >
                      Ver ficha <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal / Drawer de Detalle completo del Cliente */}
      {selectedCustomer && (
        <div
          className="fixed inset-0 z-50 bg-charcoal/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setSelectedCustomer(null)}
        >
          <div
            className="bg-white w-full sm:max-w-2xl rounded-t-lg sm:rounded-lg shadow-elevated overflow-hidden max-h-[92dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-navy text-white px-5 py-4 flex items-center justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold truncate">{selectedCustomer.name}</h2>
                  {!selectedCustomer.is_active && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-danger text-white rounded-xs">
                      Inactivo
                    </span>
                  )}
                </div>
                {selectedCustomer.tax_id && (
                  <p className="text-xs text-white/75">CIF / NIF: {selectedCustomer.tax_id}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="p-1 text-white/80 hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-off-white p-4 rounded-sm border border-border">
                <div className="space-y-1.5">
                  <p className="font-bold uppercase text-mid-grey">Dirección</p>
                  <p className="text-sm font-semibold text-charcoal">
                    {[
                      selectedCustomer.address,
                      selectedCustomer.postal_code,
                      selectedCustomer.city,
                    ]
                      .filter(Boolean)
                      .join(', ') || 'Sin dirección'}
                  </p>
                  {(selectedCustomer.address || selectedCustomer.city) && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                        [selectedCustomer.address, selectedCustomer.city].filter(Boolean).join(', ')
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-magenta font-bold hover:underline"
                    >
                      Abrir en Google Maps <ExternalLink size={12} />
                    </a>
                  )}
                </div>

                <div className="space-y-1.5">
                  <p className="font-bold uppercase text-mid-grey">Contacto Principal</p>
                  <p className="text-sm font-semibold text-charcoal">
                    {selectedCustomer.contact_name || 'Sin contacto asignado'}
                  </p>
                  <div className="flex flex-wrap gap-3">
                    {selectedCustomer.contact_phone && (
                      <a
                        href={`tel:${selectedCustomer.contact_phone.replace(/\s+/g, '')}`}
                        className="inline-flex items-center gap-1 text-navy font-bold hover:underline"
                      >
                        <Phone size={12} /> {selectedCustomer.contact_phone}
                      </a>
                    )}
                    {selectedCustomer.contact_email && (
                      <a
                        href={`mailto:${selectedCustomer.contact_email}`}
                        className="inline-flex items-center gap-1 text-navy font-bold hover:underline"
                      >
                        <Mail size={12} /> {selectedCustomer.contact_email}
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {selectedCustomer.notes && (
                <div className="p-3 bg-amber-50 border-l-4 border-amber-500 text-xs text-charcoal space-y-1">
                  <p className="font-bold uppercase text-amber-800">
                    Notas Operativas Internas
                  </p>
                  <p>{selectedCustomer.notes}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Link href={`/tasks/new?customerId=${encodeURIComponent(selectedCustomer.id)}`}>
                  <Button size="sm" variant="accent">
                    <Plus size={14} /> Nueva Tarea para este Cliente
                  </Button>
                </Link>
                {(isCoord || selectedCustomer.created_by === profile.id) && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => openEdit(selectedCustomer)}
                  >
                    <Pencil size={14} /> Editar Ficha
                  </Button>
                )}
                {isCoord && (
                  <Button
                    size="sm"
                    variant={selectedCustomer.is_active ? 'danger' : 'primary'}
                    isLoading={togglingActive}
                    onClick={() => handleToggleActive(selectedCustomer)}
                  >
                    <Power size={14} />
                    {selectedCustomer.is_active ? 'Desactivar Cliente' : 'Reactivar Cliente'}
                  </Button>
                )}
              </div>

              {/* Historial de partes del cliente */}
              <div className="space-y-2.5">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-navy">
                  Historial de Partes ({selectedCustomerTasks.length})
                </h3>
                {loadingCustomerTasks ? (
                  <div className="h-20 bg-off-white rounded-sm animate-pulse" />
                ) : selectedCustomerTasks.length === 0 ? (
                  <p className="text-xs text-mid-grey py-3">
                    Este cliente aún no tiene partes de trabajo registrados.
                  </p>
                ) : (
                  <div className="divide-y divide-border border border-border rounded-sm">
                    {selectedCustomerTasks.map((t) => (
                      <Link
                        key={t.id}
                        href={`/tasks/${t.id}`}
                        className="flex items-center justify-between gap-3 p-3 hover:bg-off-white transition-colors"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-extrabold text-navy">
                              {t.code}
                            </span>
                            <StatusBadge status={t.status} />
                            <PriorityBadge priority={t.priority} />
                          </div>
                          <p className="text-xs text-charcoal font-medium truncate mt-1">
                            {t.equipment_ref ? `${t.equipment_ref} — ` : ''}
                            {t.problem_desc}
                          </p>
                          <p className="text-[11px] text-mid-grey mt-0.5">
                            {new Date(t.created_at).toLocaleDateString('es-ES')} ·{' '}
                            {t.assignee?.full_name || 'Sin asignar'}
                          </p>
                        </div>
                        <ChevronRight size={16} className="text-mid-grey flex-shrink-0" />
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Creación / Edición completa de Cliente */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-charcoal/70 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-lg sm:rounded-lg shadow-elevated overflow-hidden max-h-[90dvh] flex flex-col">
            <div className="bg-navy text-white px-5 py-4 flex items-center justify-between">
              <h2 className="text-base font-bold">
                {editing ? 'Editar Cliente' : 'Nuevo Cliente'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1 text-white/80">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-5 space-y-3 overflow-y-auto">
              <div>
                <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                  Nombre / Razón social *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-input border border-border text-charcoal"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    CIF / NIF
                  </label>
                  <input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-input border border-border text-charcoal"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    Ciudad
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-input border border-border text-charcoal"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    Cód. Postal
                  </label>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-input border border-border text-charcoal"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                  Dirección
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-input border border-border text-charcoal"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    Persona contacto
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-input border border-border text-charcoal"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    Teléfono
                  </label>
                  <input
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-input border border-border text-charcoal"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                  Correo de contacto
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-input border border-border text-charcoal"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                  Notas operativas internas
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-input border border-border text-charcoal"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="accent" isLoading={saving}>
                  Guardar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
