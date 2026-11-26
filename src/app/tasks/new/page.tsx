'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, Check, UserCheck } from 'lucide-react';
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

  // Paso 1: Cliente y sitio (existente o alta manual automática)
  const [customerId, setCustomerId] = useState('');
  const [manualCustomerName, setManualCustomerName] = useState('');
  const [manualTaxId, setManualTaxId] = useState('');
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

  const isTechnician = profile?.role === 'technician';

  const loadRefs = useCallback(async () => {
    const [custs, profs] = await Promise.all([
      listCustomers(),
      profile?.role === 'technician' ? Promise.resolve([]) : listProfiles(),
    ]);
    setCustomers(custs.filter((c) => c.is_active));
    setTechnicians(profs.filter((p) => p.role === 'technician' && p.is_active));
  }, [profile?.role]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadRefs();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadRefs]);

  if (!profile) return null;

  const handleSelectCustomer = (id: string) => {
    setCustomerId(id);
    if (!id) return;
    const c = customers.find((item) => item.id === id);
    if (c) {
      setSiteContactName(c.contact_name || '');
      setSiteContactPhone(c.contact_phone || '');
      setSiteAddress(c.address || '');
      setSiteCity(c.city || '');
    }
  };

  const handleSubmit = async () => {
    setError(null);
    if ((!customerId && !manualCustomerName.trim()) || !problemDesc.trim()) {
      setError('Indica un cliente (o sus datos manuales) y la descripción del problema.');
      return;
    }
    setSubmitting(true);
    try {
      let resolvedCustomerId = customerId;

      // Si no se seleccionó ningún cliente existente, se crea automáticamente con los datos introducidos
      if (!resolvedCustomerId) {
        const createdCustomer = await createCustomer({
          name: manualCustomerName.trim(),
          tax_id: manualTaxId.trim() || null,
          address: siteAddress.trim() || null,
          city: siteCity.trim() || null,
          postal_code: null,
          contact_name: siteContactName.trim() || null,
          contact_phone: siteContactPhone.trim() || null,
          contact_email: null,
          notes: null,
          created_by: profile.id,
        });
        resolvedCustomerId = createdCustomer.id;
        setCustomerId(createdCustomer.id);
        setCustomers((prev) => [...prev, createdCustomer]);
      }

      const created = await createTask(
        {
          customer_id: resolvedCustomerId,
          site_contact_name: siteContactName || undefined,
          site_contact_phone: siteContactPhone || undefined,
          site_address: siteAddress || undefined,
          site_city: siteCity || undefined,
          equipment_ref: equipmentRef || undefined,
          equipment_sn: equipmentSn || undefined,
          problem_desc: problemDesc.trim(),
          priority,
          assigned_to: isTechnician ? profile.id : assignedTo || null,
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
  const displayCustomerName = selectedCustomer
    ? selectedCustomer.name
    : `${manualCustomerName.trim()} (nuevo cliente)`;
  const selectedTech = isTechnician
    ? profile
    : technicians.find((t) => t.id === assignedTo);

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
            <div>
              <label className="block text-sm font-bold text-charcoal mb-1.5">
                Cliente existente (opcional)
              </label>
              <select
                value={customerId}
                onChange={(e) => handleSelectCustomer(e.target.value)}
                className="w-full px-3 py-3 bg-bg-input border border-border"
              >
                <option value="">
                  — Sin seleccionar (crear nuevo cliente manualmente) —
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.city ? `(${c.city})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {!customerId && (
              <div className="p-3.5 bg-navy/5 border-l-4 border-magenta space-y-3">
                <p className="text-xs font-bold uppercase text-navy">
                  Datos del nuevo cliente (se dará de alta automáticamente)
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                      Nombre / Razón social *
                    </label>
                    <input
                      type="text"
                      value={manualCustomerName}
                      onChange={(e) => setManualCustomerName(e.target.value)}
                      placeholder="Ej. Farmacia Central S.L."
                      className="w-full px-3 py-2.5 bg-white border border-border"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                      CIF / NIF
                    </label>
                    <input
                      type="text"
                      value={manualTaxId}
                      onChange={(e) => setManualTaxId(e.target.value)}
                      placeholder="Opcional"
                      className="w-full px-3 py-2.5 bg-white border border-border"
                    />
                  </div>
                </div>
              </div>
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
                disabled={!customerId && !manualCustomerName.trim()}
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
            {isTechnician ? (
              <div className="p-4 bg-navy/5 border-l-4 border-navy flex items-start gap-3">
                <UserCheck size={20} className="text-navy flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold uppercase text-navy">
                    Asignación automática
                  </p>
                  <p className="text-sm text-charcoal mt-0.5">
                    Este parte se asignará automáticamente a{' '}
                    <strong>{profile.full_name}</strong> con estado <strong>Asignada</strong>.
                  </p>
                </div>
              </div>
            ) : (
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
            )}

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
                <strong>Cliente:</strong> {displayCustomerName}
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
