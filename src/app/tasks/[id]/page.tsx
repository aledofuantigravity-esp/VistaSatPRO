'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  FileDown,
  History,
  MapPin,
  PackagePlus,
  PenTool,
  Phone,
  Plus,
  Send,
  Trash2,
  UserCheck,
  Wrench,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { PriorityBadge, StatusBadge } from '@/components/ui/Badge';
import { SignaturePadModal } from '@/components/ui/SignaturePadModal';
import { useAuth } from '@/hooks/useAuth';
import {
  addTaskNote,
  getTaskDetail,
  listProfiles,
  updateTaskFields,
  updateTaskStatus,
  uploadTaskAttachment,
} from '@/lib/data-service';
import { downloadTaskPDF } from '@/lib/pdf-generator';
import {
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  type Attachment,
  type MaterialItem,
  type Profile,
  type Task,
  type TaskHistoryItem,
  type TaskPriority,
  type TaskStatus,
} from '@/types/database';

export default function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <AppShell>
      <TaskDetailContent taskId={id} />
    </AppShell>
  );
}

function TaskDetailContent({ taskId }: { taskId: string }) {
  const { profile } = useAuth();
  const [task, setTask] = useState<Task | null>(null);
  const [history, setHistory] = useState<TaskHistoryItem[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  // Acciones interactivas
  const [noteInput, setNoteInput] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [matName, setMatName] = useState('');
  const [matRef, setMatRef] = useState('');
  const [matQty, setMatQty] = useState('1');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showStatusSheet, setShowStatusSheet] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);

  const profileId = profile?.id;
  const profileRole = profile?.role;

  const load = useCallback(async () => {
    if (!profileId || !profileRole) return;
    await Promise.resolve();
    setLoading(true);
    try {
      const [detail, profs] = await Promise.all([
        getTaskDetail(taskId),
        profileRole === 'technician' ? Promise.resolve([]) : listProfiles(),
      ]);
      setTask(detail.task);
      setHistory(detail.history);
      setAttachments(detail.attachments);
      setTechnicians(profs.filter((p) => p.role === 'technician' && p.is_active));
    } finally {
      setLoading(false);
    }
  }, [taskId, profileId, profileRole]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    const handler = () => void load();
    window.addEventListener('vistasat:demo-updated', handler);
    return () => {
      clearTimeout(t);
      window.removeEventListener('vistasat:demo-updated', handler);
    };
  }, [load]);

  if (!profile) return null;
  const isCoord = profile.role === 'admin' || profile.role === 'coordinator';

  const showTempMessage = (msg: string) => {
    setFeedbackBanner(msg);
    setTimeout(() => setFeedbackBanner(null), 3500);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-28 bg-white rounded-md animate-pulse shadow-card" />
        <div className="h-48 bg-white rounded-md animate-pulse shadow-card" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="p-6 text-center">
        <h1 className="text-lg font-bold text-charcoal">Parte no encontrado</h1>
        <Link href="/tasks" className="text-sm font-bold text-magenta mt-2 inline-block">
          ← Volver a tareas
        </Link>
      </div>
    );
  }

  const fullAddress = [
    task.site_address || task.customer?.address,
    task.site_city || task.customer?.city,
  ]
    .filter(Boolean)
    .join(', ');
  const phone = task.site_contact_phone || task.customer?.contact_phone;
  const mapsUrl = fullAddress
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`
    : null;

  const handleStatusChange = async (newStatus: TaskStatus) => {
    setShowStatusSheet(false);
    const res = await updateTaskStatus(task.id, newStatus, profile);
    if (res.offlineQueued) {
      showTempMessage('Sin conexión: cambio guardado en cola offline para sincronizar.');
    } else {
      showTempMessage(`Estado actualizado a "${TASK_STATUS_META[newStatus].label}".`);
      await load();
    }
  };

  const handleSelfAssign = async () => {
    await updateTaskFields(
      task.id,
      { assigned_to: profile.id, status: 'assigned' },
      profile
    );
    showTempMessage('Parte asignado a tu lista.');
    await load();
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteInput.trim()) return;
    setSavingNote(true);
    try {
      const res = await addTaskNote(task.id, noteInput, profile);
      setNoteInput('');
      if (res.offlineQueued) {
        showTempMessage('Sin conexión: nota encolada en IndexedDB.');
      } else {
        showTempMessage('Nota técnica registrada en historial.');
        await load();
      }
    } finally {
      setSavingNote(false);
    }
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matName.trim()) return;
    const item: MaterialItem = {
      id: `mat-${Date.now()}`,
      name: matName.trim(),
      ref: matRef.trim() || undefined,
      qty: Math.max(1, parseInt(matQty, 10) || 1),
    };
    const nextList = [...(task.materials_used || []), item];
    await updateTaskFields(task.id, { materials_used: nextList }, profile);
    setMatName('');
    setMatRef('');
    setMatQty('1');
    await load();
  };

  const handleRemoveMaterial = async (matId: string) => {
    const nextList = (task.materials_used || []).filter((m) => m.id !== matId);
    await updateTaskFields(task.id, { materials_used: nextList }, profile);
    await load();
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      await uploadTaskAttachment(task.id, file, undefined, profile);
      showTempMessage('Fotografía adjuntada al parte.');
      await load();
    } finally {
      setUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSaveSignature = async (dataUrl: string, signerName: string) => {
    await updateTaskFields(
      task.id,
      { client_signature_url: dataUrl, signer_name: signerName },
      profile
    );
    showTempMessage('Firma del cliente guardada correctamente.');
    await load();
  };

  const handleCloseTask = async () => {
    await updateTaskStatus(task.id, 'completed', profile);
    showTempMessage('Parte cerrado como Completada.');
    await load();
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      {feedbackBanner && (
        <div className="p-3 bg-navy text-white text-xs font-bold border-l-4 border-magenta shadow-card">
          {feedbackBanner}
        </div>
      )}

      {/* Cabecera */}
      <div className="bg-white rounded-md shadow-card p-5 border border-border/60">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <Link
              href="/tasks"
              className="p-2 bg-off-white border border-border text-navy hover:bg-navy/5"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <span className="text-xs font-extrabold tracking-widest text-navy uppercase">
                {task.code}
              </span>
              <h1 className="text-lg sm:text-xl font-bold text-charcoal leading-tight">
                {task.customer?.name || 'Cliente'}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
          </div>
        </div>

        {/* Acciones directas de campo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3 border-t border-border">
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-2.5 px-3 bg-off-white border border-border text-xs font-bold text-navy hover:bg-navy/5 min-h-[44px]"
            >
              <MapPin size={16} className="text-magenta" />
              <span className="truncate">{fullAddress}</span>
            </a>
          )}
          {phone && (
            <a
              href={`tel:${phone.replace(/\s+/g, '')}`}
              className="flex items-center justify-center gap-2 py-2.5 px-3 bg-off-white border border-border text-xs font-bold text-navy hover:bg-navy/5 min-h-[44px]"
            >
              <Phone size={16} className="text-petrol" />
              <span>{phone}</span>
            </a>
          )}
          <button
            type="button"
            onClick={() => setShowStatusSheet(true)}
            className="flex items-center justify-center gap-2 py-2.5 px-3 bg-navy text-white text-xs font-bold uppercase tracking-wider hover:bg-navy-dark min-h-[44px]"
          >
            <Clock size={16} /> Cambiar Estado
          </button>
        </div>

        {/* Auto-asignarse si está pendiente sin técnico */}
        {!task.assigned_to && profile.role === 'technician' && (
          <div className="mt-3 pt-3 border-t border-border">
            <Button variant="accent" size="sm" className="w-full" onClick={handleSelfAssign}>
              <UserCheck size={16} /> Asignarme este parte
            </Button>
          </div>
        )}

        {/* Controles de coordinación (reasignar / prioridad) */}
        {isCoord && (
          <div className="mt-4 pt-3 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase text-mid-grey mb-1">
                Técnico asignado
              </label>
              <select
                value={task.assigned_to || ''}
                onChange={async (e) => {
                  await updateTaskFields(
                    task.id,
                    { assigned_to: e.target.value || null },
                    profile
                  );
                  showTempMessage('Técnico actualizado y notificado.');
                  await load();
                }}
                className="w-full px-3 py-2 bg-bg-input border border-border text-sm"
              >
                <option value="">Sin asignar</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase text-mid-grey mb-1">
                Prioridad
              </label>
              <select
                value={task.priority}
                onChange={async (e) => {
                  await updateTaskFields(
                    task.id,
                    { priority: e.target.value as TaskPriority },
                    profile
                  );
                  showTempMessage('Prioridad actualizada.');
                  await load();
                }}
                className="w-full px-3 py-2 bg-bg-input border border-border text-sm"
              >
                {Object.entries(TASK_PRIORITY_META).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Equipo y Descripción */}
      <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-3">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2">
          <Wrench size={16} className="text-magenta" /> Equipo y Avería
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-xs font-bold text-mid-grey block">Equipo / Modelo</span>
            <span className="font-semibold text-charcoal">
              {task.equipment_ref || 'No especificado'}
            </span>
          </div>
          <div>
            <span className="text-xs font-bold text-mid-grey block">Nº de Serie</span>
            <span className="font-semibold text-charcoal">
              {task.equipment_sn || '—'}
            </span>
          </div>
        </div>
        <div className="p-3 bg-off-white border-l-4 border-petrol text-sm text-dark-grey leading-relaxed">
          {task.problem_desc}
        </div>
      </div>

      {/* Notas Técnicas */}
      <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-3">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wider">
          Notas Técnicas / Incidencias
        </h2>
        {task.resolution_notes && (
          <div className="p-3 bg-navy/5 text-sm text-charcoal border-l-4 border-navy">
            <span className="text-[11px] font-bold uppercase text-navy block mb-1">
              Última nota registrada:
            </span>
            {task.resolution_notes}
          </div>
        )}
        <form onSubmit={handleAddNote} className="space-y-2">
          <textarea
            rows={3}
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder="Añade diagnóstico, actuaciones realizadas o incidencias..."
            className="w-full px-3 py-2.5 bg-bg-input border border-border focus:outline-none focus:ring-2 focus:ring-navy"
          />
          <Button type="submit" size="sm" isLoading={savingNote} disabled={!noteInput.trim()}>
            <Send size={14} /> Guardar nota en historial
          </Button>
        </form>
      </div>

      {/* Materiales y Piezas (Decisión 4: campo libre) */}
      <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-3">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2">
          <PackagePlus size={16} className="text-magenta" /> Materiales / Piezas Empleadas
        </h2>

        {task.materials_used && task.materials_used.length > 0 && (
          <div className="divide-y divide-border border border-border rounded-sm">
            {task.materials_used.map((m) => (
              <div key={m.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
                <div>
                  <span className="font-bold text-charcoal">{m.name}</span>
                  {m.ref && <span className="text-xs text-mid-grey ml-2">Ref: {m.ref}</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold bg-off-white px-2 py-1 border border-border">
                    x{m.qty}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemoveMaterial(m.id)}
                    className="p-1 text-mid-grey hover:text-danger"
                    aria-label="Eliminar material"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleAddMaterial} className="grid grid-cols-1 sm:grid-cols-6 gap-2">
          <input
            type="text"
            value={matName}
            onChange={(e) => setMatName(e.target.value)}
            placeholder="Pieza o material *"
            className="sm:col-span-3 px-3 py-2 bg-bg-input border border-border"
          />
          <input
            type="text"
            value={matRef}
            onChange={(e) => setMatRef(e.target.value)}
            placeholder="Ref. (opc.)"
            className="sm:col-span-2 px-3 py-2 bg-bg-input border border-border"
          />
          <div className="flex gap-2 sm:col-span-1">
            <input
              type="number"
              min={1}
              value={matQty}
              onChange={(e) => setMatQty(e.target.value)}
              className="w-16 px-2 py-2 bg-bg-input border border-border text-center"
            />
            <button
              type="submit"
              disabled={!matName.trim()}
              className="flex-1 bg-navy text-white px-3 py-2 flex items-center justify-center disabled:opacity-40"
              aria-label="Añadir material"
            >
              <Plus size={18} />
            </button>
          </div>
        </form>
      </div>

      {/* Fotografías */}
      <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2">
            <Camera size={16} className="text-magenta" /> Fotografías ({attachments.length})
          </h2>

          <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-navy text-white text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-navy-dark min-h-[40px]">
            <Camera size={15} /> {uploadingPhoto ? 'Subiendo...' : 'Añadir Foto'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoUpload}
              className="hidden"
              disabled={uploadingPhoto}
            />
          </label>
        </div>

        {attachments.length === 0 ? (
          <p className="text-xs text-mid-grey">
            Aún no hay fotografías adjuntas. Usa la cámara o galería del móvil.
          </p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {attachments.map((att) => (
              <button
                key={att.id}
                type="button"
                onClick={() => setLightboxUrl(att.public_url)}
                className="aspect-square rounded-sm overflow-hidden border border-border bg-off-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={att.public_url}
                  alt={att.file_name}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cierre: Firma Digital + PDF */}
      <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-4">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2">
          <PenTool size={16} className="text-magenta" /> Conformidad, Cierre y Parte PDF
        </h2>

        {task.client_signature_url && (
          <div className="p-3 bg-off-white border border-border inline-block">
            <p className="text-xs font-bold text-dark-grey mb-1">
              Firmado por: {task.signer_name || 'Cliente'}
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={task.client_signature_url}
              alt="Firma cliente"
              className="h-24 bg-white border border-border p-1"
            />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setShowSignatureModal(true)}
          >
            <PenTool size={16} />{' '}
            {task.client_signature_url ? 'Actualizar Firma' : 'Firma Cliente'}
          </Button>

          <Button
            type="button"
            variant="primary"
            onClick={() => downloadTaskPDF(task, history)}
          >
            <FileDown size={16} /> Descargar PDF
          </Button>

          {task.status !== 'completed' && (
            <Button type="button" variant="accent" onClick={handleCloseTask}>
              <CheckCircle2 size={16} /> Cerrar Parte
            </Button>
          )}
        </div>
      </div>

      {/* Audit Trail — Historial Cronológico Inmutable */}
      <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-4">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2">
          <History size={16} className="text-magenta" /> Historial Cronológico Inmutable (
          {history.length})
        </h2>

        <div className="relative pl-5 border-l-2 border-navy/20 space-y-4">
          {history.map((item) => (
            <div key={item.id} className="relative">
              <span className="absolute -left-[25px] top-1 w-3 h-3 rounded-full bg-navy border-2 border-white" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-bold text-charcoal">
                  {item.actor?.full_name || 'Sistema'}
                </span>
                <span className="text-[11px] font-medium text-mid-grey">
                  {new Date(item.created_at).toLocaleString('es-ES', {
                    dateStyle: 'short',
                    timeStyle: 'medium',
                  })}
                </span>
              </div>
              <p className="text-xs text-dark-grey mt-0.5 leading-relaxed">
                {item.note ? (
                  item.note
                ) : item.event_type === 'status_changed' ? (
                  <>
                    Estado:{' '}
                    <strong>
                      {TASK_STATUS_META[item.old_value as TaskStatus]?.label || item.old_value}
                    </strong>{' '}
                    →{' '}
                    <strong className="text-navy">
                      {TASK_STATUS_META[item.new_value as TaskStatus]?.label || item.new_value}
                    </strong>
                  </>
                ) : (
                  `${item.event_type}: ${item.old_value ? `${item.old_value} → ` : ''}${
                    item.new_value || ''
                  }`
                )}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom sheet cambio de estado */}
      {showStatusSheet && (
        <div
          className="fixed inset-0 z-50 bg-charcoal/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowStatusSheet(false)}
        >
          <div
            className="bg-white w-full sm:max-w-md rounded-t-lg sm:rounded-lg p-5 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="text-base font-bold text-charcoal">Actualizar Estado del Parte</h3>
              <button onClick={() => setShowStatusSheet(false)} className="p-1 text-mid-grey">
                <X size={20} />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {(Object.keys(TASK_STATUS_META) as TaskStatus[]).map((st) => {
                const meta = TASK_STATUS_META[st];
                const isCurrent = task.status === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleStatusChange(st)}
                    className={`flex items-center justify-between px-4 py-3 border text-sm font-bold min-h-[48px] ${
                      isCurrent
                        ? 'border-navy bg-navy/5 text-navy'
                        : 'border-border bg-white text-charcoal hover:bg-off-white'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: meta.color }}
                      />
                      {meta.label}
                    </span>
                    {isCurrent && <span className="text-xs text-magenta">Actual</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox foto */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-charcoal/90 flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 text-white p-2"
            onClick={() => setLightboxUrl(null)}
          >
            <X size={28} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Vista ampliada"
            className="max-w-full max-h-[85dvh] object-contain"
          />
        </div>
      )}

      <SignaturePadModal
        isOpen={showSignatureModal}
        initialSignerName={task.signer_name || task.site_contact_name || ''}
        onClose={() => setShowSignatureModal(false)}
        onSave={handleSaveSignature}
      />
    </div>
  );
}
