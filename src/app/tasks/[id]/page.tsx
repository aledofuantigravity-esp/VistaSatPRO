'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileDown,
  History,
  MapPin,
  PackagePlus,
  Pencil,
  PenTool,
  Phone,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  UserCheck,
  Wrench,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { CxcMetersSection } from '@/components/tasks/CxcMetersSection';
import { FinishInstallationModal } from '@/components/tasks/FinishInstallationModal';
import {
  InstallationWorkflowSection,
  isInstallationOrderAttachment,
} from '@/components/tasks/InstallationWorkflowSection';
import {
  isPhysicalWorkOrderAttachment,
  PhysicalWorkOrderSection,
} from '@/components/tasks/PhysicalWorkOrderSection';
import { TaskCommentsSection } from '@/components/tasks/TaskCommentsSection';
import { TaskGallerySection } from '@/components/tasks/TaskGallerySection';
import { Button } from '@/components/ui/Button';
import { PriorityBadge, StatusBadge, TaskTypeBadge } from '@/components/ui/Badge';
import { SignaturePadModal } from '@/components/ui/SignaturePadModal';
import { useAuth } from '@/hooks/useAuth';
import {
  addTaskNote,
  getTaskDetail,
  listCustomers,
  listProfiles,
  restoreTask,
  saveTaskSignature,
  softDeleteTask,
  updateTaskFields,
  updateTaskStatus,
  uploadTaskAttachment,
} from '@/lib/data-service';
import { downloadTaskPDF } from '@/lib/pdf-generator';
import { getSlaStatus, toDatetimeLocalValue } from '@/lib/sla';
import {
  getTaskStatusLabel,
  resolveTaskType,
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  type Attachment,
  type Customer,
  type MaterialItem,
  type Profile,
  type Task,
  type TaskComment,
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
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [technicians, setTechnicians] = useState<Profile[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  // Acciones interactivas
  const [noteInput, setNoteInput] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [matName, setMatName] = useState('');
  const [matRef, setMatRef] = useState('');
  const [matQty, setMatQty] = useState('1');
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showStatusSheet, setShowStatusSheet] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [showFinishInstallModal, setShowFinishInstallModal] = useState(false);
  const [finishingInstall, setFinishingInstall] = useState(false);
  const [finishInstallError, setFinishInstallError] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Edición universal del parte
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editCustomerId, setEditCustomerId] = useState('');
  const [editPriority, setEditPriority] = useState<TaskPriority>('medium');
  const [editEquipmentRef, setEditEquipmentRef] = useState('');
  const [editEquipmentSn, setEditEquipmentSn] = useState('');
  const [editProblemDesc, setEditProblemDesc] = useState('');
  const [editSiteContactName, setEditSiteContactName] = useState('');
  const [editSiteContactPhone, setEditSiteContactPhone] = useState('');
  const [editSiteAddress, setEditSiteAddress] = useState('');
  const [editSiteCity, setEditSiteCity] = useState('');
  const [editDueDate, setEditDueDate] = useState('');

  // Borrado lógico y restauración
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  const [deletingTask, setDeletingTask] = useState(false);
  const [restoringTask, setRestoringTask] = useState(false);

  const profileId = profile?.id;
  const profileRole = profile?.role;

  const load = useCallback(async () => {
    if (!profileId || !profileRole) return;
    await Promise.resolve();
    setLoading(true);
    try {
      const [detail, profs, custs] = await Promise.all([
        getTaskDetail(taskId),
        profileRole === 'technician' ? Promise.resolve([]) : listProfiles(),
        listCustomers(),
      ]);
      setTask(detail.task);
      setHistory(detail.history);
      setAttachments(detail.attachments);
      setComments(detail.comments);
      setTechnicians(profs.filter((p) => p.role === 'technician' && p.is_active));
      setCustomers(custs.filter((c) => c.is_active));
    } finally {
      setLoading(false);
    }
  }, [taskId, profileId, profileRole]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    const handler = () => void load();
    const notifHandler = (ev: Event) => {
      const detail = (ev as CustomEvent<{ task_id?: string | null }>).detail;
      if (!detail?.task_id || detail.task_id === taskId) {
        void load();
      }
    };
    window.addEventListener('vistasat:demo-updated', handler);
    window.addEventListener('vistasat:notification-received', notifHandler);
    return () => {
      clearTimeout(t);
      window.removeEventListener('vistasat:demo-updated', handler);
      window.removeEventListener('vistasat:notification-received', notifHandler);
    };
  }, [load, taskId]);

  if (!profile) return null;
  const isCoord = profile.role === 'admin' || profile.role === 'coordinator';

  const showTempMessage = (msg: string) => {
    setFeedbackBanner(msg);
    setTimeout(() => setFeedbackBanner(null), 3500);
  };

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-28 bg-white dark:bg-surface rounded-md animate-pulse shadow-card" />
        <div className="h-48 bg-white dark:bg-surface rounded-md animate-pulse shadow-card" />
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
    setCloseError(null);
    if (
      newStatus === 'completed' &&
      resolveTaskType(task) === 'installation' &&
      task.status !== 'completed'
    ) {
      setFinishInstallError(null);
      setShowFinishInstallModal(true);
      return;
    }
    if (
      newStatus === 'completed' &&
      resolveTaskType(task) === 'cxc_incident' &&
      !task.equipment_sn?.trim()
    ) {
      const msg =
        'Para cerrar una Incidencia CXC es obligatorio introducir y guardar primero el Nº de Serie.';
      setCloseError(msg);
      showTempMessage(msg);
      return;
    }
    try {
      const res = await updateTaskStatus(task.id, newStatus, profile);
      if (res.offlineQueued) {
        showTempMessage('Sin conexión: cambio guardado en cola offline para sincronizar.');
      } else {
        showTempMessage(`Estado actualizado a "${TASK_STATUS_META[newStatus].label}".`);
        await load();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo cambiar el estado.';
      setCloseError(msg);
      showTempMessage(msg);
    }
  };

  const handleSelfAssign = async () => {
    await updateTaskFields(
      task.id,
      { assigned_to: profile.id },
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

  const handleCloseTask = async () => {
    setCloseError(null);
    if (resolveTaskType(task) === 'installation') {
      setFinishInstallError(null);
      setShowFinishInstallModal(true);
      return;
    }
    if (resolveTaskType(task) === 'cxc_incident' && !task.equipment_sn?.trim()) {
      const msg =
        'Para cerrar una Incidencia CXC es obligatorio introducir y guardar primero el Nº de Serie.';
      setCloseError(msg);
      showTempMessage(msg);
      return;
    }
    try {
      await updateTaskStatus(task.id, 'completed', profile);
      showTempMessage('Parte cerrado automáticamente en estado Completada.');
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo cerrar la tarea.';
      setCloseError(msg);
      showTempMessage(msg);
    }
  };

  const handleFinishInstallationWithoutPhoto = async () => {
    setFinishingInstall(true);
    setFinishInstallError(null);
    try {
      const hasExistingPhysical = attachments.some(isPhysicalWorkOrderAttachment);
      await updateTaskFields(
        task.id,
        { physical_work_order_attached: hasExistingPhysical },
        profile
      );
      await updateTaskStatus(task.id, 'completed', profile);
      setShowFinishInstallModal(false);
      showTempMessage(
        hasExistingPhysical
          ? 'Instalación finalizada y marcada como Completada.'
          : 'Instalación cerrada como Completada sin parte de trabajo físico adjunto.'
      );
      await load();
    } catch (err) {
      setFinishInstallError(
        err instanceof Error ? err.message : 'No se pudo finalizar la instalación.'
      );
    } finally {
      setFinishingInstall(false);
    }
  };

  const handleFinishInstallationWithPhoto = async (file: File) => {
    setFinishingInstall(true);
    setFinishInstallError(null);
    try {
      await uploadTaskAttachment(
        task.id,
        file,
        'Parte de trabajo físico',
        profile,
        { kind: 'physical_work_order' }
      );
      await updateTaskFields(task.id, { physical_work_order_attached: true }, profile);
      await updateTaskStatus(task.id, 'completed', profile);
      setShowFinishInstallModal(false);
      showTempMessage('Parte de trabajo físico adjuntado e instalación Completada.');
      await load();
    } catch (err) {
      setFinishInstallError(
        err instanceof Error
          ? err.message
          : 'No se pudo adjuntar el parte de trabajo físico y finalizar.'
      );
    } finally {
      setFinishingInstall(false);
    }
  };

  const handleDownloadPdf = async () => {
    setGeneratingPdf(true);
    try {
      await downloadTaskPDF(task, history, attachments);
    } catch (err) {
      showTempMessage(
        err instanceof Error ? err.message : 'No se pudo generar el documento PDF.'
      );
    } finally {
      setGeneratingPdf(false);
    }
  };

  const isDeleted = Boolean(task.deleted_at);
  const sla = getSlaStatus(task);
  const taskType = resolveTaskType(task);
  const orderAttachments = attachments.filter(isInstallationOrderAttachment);
  const physicalWorkOrderAttachments = attachments.filter(isPhysicalWorkOrderAttachment);
  const photoAttachments = attachments.filter(
    (a) => !isInstallationOrderAttachment(a) && !isPhysicalWorkOrderAttachment(a)
  );

  const openEditModal = () => {
    setEditError(null);
    setEditCustomerId(task.customer_id);
    setEditPriority(task.priority);
    setEditEquipmentRef(task.equipment_ref || '');
    setEditEquipmentSn(task.equipment_sn || '');
    setEditProblemDesc(task.problem_desc);
    setEditSiteContactName(task.site_contact_name || '');
    setEditSiteContactPhone(task.site_contact_phone || '');
    setEditSiteAddress(task.site_address || '');
    setEditSiteCity(task.site_city || '');
    setEditDueDate(toDatetimeLocalValue(task.due_date));
    setShowEditModal(true);
  };

  const handleSaveSignature = async (dataUrl: string, signerName: string) => {
    await saveTaskSignature(task.id, dataUrl, signerName, profile);
    showTempMessage('Firma del cliente guardada correctamente.');
    await load();
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCustomerId || !editProblemDesc.trim()) {
      setEditError('El cliente y la descripción son obligatorios.');
      return;
    }
    if (taskType === 'cxc_incident' && task.status === 'completed' && !editEquipmentSn.trim()) {
      setEditError('El nº de serie es obligatorio cuando la Incidencia CXC está cerrada.');
      return;
    }

    const patch: Parameters<typeof updateTaskFields>[1] = {};
    if (editCustomerId !== task.customer_id) patch.customer_id = editCustomerId;
    if (editPriority !== task.priority) patch.priority = editPriority;
    if (editEquipmentRef.trim() !== (task.equipment_ref || '')) {
      patch.equipment_ref = editEquipmentRef.trim() || null;
    }
    if (editEquipmentSn.trim() !== (task.equipment_sn || '')) {
      patch.equipment_sn = editEquipmentSn.trim() || null;
    }
    if (editProblemDesc.trim() !== task.problem_desc) {
      patch.problem_desc = editProblemDesc.trim();
    }
    if (editSiteContactName.trim() !== (task.site_contact_name || '')) {
      patch.site_contact_name = editSiteContactName.trim() || null;
    }
    if (editSiteContactPhone.trim() !== (task.site_contact_phone || '')) {
      patch.site_contact_phone = editSiteContactPhone.trim() || null;
    }
    if (editSiteAddress.trim() !== (task.site_address || '')) {
      patch.site_address = editSiteAddress.trim() || null;
    }
    if (editSiteCity.trim() !== (task.site_city || '')) {
      patch.site_city = editSiteCity.trim() || null;
    }
    if (isCoord) {
      const nextDueIso = editDueDate.trim() ? new Date(editDueDate).toISOString() : null;
      const prevDueIso = task.due_date ? new Date(task.due_date).toISOString() : null;
      if (nextDueIso !== prevDueIso) {
        patch.due_date = nextDueIso;
      }
    }

    if (Object.keys(patch).length === 0) {
      setShowEditModal(false);
      return;
    }

    setSavingEdit(true);
    setEditError(null);
    try {
      await updateTaskFields(task.id, patch, profile);
      setShowEditModal(false);
      showTempMessage('Datos del parte actualizados y auditados en el historial.');
      await load();
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'No se pudieron guardar los cambios.'
      );
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSoftDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeletingTask(true);
    try {
      await softDeleteTask(task.id, deleteReason, profile);
      setShowDeleteModal(false);
      setDeleteReason('');
      showTempMessage('Parte enviado a la papelera. Registro guardado en historial.');
      await load();
    } catch (err) {
      showTempMessage(
        err instanceof Error ? err.message : 'No se pudo eliminar el parte.'
      );
    } finally {
      setDeletingTask(false);
    }
  };

  const handleRestoreTask = async () => {
    setRestoringTask(true);
    try {
      await restoreTask(task.id, profile);
      showTempMessage('Parte restaurado y devuelto a la lista activa.');
      await load();
    } catch (err) {
      showTempMessage(
        err instanceof Error ? err.message : 'No se pudo restaurar el parte.'
      );
    } finally {
      setRestoringTask(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      {feedbackBanner && (
        <div className="p-3 bg-navy text-white text-xs font-bold border-l-4 border-magenta shadow-card">
          {feedbackBanner}
        </div>
      )}

      {/* Banner de Papelera si el parte está eliminado */}
      {isDeleted && (
        <div className="p-4 bg-danger/10 border-l-4 border-danger rounded-md shadow-card flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-danger flex-shrink-0 mt-0.5" />
            <div className="space-y-1 text-xs">
              <p className="font-extrabold uppercase tracking-wider text-danger">
                Parte eliminado (en la papelera)
              </p>
              <p className="text-charcoal font-medium">
                Borrado por <strong>{task.deleter?.full_name || 'Usuario'}</strong> el{' '}
                {task.deleted_at
                  ? new Date(task.deleted_at).toLocaleString('es-ES', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })
                  : '—'}
              </p>
              {task.deletion_reason && (
                <p className="text-dark-grey italic">
                  Motivo: &ldquo;{task.deletion_reason}&rdquo;
                </p>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            isLoading={restoringTask}
            onClick={handleRestoreTask}
          >
            <RotateCcw size={15} /> Restaurar parte
          </Button>
        </div>
      )}

      {/* Cabecera */}
      <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 border border-border/60">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <Link
              href="/tasks"
              className="p-2 bg-off-white border border-border text-navy dark:text-sky-300 hover:bg-navy/5"
            >
              <ArrowLeft size={18} />
            </Link>
            <div>
              <span className="text-xs font-extrabold tracking-widest text-navy dark:text-sky-300 uppercase">
                {task.code}
              </span>
              <h1 className="text-lg sm:text-xl font-bold text-charcoal leading-tight">
                {task.customer?.name || 'Cliente'}
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <TaskTypeBadge taskType={taskType} />
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            {sla && (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-bold uppercase tracking-wide ${sla.badgeClass}`}
              >
                <Clock size={12} /> {sla.label}
              </span>
            )}
            {!isDeleted && (
              <>
                <button
                  type="button"
                  onClick={openEditModal}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold border border-navy dark:border-slate-400 text-navy dark:text-slate-100 hover:bg-navy/5 min-h-[34px]"
                >
                  <Pencil size={13} /> Editar
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold border border-danger text-danger hover:bg-danger/5 min-h-[34px]"
                >
                  <Trash2 size={13} /> Eliminar
                </button>
              </>
            )}
          </div>
        </div>

        {/* Acciones directas de campo */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3 border-t border-border">
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 py-2.5 px-3 bg-off-white border border-border text-xs font-bold text-navy dark:text-sky-300 hover:bg-navy/5 dark:hover:bg-white/10 min-h-[44px]"
            >
              <MapPin size={16} className="text-magenta" />
              <span className="truncate">{fullAddress}</span>
            </a>
          )}
          {phone && (
            <a
              href={`tel:${phone.replace(/\s+/g, '')}`}
              className="flex items-center justify-center gap-2 py-2.5 px-3 bg-off-white border border-border text-xs font-bold text-navy dark:text-sky-300 hover:bg-navy/5 dark:hover:bg-white/10 min-h-[44px]"
            >
              <Phone size={16} className="text-petrol" />
              <span>{phone}</span>
            </a>
          )}
          {!isDeleted && (
            <button
              type="button"
              onClick={() => setShowStatusSheet(true)}
              className="flex items-center justify-center gap-2 py-2.5 px-3 bg-navy text-white text-xs font-bold uppercase tracking-wider hover:bg-navy-dark min-h-[44px]"
            >
              <Clock size={16} /> Cambiar Estado
            </button>
          )}
        </div>

        {/* Auto-asignarse si está pendiente sin técnico */}
        {!isDeleted && !task.assigned_to && profile.role === 'technician' && (
          <div className="mt-3 pt-3 border-t border-border">
            <Button variant="accent" size="sm" className="w-full" onClick={handleSelfAssign}>
              <UserCheck size={16} /> Asignarme este parte
            </Button>
          </div>
        )}

        {/* Controles de coordinación (reasignar / prioridad) */}
        {!isDeleted && isCoord && (
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
      <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 border border-border/60 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-navy dark:text-sky-300 uppercase tracking-wider flex items-center gap-2">
            <Wrench size={16} className="text-magenta" />{' '}
            {taskType === 'installation'
              ? 'Solicitud de Instalación y Equipo'
              : taskType === 'cxc_incident'
              ? 'Equipo e Incidencia CXC'
              : taskType === 'task'
              ? 'Descripción de la Tarea'
              : 'Equipo y Avería'}
          </h2>
          {!isDeleted && (
            <button
              type="button"
              onClick={openEditModal}
              className="text-xs font-bold text-navy dark:text-sky-300 hover:underline inline-flex items-center gap-1"
            >
              <Pencil size={12} /> Modificar datos
            </button>
          )}
        </div>
        {taskType !== 'task' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-xs font-bold text-mid-grey block">Equipo / Modelo</span>
              <span className="font-semibold text-charcoal">
                {task.equipment_ref || 'No especificado'}
              </span>
            </div>
            <div>
              <span className="text-xs font-bold text-mid-grey block">
                Nº de Serie {taskType === 'cxc_incident' ? '(Obligatorio)' : ''}
              </span>
              <span className="font-semibold text-charcoal">
                {task.equipment_sn || '—'}
              </span>
            </div>
          </div>
        )}
        <div className="p-3 bg-off-white border-l-4 border-petrol text-sm text-dark-grey leading-relaxed">
          {task.problem_desc}
        </div>
      </div>

      {/* Flujo específico: INSTALACIÓN (Pedido adjunto, Fecha acordada, Cotejo de mercancía) */}
      {taskType === 'installation' && (
        <InstallationWorkflowSection
          task={task}
          orderAttachments={orderAttachments}
          currentUser={profile}
          isDeleted={isDeleted}
          onChanged={load}
          onFeedback={showTempMessage}
        />
      )}

      {/* Flujo específico: INCIDENCIA CXC (Contadores B/N y Color) */}
      {taskType === 'cxc_incident' && (
        <CxcMetersSection
          task={task}
          currentUser={profile}
          isDeleted={isDeleted}
          onChanged={load}
          onFeedback={showTempMessage}
        />
      )}

      {/* Chat Interno en Tiempo Real (M4) */}
      <TaskCommentsSection
        taskId={task.id}
        initialComments={comments}
        currentUser={profile}
        isDeleted={isDeleted}
      />

      {/* Notas Técnicas / Incidencias / Avance de tarea */}
      <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 border border-border/60 space-y-3">
        <h2 className="text-sm font-bold text-navy dark:text-sky-300 uppercase tracking-wider">
          {taskType === 'installation'
            ? 'Finalización de Instalación · Incidencias y Observaciones'
            : taskType === 'task'
            ? 'Informe de Avance de la Tarea'
            : 'Notas Técnicas / Incidencias'}
        </h2>
        {task.resolution_notes && (
          <div className="p-3 bg-navy/5 text-sm text-charcoal border-l-4 border-navy">
            <span className="text-[11px] font-bold uppercase text-navy dark:text-sky-300 block mb-1">
              Última nota registrada:
            </span>
            {task.resolution_notes}
          </div>
        )}
        {!isDeleted && (
          <form onSubmit={handleAddNote} className="space-y-2">
            <textarea
              rows={3}
              value={noteInput}
              onChange={(e) => setNoteInput(e.target.value)}
              placeholder={
                taskType === 'installation'
                  ? 'Anota incidencias durante la instalación o comentarios finales...'
                  : taskType === 'task'
                  ? 'Informa del progreso de la tarea...'
                  : 'Añade diagnóstico, actuaciones realizadas o incidencias...'
              }
              className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal focus:outline-none focus:ring-2 focus:ring-navy"
            />
            <Button type="submit" size="sm" isLoading={savingNote} disabled={!noteInput.trim()}>
              <Send size={14} /> Guardar nota en historial
            </Button>
          </form>
        )}
      </div>

      {/* Materiales y Piezas (solo en Incidencia RMA e Incidencia CXC; oculto en Instalación y Tarea) */}
      {taskType !== 'task' && taskType !== 'installation' && (
        <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 border border-border/60 space-y-3">
          <h2 className="text-sm font-bold text-navy dark:text-sky-300 uppercase tracking-wider flex items-center gap-2">
            <PackagePlus size={16} className="text-magenta" />{' '}
            {taskType === 'cxc_incident'
              ? 'Piezas a Utilizar / Repuestos CXC'
              : 'Materiales / Piezas Empleadas'}
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
                  {!isDeleted && (
                    <button
                      type="button"
                      onClick={() => handleRemoveMaterial(m.id)}
                      className="p-1 text-mid-grey hover:text-danger"
                      aria-label="Eliminar material"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {!isDeleted && (
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
        )}
        </div>
      )}

      {/* Galería de Fotografías Mejorada (M7) */}
      <TaskGallerySection
        taskId={task.id}
        title={taskType === 'installation' ? 'Fotos de la Instalación' : 'Fotografías'}
        attachments={photoAttachments}
        currentUser={profile}
        isDeleted={isDeleted}
        onChanged={load}
        onFeedback={showTempMessage}
      />

      {/* Parte de Trabajo Físico (específico de Instalaciones) */}
      {taskType === 'installation' && (
        <PhysicalWorkOrderSection
          task={task}
          attachments={physicalWorkOrderAttachments}
          currentUser={profile}
          isDeleted={isDeleted}
          onChanged={load}
          onFeedback={showTempMessage}
        />
      )}

      {/* Cierre: Firma Digital + PDF */}
      <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 border border-border/60 space-y-4">
        <h2 className="text-sm font-bold text-navy dark:text-sky-300 uppercase tracking-wider flex items-center gap-2">
          <PenTool size={16} className="text-magenta" />{' '}
          {taskType === 'installation'
            ? 'Finalización de Instalación · Parte de Instalación PDF y Firma'
            : taskType === 'cxc_incident'
            ? 'Cierre de Incidencia CXC y Parte PDF'
            : taskType === 'task'
            ? 'Finalización de Tarea y Parte PDF'
            : 'Conformidad, Cierre y Parte PDF'}
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

        {closeError && (
          <div className="p-3 bg-danger/10 border-l-4 border-danger text-xs font-bold text-danger">
            {closeError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {!isDeleted && (
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowSignatureModal(true)}
            >
              <PenTool size={16} />{' '}
              {task.client_signature_url ? 'Actualizar Firma' : 'Firma Cliente'}
            </Button>
          )}

          <Button
            type="button"
            variant="primary"
            isLoading={generatingPdf}
            onClick={handleDownloadPdf}
          >
            <FileDown size={16} />{' '}
            {generatingPdf
              ? 'Generando PDF...'
              : taskType === 'installation'
              ? 'Parte de Instalación (PDF)'
              : 'Descargar PDF'}
          </Button>

          {!isDeleted && task.status !== 'completed' && (
            <Button type="button" variant="accent" onClick={handleCloseTask}>
              <CheckCircle2 size={16} />{' '}
              {taskType === 'installation'
                ? 'Finalizar Instalación'
                : taskType === 'cxc_incident'
                ? 'Cerrar Incidencia'
                : taskType === 'task'
                ? 'Finalizar Tarea'
                : 'Cerrar Parte'}
            </Button>
          )}
        </div>
      </div>

      {/* Audit Trail — Historial Cronológico Inmutable */}
      <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 border border-border/60 space-y-4">
        <h2 className="text-sm font-bold text-navy dark:text-sky-300 uppercase tracking-wider flex items-center gap-2">
          <History size={16} className="text-magenta" /> Historial Cronológico Inmutable (
          {history.length})
        </h2>

        <div className="relative pl-5 border-l-2 border-navy/20 space-y-4">
          {history.map((item) => {
            const isDeletedEv = item.event_type === 'deleted';
            const isRestoredEv = item.event_type === 'restored';
            const isFieldEv = item.event_type === 'field_updated';
            const dotClass = isDeletedEv
              ? 'bg-danger'
              : isRestoredEv
              ? 'bg-emerald-600'
              : isFieldEv
              ? 'bg-amber-500'
              : 'bg-navy';

            return (
              <div key={item.id} className="relative">
                <span
                  className={`absolute -left-[25px] top-1 w-3 h-3 rounded-full ${dotClass} border-2 border-white`}
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-charcoal">
                      {item.actor?.full_name || 'Sistema'}
                    </span>
                    {isDeletedEv && (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-danger/10 text-danger border border-danger/30">
                        Eliminado
                      </span>
                    )}
                    {isRestoredEv && (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-500/40">
                        Restaurado
                      </span>
                    )}
                    {isFieldEv && (
                      <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-500/40">
                        Modificado
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] font-medium text-mid-grey">
                    {new Date(item.created_at).toLocaleString('es-ES', {
                      dateStyle: 'short',
                      timeStyle: 'medium',
                    })}
                  </span>
                </div>
                <p
                  className={`text-xs mt-0.5 leading-relaxed ${
                    isDeletedEv
                      ? 'text-danger font-semibold'
                      : isRestoredEv
                      ? 'text-emerald-800 font-semibold'
                      : 'text-dark-grey'
                  }`}
                >
                  {item.note ? (
                    item.note
                  ) : item.event_type === 'status_changed' ? (
                    <>
                      Estado:{' '}
                      <strong>
                        {getTaskStatusLabel(item.old_value)}
                      </strong>{' '}
                      →{' '}
                      <strong className="text-navy dark:text-sky-300">
                        {getTaskStatusLabel(item.new_value)}
                      </strong>
                    </>
                  ) : item.event_type === 'priority_changed' ? (
                    <>
                      Prioridad:{' '}
                      <strong>
                        {TASK_PRIORITY_META[item.old_value as TaskPriority]?.label ||
                          item.old_value}
                      </strong>{' '}
                      →{' '}
                      <strong className="text-navy dark:text-sky-300">
                        {TASK_PRIORITY_META[item.new_value as TaskPriority]?.label ||
                          item.new_value}
                      </strong>
                    </>
                  ) : (
                    `${item.event_type}: ${item.old_value ? `${item.old_value} → ` : ''}${
                      item.new_value || ''
                    }`
                  )}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal de edición universal del parte */}
      {showEditModal && (
        <div
          className="fixed inset-0 z-50 bg-charcoal/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="bg-white dark:bg-surface w-full sm:max-w-lg rounded-t-lg sm:rounded-lg p-5 space-y-4 max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="text-base font-bold text-charcoal flex items-center gap-2">
                <Pencil size={16} className="text-magenta" /> Modificar Parte {task.code}
              </h3>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="p-1 text-mid-grey"
              >
                <X size={20} />
              </button>
            </div>

            {editError && (
              <div className="p-3 bg-danger/10 border-l-4 border-danger text-xs font-bold text-danger">
                {editError}
              </div>
            )}

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    Cliente *
                  </label>
                  <select
                    value={editCustomerId}
                    onChange={(e) => setEditCustomerId(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-input border border-border text-sm"
                    required
                  >
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    Prioridad
                  </label>
                  <select
                    value={editPriority}
                    onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    Equipo / Modelo
                  </label>
                  <input
                    type="text"
                    value={editEquipmentRef}
                    onChange={(e) => setEditEquipmentRef(e.target.value)}
                    placeholder="Ej. Enfriadora Daikin EWYT-B"
                    className="w-full px-3 py-2 bg-bg-input border border-border text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    Nº de Serie {taskType === 'cxc_incident' ? '(obligatorio al cerrar)' : ''}
                  </label>
                  <input
                    type="text"
                    required={taskType === 'cxc_incident' && task.status === 'completed'}
                    value={editEquipmentSn}
                    onChange={(e) => setEditEquipmentSn(e.target.value)}
                    placeholder="Ej. SN-12345"
                    className="w-full px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                  Descripción de la Avería / Trabajo *
                </label>
                <textarea
                  rows={3}
                  value={editProblemDesc}
                  onChange={(e) => setEditProblemDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-bg-input border border-border text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    Contacto en sitio
                  </label>
                  <input
                    type="text"
                    value={editSiteContactName}
                    onChange={(e) => setEditSiteContactName(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-input border border-border text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    Teléfono contacto
                  </label>
                  <input
                    type="text"
                    value={editSiteContactPhone}
                    onChange={(e) => setEditSiteContactPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-input border border-border text-sm"
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
                    value={editSiteAddress}
                    onChange={(e) => setEditSiteAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-input border border-border text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    Localidad
                  </label>
                  <input
                    type="text"
                    value={editSiteCity}
                    onChange={(e) => setEditSiteCity(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-input border border-border text-sm"
                  />
                </div>
              </div>

              {isCoord && (
                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    Fecha límite SLA
                  </label>
                  <input
                    type="datetime-local"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
                  />
                </div>
              )}

              <p className="text-[11px] text-mid-grey">
                Todos los cambios quedarán registrados con tu nombre y fecha en el historial
                inmutable del parte.
              </p>

              <div className="flex gap-2 justify-end pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="primary" size="sm" isLoading={savingEdit}>
                  Guardar Cambios
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de confirmación de borrado lógico */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 bg-charcoal/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowDeleteModal(false)}
        >
          <div
            className="bg-white dark:bg-surface w-full sm:max-w-md rounded-t-lg sm:rounded-lg p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h3 className="text-base font-bold text-danger flex items-center gap-2">
                <Trash2 size={18} /> Eliminar Parte {task.code}
              </h3>
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="p-1 text-mid-grey"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-3 bg-danger/10 border-l-4 border-danger text-xs text-charcoal space-y-1">
              <p className="font-bold">El parte se enviará a la Papelera</p>
              <p>
                Quedará registro inmutable de que <strong>{profile.full_name}</strong> lo eliminó,
                pero podrás recuperarlo en cualquier momento desde la pestaña Papelera.
              </p>
            </div>

            <form onSubmit={handleSoftDelete} className="space-y-3">
              <div>
                <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                  Motivo de eliminación (opcional)
                </label>
                <input
                  type="text"
                  value={deleteReason}
                  onChange={(e) => setDeleteReason(e.target.value)}
                  placeholder="Ej. Parte duplicado, cancelado por cliente..."
                  className="w-full px-3 py-2 bg-bg-input border border-border text-sm"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {['Parte duplicado', 'Error en datos', 'Cancelado por cliente'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDeleteReason(preset)}
                      className="text-[11px] font-semibold px-2 py-1 bg-off-white border border-border text-dark-grey hover:bg-navy/5"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowDeleteModal(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" variant="danger" size="sm" isLoading={deletingTask}>
                  <Trash2 size={15} /> Enviar a Papelera
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bottom sheet cambio de estado */}
      {showStatusSheet && (
        <div
          className="fixed inset-0 z-50 bg-charcoal/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowStatusSheet(false)}
        >
          <div
            className="bg-white dark:bg-surface w-full sm:max-w-md rounded-t-lg sm:rounded-lg p-5 space-y-3"
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
                    className={`flex items-center justify-between px-4 py-3 border text-sm font-bold min-h-[48px] transition-colors ${
                      isCurrent
                        ? 'border-navy dark:border-sky-400 bg-navy/5 dark:bg-sky-500/15 text-navy dark:text-sky-200'
                        : 'border-border bg-white dark:bg-bg-input text-charcoal hover:bg-off-white dark:hover:bg-white/10'
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

      <SignaturePadModal
        isOpen={showSignatureModal}
        initialSignerName={task.signer_name || task.site_contact_name || ''}
        onClose={() => setShowSignatureModal(false)}
        onSave={handleSaveSignature}
      />

      {showFinishInstallModal && (
        <FinishInstallationModal
          taskCode={task.code}
          submitting={finishingInstall}
          error={finishInstallError}
          onClose={() => {
            if (!finishingInstall) setShowFinishInstallModal(false);
          }}
          onFinishWithoutPhoto={handleFinishInstallationWithoutPhoto}
          onFinishWithPhoto={handleFinishInstallationWithPhoto}
        />
      )}
    </div>
  );
}
