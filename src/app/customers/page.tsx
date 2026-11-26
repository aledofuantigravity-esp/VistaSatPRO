'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, MapPin, Phone, Plus, Search, X } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { createCustomer, listCustomers, listTasks, updateCustomer } from '@/lib/data-service';
import type { Customer, Task } from '@/types/database';

export default function CustomersPage() {
  return (
    <AppShell>
      <CustomersContent />
    </AppShell>
  );
}

function CustomersContent() {
  const { profile } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Campos formulario
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const profileId = profile?.id;
  const profileRole = profile?.role;

  const load = useCallback(async () => {
    if (!profileId || !profileRole) return;
    await Promise.resolve();
    setLoading(true);
    try {
      const viewer = { id: profileId, role: profileRole } as import('@/types/database').Profile;
      const [c, t] = await Promise.all([listCustomers(), listTasks(viewer)]);
      setCustomers(c);
      setTasks(t);
    } finally {
      setLoading(false);
    }
  }, [profileId, profileRole]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter((c) =>
      [c.name, c.tax_id, c.city, c.contact_name].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [customers, search]);

  if (!profile) return null;
  const isCoord = profile.role === 'admin' || profile.role === 'coordinator';

  const openNew = () => {
    setEditing(null);
    setName('');
    setTaxId('');
    setAddress('');
    setCity('');
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
          name,
          tax_id: taxId || null,
          address: address || null,
          city: city || null,
          contact_name: contactName || null,
          contact_phone: contactPhone || null,
          contact_email: contactEmail || null,
          notes: notes || null,
        });
      } else {
        await createCustomer({
          name,
          tax_id: taxId || null,
          address: address || null,
          city: city || null,
          postal_code: null,
          contact_name: contactName || null,
          contact_phone: contactPhone || null,
          contact_email: contactEmail || null,
          notes: notes || null,
          created_by: profile.id,
        });
      }
      setShowModal(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-charcoal flex items-center gap-2">
            <Building2 size={22} className="text-navy" /> Directorio de Clientes
          </h1>
          <p className="text-xs text-mid-grey mt-0.5">{customers.length} clientes registrados</p>
        </div>
        <Button variant="accent" size="sm" onClick={openNew}>
          <Plus size={16} /> Nuevo Cliente
        </Button>
      </div>

      <div className="relative">
        <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-mid-grey" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar cliente por nombre, CIF o ciudad..."
          className="w-full pl-10 pr-3 py-2.5 bg-white border border-border"
        />
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-36 bg-white rounded-md animate-pulse shadow-card" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((c) => {
            const count = tasks.filter((t) => t.customer_id === c.id).length;
            return (
              <div
                key={c.id}
                className="bg-white rounded-md shadow-card p-4 border-l-4 border-navy flex flex-col justify-between gap-3"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-charcoal">{c.name}</h3>
                    {c.tax_id && (
                      <span className="text-[11px] font-bold px-2 py-0.5 bg-off-white border border-border">
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
                </div>

                <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                  <span className="font-semibold text-mid-grey">
                    Partes asociados: <strong>{count}</strong>
                  </span>
                  {(isCoord || c.created_by === profile.id) && (
                    <button
                      type="button"
                      onClick={() => openEdit(c)}
                      className="font-bold text-navy hover:underline"
                    >
                      Editar ficha
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

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
                  className="w-full px-3 py-2 bg-bg-input border border-border"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    CIF / NIF
                  </label>
                  <input
                    type="text"
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-input border border-border"
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
                    className="w-full px-3 py-2 bg-bg-input border border-border"
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
                  className="w-full px-3 py-2 bg-bg-input border border-border"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    Persona contacto
                  </label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-input border border-border"
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
                    className="w-full px-3 py-2 bg-bg-input border border-border"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                  Notas operativas
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-input border border-border"
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
