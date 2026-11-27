'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  ClipboardCheck,
  FileUp,
  Layers,
  PackagePlus,
  Plus,
  Trash2,
  UserCheck,
  Wrench,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import {
  createCustomer,
  createTask,
  listCustomers,
  listProfiles,
  uploadTaskAttachment,
} from '@/lib/data-service';
import {
  TASK_PRIORITY_META,
  TASK_TYPE_META,
  type Customer,
  type MaterialItem,
  type Profile,
  type TaskPriority,
  type TaskType,
} from '@/types/database';

interface DraftPieceRow {
  id: string;
  name: string;
  ref: string;
  qty: string;
}

export default function NewTaskPage() {
  return (
    <AppShell>
      <NewTaskContent />
    </AppShell>
  );
}

const TASK_TYPE_ORDER: TaskType[] = [
  'installation',
  'rma_incident',
  'cxc_incident',
  'task',
];

function NewTaskContent() {
  const { profile } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [taskType, setTaskType] = useState<TaskType>('rma_incident');
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

  // Paso 2: Campos comunes y específicos según tipo
  const [equipmentRef, setEquipmentRef] = useState('');
  const [equipmentSn, setEquipmentSn] = useState('');
  const [problemDesc, setProblemDesc] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');

  // Instalación
  const [scheduledDate, setScheduledDate] = useState('');
  const [orderFile, setOrderFile] = useState<File | null>(null);

  // Incidencia CXC (copias y piezas con botón +)
  const [meterBw, setMeterBw] = useState('');
  const [meterColor, setMeterColor] = useState('');
  const [cxcPieces, setCxcPieces] = useState<DraftPieceRow[]>([
    { id: 'piece-1', name: '', ref: '', qty: '1' },
  ]);

  // Paso 3: Asignación
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');

  const isTechnician = profile?.role === 'technician';

  const loadRefs = useCallback(async () => {
    const [custs, profs] = await Promise.all([
      listCustomers(),
      profile?.role === 'technician' ? Promise.resolve([]) : listProfiles(),
    ]);
    const activeCusts = custs.filter((c) => c.is_active);
    const activeTechs = profs.filter((p) => p.role === 'technician' && p.is_active);
    setCustomers(activeCusts);
    setTechnicians(activeTechs);
    if (activeTechs.length === 1) {
      setAssignedTo(activeTechs[0].id);
    }

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const preselectedType = params.get('type');
      if (
        preselectedType === 'installation' ||
        preselectedType === 'rma_incident' ||
        preselectedType === 'cxc_incident' ||
        preselectedType === 'task'
      ) {
        setTaskType(preselectedType);
      }

      const preselectedCust = params.get('customerId');
      if (preselectedCust) {
        const match = activeCusts.find((c) => c.id === preselectedCust);
        if (match) {
          setCustomerId(match.id);
          setSiteContactName(match.contact_name || '');
          setSiteContactPhone(match.contact_phone || '');
          setSiteAddress(match.address || '');
          setSiteCity(match.city || '');
        }
      }
    }
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

  const addCxcPieceRow = () => {
    setCxcPieces((prev) => [
      ...prev,
      { id: `piece-${Date.now()}-${prev.length + 1}`, name: '', ref: '', qty: '1' },
    ]);
  };

  const updateCxcPieceRow = (id: string, field: keyof DraftPieceRow, value: string) => {
    setCxcPieces((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
  };

  const removeCxcPieceRow = (id: string) => {
    setCxcPieces((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.id !== id)));
  };

  const handleOrderFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      setError('El pedido de instalación debe ser PDF o imagen (JPG, PNG, WEBP).');
      e.target.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError('El pedido de instalación supera el máximo permitido de 10 MB.');
      e.target.value = '';
      return;
    }
    setError(null);
    setOrderFile(file);
  };

  const normalizedMaterials: MaterialItem[] = cxcPieces
    .filter((r) => r.name.trim().length > 0)
    .map((r) => ({
      id: r.id,
      name: r.name.trim(),
      ref: r.ref.trim() || undefined,
      qty: Math.max(1, parseInt(r.qty, 10) || 1),
    }));

  const step2Valid = problemDesc.trim().length > 0;

  const handleSubmit = async () => {
    setError(null);
    if ((!customerId && !manualCustomerName.trim()) || !problemDesc.trim()) {
      setError('Indica un cliente y la descripción.');
      return;
    }

    setSubmitting(true);
    try {
      let resolvedCustomerId = customerId;

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

      const parsedBw =
        taskType === 'cxc_incident' && meterBw.trim() !== ''
          ? Math.max(0, parseInt(meterBw, 10) || 0)
          : null;
      const parsedColor =
        taskType === 'cxc_incident' && meterColor.trim() !== ''
          ? Math.max(0, parseInt(meterColor, 10) || 0)
          : null;

      const created = await createTask(
        {
          task_type: taskType,
          customer_id: resolvedCustomerId,
          site_contact_name: siteContactName || undefined,
          site_contact_phone: siteContactPhone || undefined,
          site_address: siteAddress || undefined,
          site_city: siteCity || undefined,
          equipment_ref: taskType === 'task' ? undefined : equipmentRef || undefined,
          equipment_sn: taskType === 'task' ? undefined : equipmentSn.trim() || undefined,
          problem_desc: problemDesc.trim(),
          priority,
          assigned_to: isTechnician
            ? profile.id
            : technicians.length === 1
            ? technicians[0].id
            : assignedTo || null,
          due_date: !isTechnician && dueDate ? new Date(dueDate).toISOString() : null,
          scheduled_date:
            taskType === 'installation' && scheduledDate
              ? new Date(scheduledDate).toISOString()
              : null,
          merchandise_check_done: taskType === 'installation' ? null : undefined,
          meter_bw: parsedBw,
          meter_color: parsedColor,
          materials_used: taskType === 'cxc_incident' ? normalizedMaterials : undefined,
        },
        profile
      );

      // Si es Instalación y adjuntó pedido, subirlo automáticamente
      if (taskType === 'installation' && orderFile) {
        await uploadTaskAttachment(
          created.id,
          orderFile,
          `Pedido de instalación: ${orderFile.name}`,
          profile,
          { kind: 'installation_order' }
        );
      }

      router.push(`/tasks/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creando la tarea');
      setSubmitting(false);
    }
  };

  const selectedCustomer = customers.find((c) => c.id === customerId);
  const displayCustomerName = selectedCustomer
    ? selectedCustomer.name
    : `${manualCustomerName.trim()} (nuevo cliente)`;
  const singleTechnician = !isTechnician && technicians.length === 1 ? technicians[0] : null;
  const selectedTech = isTechnician
    ? profile
    : singleTechnician || technicians.find((t) => t.id === assignedTo);

  const typeMeta = TASK_TYPE_META[taskType];

  const getTypeIcon = (type: TaskType) => {
    switch (type) {
      case 'installation':
        return <PackagePlus size={18} />;
      case 'cxc_incident':
        return <Layers size={18} />;
      case 'task':
        return <ClipboardCheck size={18} />;
      default:
        return <Wrench size={18} />;
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/tasks" className="p-2 bg-white border border-border text-navy">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-charcoal">Nueva Tarea</h1>
          <p className="text-xs text-mid-grey">
            Paso {step} de 3 · {typeMeta.label} · Código correlativo automático
          </p>
        </div>
      </div>

      {/* Indicador de pasos */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { n: 1, label: '1. Tipo y Cliente' },
          {
            n: 2,
            label:
              taskType === 'installation'
                ? '2. Instalación'
                : taskType === 'cxc_incident'
                ? '2. Datos CXC'
                : taskType === 'task'
                ? '2. Tarea'
                : '2. Avería RMA',
          },
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
            {/* Selector de Tipo de Tarea */}
            <div>
              <label className="block text-sm font-bold text-charcoal mb-2">
                Tipo de tarea *
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {TASK_TYPE_ORDER.map((tType) => {
                  const meta = TASK_TYPE_META[tType];
                  const active = taskType === tType;
                  return (
                    <button
                      key={tType}
                      type="button"
                      onClick={() => setTaskType(tType)}
                      className={`p-3 border-2 text-left transition-all rounded-sm flex items-start gap-2.5 ${
                        active
                          ? 'border-magenta bg-navy/5'
                          : 'border-border bg-off-white/60 hover:border-navy/40'
                      }`}
                    >
                      <span
                        className={`p-2 rounded-sm flex-shrink-0 ${
                          active ? 'bg-navy text-white' : 'bg-white text-navy border border-border'
                        }`}
                      >
                        {getTypeIcon(tType)}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-charcoal">{meta.label}</p>
                        <p className="text-[11px] text-mid-grey leading-snug mt-0.5">
                          {meta.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-border">
              <label className="block text-sm font-bold text-charcoal mb-1.5">
                Cliente existente (opcional)
              </label>
              <select
                value={customerId}
                onChange={(e) => handleSelectCustomer(e.target.value)}
                className="w-full px-3 py-3 bg-bg-input border border-border text-charcoal"
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
                      className="w-full px-3 py-2.5 bg-white border border-border text-charcoal"
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
                      className="w-full px-3 py-2.5 bg-white border border-border text-charcoal"
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
                  className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal"
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
                  className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal"
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
                  className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal"
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
                  className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal"
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
            {/* ── BLOQUE ESPECÍFICO: INSTALACIÓN ─────────────────────────── */}
            {taskType === 'installation' && (
              <>
                <div className="p-3 bg-petrol/10 border-l-4 border-petrol text-xs text-charcoal">
                  <strong>Solicitud de Instalación:</strong> Adjunta el pedido de instalación
                  (PDF o imagen) y asigna la fecha futura acordada con el cliente.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                      Equipo / Sistema a instalar
                    </label>
                    <input
                      type="text"
                      value={equipmentRef}
                      onChange={(e) => setEquipmentRef(e.target.value)}
                      placeholder="Ej. Ricoh IM C3500 + Finisher"
                      className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                      Nº de Serie (si disponible)
                    </label>
                    <input
                      type="text"
                      value={equipmentSn}
                      onChange={(e) => setEquipmentSn(e.target.value)}
                      placeholder="Opcional"
                      className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    Solicitud de instalación / Alcance *
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={problemDesc}
                    onChange={(e) => setProblemDesc(e.target.value)}
                    placeholder="Indica detalles de la solicitud de instalación, ubicación, red, requisitos..."
                    className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-mid-grey mb-1 flex items-center gap-1">
                      <Calendar size={13} className="text-magenta" /> Fecha acordada de instalación
                    </label>
                    <input
                      type="datetime-local"
                      value={scheduledDate}
                      onChange={(e) => setScheduledDate(e.target.value)}
                      className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-mid-grey mb-1 flex items-center gap-1">
                      <FileUp size={13} className="text-magenta" /> Adjuntar Pedido de Instalación
                    </label>
                    <label className="flex items-center justify-center gap-2 px-3 py-2.5 bg-bg-input border border-dashed border-navy/50 text-xs font-bold text-navy cursor-pointer hover:bg-navy/5 min-h-[46px]">
                      <FileUp size={15} />
                      <span className="truncate">
                        {orderFile ? orderFile.name : 'Subir PDF o imagen (máx. 10 MB)'}
                      </span>
                      <input
                        type="file"
                        accept="application/pdf,image/jpeg,image/png,image/webp"
                        onChange={handleOrderFileChange}
                        className="hidden"
                      />
                    </label>
                    {orderFile && (
                      <button
                        type="button"
                        onClick={() => setOrderFile(null)}
                        className="text-[11px] font-bold text-danger mt-1 hover:underline"
                      >
                        Quitar archivo adjunto
                      </button>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* ── BLOQUE ESPECÍFICO: INCIDENCIA RMA ──────────────────────── */}
            {taskType === 'rma_incident' && (
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
                      className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal"
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
                      className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal"
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
                    className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal"
                  />
                </div>
              </>
            )}

            {/* ── BLOQUE ESPECÍFICO: INCIDENCIA CXC ──────────────────────── */}
            {taskType === 'cxc_incident' && (
              <>
                <div className="p-3 bg-magenta/10 border-l-4 border-magenta text-xs text-charcoal">
                  <strong>Incidencia CXC:</strong> El nº de serie es opcional al crear la
                  incidencia, pero será <strong>obligatorio en la ficha para poder cerrarla</strong>.
                  Indica las copias actuales en B/N y color y añade piezas con el botón <strong>+</strong>.
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                      Equipo / Modelo
                    </label>
                    <input
                      type="text"
                      value={equipmentRef}
                      onChange={(e) => setEquipmentRef(e.target.value)}
                      placeholder="Ej. Ricoh IM C3000"
                      className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                      Nº de Serie (obligatorio al cerrar)
                    </label>
                    <input
                      type="text"
                      value={equipmentSn}
                      onChange={(e) => setEquipmentSn(e.target.value)}
                      placeholder="Ej. SN-CXC-90412 (opcional al crear)"
                      className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                      Nº Copias B/N actuales
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={meterBw}
                      onChange={(e) => setMeterBw(e.target.value)}
                      placeholder="Ej. 45200"
                      className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                      Nº Copias Color actuales
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={meterColor}
                      onChange={(e) => setMeterColor(e.target.value)}
                      placeholder="Ej. 18400"
                      className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    Descripción de la incidencia CXC *
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={problemDesc}
                    onChange={(e) => setProblemDesc(e.target.value)}
                    placeholder="Describe la incidencia CXC detectada..."
                    className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal"
                  />
                </div>

                {/* Piezas dinámicas con botón + */}
                <div className="space-y-2 pt-2 border-t border-border">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase text-navy">
                      Piezas a utilizar (opcional)
                    </label>
                    <button
                      type="button"
                      onClick={addCxcPieceRow}
                      className="inline-flex items-center gap-1 px-2.5 py-1 bg-navy text-white text-xs font-bold hover:bg-navy-dark"
                      aria-label="Añadir fila de pieza"
                    >
                      <Plus size={14} /> Añadir pieza
                    </button>
                  </div>

                  <div className="space-y-2">
                    {cxcPieces.map((row, idx) => (
                      <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) => updateCxcPieceRow(row.id, 'name', e.target.value)}
                          placeholder={`Pieza ${idx + 1}`}
                          className="col-span-6 px-2.5 py-2 bg-bg-input border border-border text-xs text-charcoal"
                        />
                        <input
                          type="text"
                          value={row.ref}
                          onChange={(e) => updateCxcPieceRow(row.id, 'ref', e.target.value)}
                          placeholder="Ref."
                          className="col-span-3 px-2.5 py-2 bg-bg-input border border-border text-xs text-charcoal"
                        />
                        <input
                          type="number"
                          min={1}
                          value={row.qty}
                          onChange={(e) => updateCxcPieceRow(row.id, 'qty', e.target.value)}
                          className="col-span-2 px-2 py-2 bg-bg-input border border-border text-xs text-center text-charcoal"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            idx === cxcPieces.length - 1
                              ? addCxcPieceRow()
                              : removeCxcPieceRow(row.id)
                          }
                          className={`col-span-1 h-9 flex items-center justify-center ${
                            idx === cxcPieces.length - 1
                              ? 'bg-navy text-white hover:bg-navy-dark'
                              : 'border border-border text-mid-grey hover:text-danger'
                          }`}
                          aria-label={
                            idx === cxcPieces.length - 1 ? 'Añadir pieza' : 'Quitar pieza'
                          }
                        >
                          {idx === cxcPieces.length - 1 ? (
                            <Plus size={15} />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* ── BLOQUE ESPECÍFICO: TAREA GENERAL ───────────────────────── */}
            {taskType === 'task' && (
              <div>
                <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                  Añadir tarea / Descripción *
                </label>
                <textarea
                  rows={4}
                  required
                  value={problemDesc}
                  onChange={(e) => setProblemDesc(e.target.value)}
                  placeholder="Describe la tarea a realizar para que el técnico pueda informar de su avance hasta finalizar..."
                  className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal"
                />
              </div>
            )}

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

            {error && (
              <p className="text-xs font-semibold text-danger bg-danger/10 p-3 border-l-4 border-danger">
                {error}
              </p>
            )}

            <div className="pt-2 flex justify-between">
              <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                <ArrowLeft size={16} /> Atrás
              </Button>
              <Button
                type="button"
                disabled={!step2Valid}
                onClick={() => {
                  setError(null);
                  setStep(3);
                }}
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
                    Esta tarea se asignará automáticamente a{' '}
                    <strong>{profile.full_name}</strong> con estado <strong>Pendiente</strong>.
                  </p>
                </div>
              </div>
            ) : singleTechnician ? (
              <div className="p-4 bg-navy/5 border-l-4 border-navy flex items-start gap-3">
                <UserCheck size={20} className="text-navy flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold uppercase text-navy">
                    Asignación automática (único técnico activo)
                  </p>
                  <p className="text-sm text-charcoal mt-0.5">
                    Al haber un único técnico activo en la aplicación, este parte se asignará
                    automáticamente a <strong>{singleTechnician.full_name}</strong> con estado{' '}
                    <strong>Pendiente</strong>.
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
                  className="w-full px-3 py-3 bg-bg-input border border-border text-charcoal"
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

            {!isTechnician && (
              <div>
                <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                  Fecha límite SLA (opcional)
                </label>
                <input
                  type="datetime-local"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal"
                />
              </div>
            )}

            {/* Resumen */}
            <div className="p-4 bg-off-white border-l-4 border-navy space-y-1.5 text-sm">
              <p className="text-xs font-bold uppercase text-navy">
                Resumen de la tarea
              </p>
              <p>
                <strong>Tipo:</strong> {typeMeta.label}
              </p>
              <p>
                <strong>Cliente:</strong> {displayCustomerName}
              </p>
              {taskType !== 'task' && (
                <p>
                  <strong>Equipo:</strong> {equipmentRef || 'No especificado'}
                  {equipmentSn ? ` (S/N: ${equipmentSn})` : ''}
                </p>
              )}
              {taskType === 'installation' && (
                <>
                  <p>
                    <strong>Fecha acordada:</strong>{' '}
                    {scheduledDate
                      ? new Date(scheduledDate).toLocaleString('es-ES', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })
                      : 'Pendiente de acordar'}
                  </p>
                  <p>
                    <strong>Pedido adjunto:</strong> {orderFile ? orderFile.name : 'Sin adjuntar'}
                  </p>
                </>
              )}
              {taskType === 'cxc_incident' && (
                <>
                  <p>
                    <strong>Copias actuales:</strong> B/N {meterBw || '—'} · Color{' '}
                    {meterColor || '—'}
                  </p>
                  <p>
                    <strong>Piezas previstas:</strong>{' '}
                    {normalizedMaterials.length > 0
                      ? normalizedMaterials.map((m) => `${m.name} (x${m.qty})`).join(', ')
                      : 'Ninguna añadida'}
                  </p>
                </>
              )}
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
                <Check size={16} /> Crear Tarea
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
