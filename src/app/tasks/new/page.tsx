'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, Plus, Shield } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import {
  createCustomer,
  createTask,
  listCustomers,
  listProfiles,
} from '@/lib/data-service';
import {
  TASK_PRIORITY_META,
  type Customer,
  type Profile,
  type TaskPriority,
} from '@/types/database';

export default function NewTaskPage() {
  return (
    <AppShell>
      <NewTaskContent />
    </AppShell>
  );
}

function NewTaskContent() {
  const { profile } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Paso 1: Cliente y sitio
  const [customerId, setCustomerId] = useState('');
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState('');
  const [siteContactName, setSiteContactName] = useState('');
  const [siteContactPhone, setSiteContactPhone] = useState('');
  const [siteAddress, setSiteAddress] = useState('');
  const [siteCity, setSiteCity] = useState('');

  // Paso 2: Equipo y avería
  const [equipmentRef, setEquipmentRef] = useState('');
  const [equipmentSn, setEquipmentSn] = useState('');
  const [problemDesc, setProblemDesc] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');

  // Paso 3: Asignación
  const [assignedTo, setAssignedTo] = useState('');
  const [estimatedDuration, setEstimatedDuration] = useState('60');

  const loadRefs = useCallback(async () => {
    const [custs, profs] = await Promise.all([listCustomers(), listProfiles()]);
    setCustomers(custs.filter((c) => c.is_active));
    setTechnicians(profs.filter((p) => p.role === 'technician' && p.is_active));
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadRefs();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadRefs]);

  if (!profile) return null;

  if (profile.role === 'technician') {
    return (
      <div className="p-6 text-center">
        <Shield size={40} className="text-danger mx-auto mb-2" />
        <h1 className="text-lg font-bold text-charcoal">Permiso requerido</h1>
        <p className="text-sm text-mid-grey mt-1">
          Solo coordinadores o administradores pueden abrir partes nuevos.
        </p>
      </div>
    );
  }

  const handleSelectCustomer = (id: string) => {
    setCustomerId(id);
    const c = customers.find((item) => item.id === id);
    if (c) {
      setSiteContactName(c.contact_name || '');
      setSiteContactPhone(c.contact_phone || '');
      setSiteAddress(c.address || '');
      setSiteCity(c.city || '');
    }
  };

  const handleQuickCreateCustomer = async () => {
    if (!newCustomerName.trim()) return;
    const created = await createCustomer({
      name: newCustomerName.trim(),
      tax_id: null,
      address: siteAddress || null,
      city: siteCity || null,
      postal_code: null,
      contact_name: siteContactName || null,
      contact_phone: siteContactPhone || null,
      contact_email: null,
      notes: null,
      created_by: profile.id,
    });
    setCustomers((prev) => [...prev, created]);
    setCustomerId(created.id);
    setCreatingCustomer(false);
    setNewCustomerName('');
  };

  const handleSubmit = async () => {
    setError(null);
    if (!customerId || !problemDesc.trim()) {
      setError('Selecciona un cliente e introduce la descripción del problema.');
      return;
    }
    setSubmitting(true);
    try {
      const created = await createTask(
        {
          customer_id: customerId,
          site_contact_name: siteContactName || undefined,
          site_contact_phone: siteContactPhone || undefined,
          site_address: siteAddress || undefined,
          site_city: siteCity || undefined,
          equipment_ref: equipmentRef || undefined,
          equipment_sn: equipmentSn || undefined,
          problem_desc: problemDesc.trim(),
          priority,
          assigned_to: assignedTo || null,
          estimated_duration: estimatedDuration ? parseInt(estimatedDuration, 10) : null,
        },
        profile
      );
      router.push(`/tasks/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando el parte');
      setSubmitting(false);
    }
  };

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const selectedTech = technicians.find((t) => t.id === assignedTo);

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/tasks" className="p-2 bg-white border border-border text-navy">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-charcoal">Nuevo Parte de Trabajo</h1>
          <p className="text-xs text-mid-grey">Paso {step} de 3 · Código correlativo automático</p>
        </div>
      </div>

      {/* Indicador de pasos */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { n: 1, label: '1. Cliente' },
          { n: 2, label: '2. Avería' },
          { n: 3, label: '3. Asignación' },
        ].map((item) => (
          <div
            key={item.n}
            className={`py-2 px-3 text-xs font-bold text-center border-b-4 ${
              step === item.n
                ? 'border-magenta bg-white text-navy'
                : step > item.n
                ? 'border-success bg-white text-success'
                : 'border-border bg-white/60 text-mid-grey'
            }`}
          >
            {item.label}
          </div>
        ))}
      </div>

      {/* Contenido de cada paso */}
      <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-4">
        {step === 1 && (
          <>
            <div className="flex items-center justify-between">
              <label className="text-sm font-bold text-charcoal">Cliente *</label>
              <button
                type="button"
                onClick={() => setCreatingCustomer(!creatingCustomer)}
                className="text-xs font-bold text-magenta hover:underline inline-flex items-center gap-1"
              >
                <Plus size={14} /> {creatingCustomer ? 'Seleccionar existente' : 'Cliente rápido'}
              </button>
            </div>

            {creatingCustomer ? (
              <div className="p-3 bg-off-white border border-border space-y-3">
                <input
                  type="text"
                  value={newCustomerName}
                  onChange={(e) => setNewCustomerName(e.target.value)}
                  placeholder="Razón social / Nombre del cliente *"
                  className="w-full px-3 py-2.5 bg-white border border-border"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={handleQuickCreateCustomer}
                  disabled={!newCustomerName.trim()}
                >
                  Guardar cliente rápido
                </Button>
              </div>
            ) : (
              <select
                value={customerId}
                onChange={(e) => handleSelectCustomer(e.target.value)}
                className="w-full px-3 py-3 bg-bg-input border border-border"
              >
                <option value="">Selecciona un cliente...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.city ? `(${c.city})` : ''}
                  </option>
                ))}
              </select>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                  Persona de contacto
                </label>
                <input
                  type="text"
                  value={siteContactName}
                  onChange={(e) => setSiteContactName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-bg-input border border-border"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                  Teléfono en sitio
                </label>
                <input
                  type="tel"
                  value={siteContactPhone}
                  onChange={(e) => setSiteContactPhone(e.target.value)}
                  className="w-full px-3 py-2.5 bg-bg-input border border-border"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                  Dirección de intervención
                </label>
                <input
                  type="text"
                  value={siteAddress}
                  onChange={(e) => setSiteAddress(e.target.value)}
                  className="w-full px-3 py-2.5 bg-bg-input border border-border"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                  Ciudad
                </label>
                <input
                  type="text"
                  value={siteCity}
                  onChange={(e) => setSiteCity(e.target.value)}
                  className="w-full px-3 py-2.5 bg-bg-input border border-border"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button
                type="button"
                disabled={!customerId}
                onClick={() => setStep(2)}
              >
                Siguiente <ArrowRight size={16} />
              </Button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                  Equipo / Modelo
                </label>
                <input
                  type="text"
                  value={equipmentRef}
                  onChange={(e) => setEquipmentRef(e.target.value)}
                  placeholder="Ej. Impresora Ricoh IM C3000"
                  className="w-full px-3 py-2.5 bg-bg-input border border-border"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                  Nº de Serie
                </label>
                <input
                  type="text"
                  value={equipmentSn}
                  onChange={(e) => setEquipmentSn(e.target.value)}
                  placeholder="Opcional"
                  className="w-full px-3 py-2.5 bg-bg-input border border-border"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                Descripción del problema *
              </label>
              <textarea
                rows={4}
                required
                value={problemDesc}
                onChange={(e) => setProblemDesc(e.target.value)}
                placeholder="Describe síntomas, código de error o instrucciones previas..."
                className="w-full px-3 py-2.5 bg-bg-input border border-border"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-mid-grey mb-2">
                Prioridad
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(TASK_PRIORITY_META) as TaskPriority[]).map((p) => {
                  const meta = TASK_PRIORITY_META[p];
                  const active = priority === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`py-2.5 px-3 border text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 min-h-[44px] ${
                        active
                          ? 'border-navy bg-navy text-white'
                          : 'border-border bg-white text-dark-grey'
                      }`}
                    >
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: meta.dotColor }}
                      />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 flex justify-between">
              <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                <ArrowLeft size={16} /> Atrás
              </Button>
              <Button
                type="button"
                disabled={!problemDesc.trim()}
                onClick={() => setStep(3)}
              >
                Siguiente <ArrowRight size={16} />
              </Button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div>
              <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                Asignar a Técnico (Opcional)
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="w-full px-3 py-3 bg-bg-input border border-border"
              >
                <option value="">Dejar pendiente sin asignar (aviso al equipo)</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name} {t.phone ? `· ${t.phone}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                Duración estimada (minutos)
              </label>
              <input
                type="number"
                min={15}
                step={15}
                value={estimatedDuration}
                onChange={(e) => setEstimatedDuration(e.target.value)}
                className="w-full px-3 py-2.5 bg-bg-input border border-border"
              />
            </div>

            {/* Resumen */}
            <div className="p-4 bg-off-white border-l-4 border-navy space-y-1.5 text-sm">
              <p className="text-xs font-bold uppercase text-navy">Resumen del parte</p>
              <p>
                <strong>Cliente:</strong> {selectedCustomer?.name}
              </p>
              <p>
                <strong>Equipo:</strong> {equipmentRef || 'No especificado'}
              </p>
              <p>
                <strong>Prioridad:</strong> {TASK_PRIORITY_META[priority].label}
              </p>
              <p>
                <strong>Asignado a:</strong> {selectedTech?.full_name || 'Sin asignar (Pendiente)'}
              </p>
            </div>

            {error && (
              <p className="text-xs font-semibold text-danger bg-danger/10 p-3 border-l-4 border-danger">
                {error}
              </p>
            )}

            <div className="pt-2 flex justify-between gap-3">
              <Button type="button" variant="secondary" onClick={() => setStep(2)}>
                <ArrowLeft size={16} /> Atrás
              </Button>
              <Button
                type="button"
                variant="accent"
                isLoading={submitting}
                onClick={handleSubmit}
              >
                <Check size={16} /> Crear Parte
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
