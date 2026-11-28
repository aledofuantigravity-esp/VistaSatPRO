'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Pencil,
  RotateCcw,
  Wrench,
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
import { PdfExportModal } from '@/components/tasks/PdfExportModal';
import { TaskClosureSection } from '@/components/tasks/TaskClosureSection';
import { TaskCommentsSection } from '@/components/tasks/TaskCommentsSection';
import { TaskDeleteModal } from '@/components/tasks/TaskDeleteModal';
import { TaskEditModal } from '@/components/tasks/TaskEditModal';
import { TaskGallerySection } from '@/components/tasks/TaskGallerySection';
import { TaskHeaderSection } from '@/components/tasks/TaskHeaderSection';
import { TaskHistorySection } from '@/components/tasks/TaskHistorySection';
import { TaskMaterialsSection } from '@/components/tasks/TaskMaterialsSection';
import { TaskResolutionSection } from '@/components/tasks/TaskResolutionSection';
import { TaskStatusSheet } from '@/components/tasks/TaskStatusSheet';
import { TaskTechnicalNotesSection } from '@/components/tasks/TaskTechnicalNotesSection';
import { Button } from '@/components/ui/Button';
import { SignaturePadModal } from '@/components/ui/SignaturePadModal';
import { useAuth } from '@/hooks/useAuth';
import {
  addTaskNote,
  getTaskDetail,
  listProfiles,
  refreshTaskMediaUrls,
  restoreTask,
  saveTaskSignature,
  softDeleteTask,
  updateTaskFields,
  updateTaskStatus,
  uploadTaskAttachment,
} from '@/lib/data-service';
import { getSlaStatus } from '@/lib/sla';
import type { PdfVariant } from '@/lib/pdf-helpers';
import {
  isResolutionRequiredForClosure,
  validateTaskClosureRequirements,
  type TechnicalNoteEntry,
} from '@/lib/task-notes';
import { useAppCache } from '@/store/app-cache';
import {
  resolveTaskType,
  TASK_STATUS_META,
  type Attachment,
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
  const cachedDetail = useAppCache((s) => s.taskDetails[taskId]);
  const cachedProfiles = useAppCache((s) => s.profiles);

  const [task, setTask] = useState<Task | null>(cachedDetail?.task ?? null);
  const [history, setHistory] = useState<TaskHistoryItem[]>(cachedDetail?.history ?? []);
  const [attachments, setAttachments] = useState<Attachment[]>(
    cachedDetail?.attachments ?? []
  );
  const [comments, setComments] = useState<TaskComment[]>(cachedDetail?.comments ?? []);
  const [technicians, setTechnicians] = useState<Profile[]>(() =>
    cachedProfiles.filter((p) => p.role === 'technician' && p.is_active)
  );
  const [loading, setLoading] = useState(!cachedDetail);

  // Estado de UI e interacciones
  const [pendingOfflineNotes, setPendingOfflineNotes] = useState<TechnicalNoteEntry[]>([]);
  const [resolutionDraft, setResolutionDraft] = useState(
    () => cachedDetail?.task?.resolution || ''
  );
  const [savingResolution, setSavingResolution] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const resolutionDirtyRef = useRef(false);
  const resolutionTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showStatusSheet, setShowStatusSheet] = useState(false);
  const [feedbackBanner, setFeedbackBanner] = useState<string | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [showFinishInstallModal, setShowFinishInstallModal] = useState(false);
  const [finishingInstall, setFinishingInstall] = useState(false);
  const [finishInstallError, setFinishInstallError] = useState<string | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [generatingPdfVariant, setGeneratingPdfVariant] = useState<PdfVariant | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletingTask, setDeletingTask] = useState(false);
  const [restoringTask, setRestoringTask] = useState(false);
  const suppressReloadRef = useRef(false);

  const profileId = profile?.id;
  const profileRole = profile?.role;

  const load = useCallback(
    async (silent = false) => {
      if (!profileId || !profileRole) return;
      await Promise.resolve();
      const hasCached = Boolean(useAppCache.getState().taskDetails[taskId]);
      if (!silent && !hasCached) setLoading(true);
      try {
        const shouldLoadProfs =
          profileRole !== 'technician' && useAppCache.getState().profiles.length === 0;
        const [detail, profs] = await Promise.all([
          getTaskDetail(taskId),
          shouldLoadProfs ? listProfiles() : Promise.resolve(useAppCache.getState().profiles),
        ]);
        setTask(detail.task);
        if (!resolutionDirtyRef.current) {
          setResolutionDraft(detail.task?.resolution || '');
        }
        setHistory(detail.history);
        setAttachments(detail.attachments);
        setComments(detail.comments);
        setTechnicians(profs.filter((p) => p.role === 'technician' && p.is_active));
      } finally {
        setLoading(false);
      }
    },
    [taskId, profileId, profileRole]
  );

  useEffect(() => {
    resolutionDirtyRef.current = false;
    const t = setTimeout(() => void load(), 0);
    const handler = () => {
      if (!suppressReloadRef.current) void load(true);
    };
    const offlineSyncedHandler = () => {
      setPendingOfflineNotes([]);
      if (!suppressReloadRef.current) void load(true);
    };
    const notifHandler = (ev: Event) => {
      if (suppressReloadRef.current) return;
      const detail = (ev as CustomEvent<{ task_id?: string | null }>).detail;
      if (!detail?.task_id || detail.task_id === taskId) {
        void load(true);
      }
    };
    window.addEventListener('vistasat:demo-updated', handler);
    window.addEventListener('vistasat:notification-received', notifHandler);
    window.addEventListener('vistasat:offline-synced', offlineSyncedHandler);
    return () => {
      clearTimeout(t);
      window.removeEventListener('vistasat:demo-updated', handler);
      window.removeEventListener('vistasat:notification-received', notifHandler);
      window.removeEventListener('vistasat:offline-synced', offlineSyncedHandler);
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

  const isDeleted = Boolean(task.deleted_at);
  const sla = getSlaStatus(task);
  const taskType = resolveTaskType(task);
  const orderAttachments = attachments.filter(isInstallationOrderAttachment);
  const physicalWorkOrderAttachments = attachments.filter(isPhysicalWorkOrderAttachment);
  const photoAttachments = attachments.filter(
    (a) => !isInstallationOrderAttachment(a) && !isPhysicalWorkOrderAttachment(a)
  );

  const prepareTaskClosure = async (): Promise<boolean> => {
    const validationMsg = validateTaskClosureRequirements(task, resolutionDraft);
    if (validationMsg) {
      setCloseError(validationMsg);
      if (
        isResolutionRequiredForClosure(taskType) &&
        !resolutionDraft.trim() &&
        !task.resolution?.trim()
      ) {
        setResolutionError(validationMsg);
        resolutionTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        resolutionTextareaRef.current?.focus();
      }
      showTempMessage(validationMsg);
      return false;
    }

    const cleanDraft = resolutionDraft.trim();
    const savedClean = (task.resolution || '').trim();
    if (isResolutionRequiredForClosure(taskType) && cleanDraft && cleanDraft !== savedClean) {
      await updateTaskFields(task.id, { resolution: cleanDraft }, profile);
      resolutionDirtyRef.current = false;
      setResolutionDraft(cleanDraft);
      setTask((prev) =>
        prev
          ? {
              ...prev,
              resolution: cleanDraft,
              resolution_updated_at: new Date().toISOString(),
              resolution_updated_by: profile.id,
              resolution_updater: profile,
            }
          : prev
      );
    }
    setResolutionError(null);
    return true;
  };

  const handleStatusChange = async (newStatus: TaskStatus) => {
    setShowStatusSheet(false);
    setCloseError(null);
    if (
      newStatus === 'completed' &&
      taskType === 'installation' &&
      task.status !== 'completed'
    ) {
      setFinishInstallError(null);
      setShowFinishInstallModal(true);
      return;
    }
    if (newStatus === 'completed') {
      try {
        const ok = await prepareTaskClosure();
        if (!ok) return;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'No se pudo guardar la resolución.';
        setCloseError(msg);
        showTempMessage(msg);
        return;
      }
    }

    const prevStatus = task.status;
    setTask((prev) => (prev ? { ...prev, status: newStatus } : prev));
    try {
      const res = await updateTaskStatus(task.id, newStatus, profile);
      if (res.offlineQueued) {
        showTempMessage('Sin conexión: cambio guardado en cola offline para sincronizar.');
      } else {
        showTempMessage(`Estado actualizado a "${TASK_STATUS_META[newStatus].label}".`);
        await load(true);
      }
    } catch (err) {
      setTask((prev) => (prev ? { ...prev, status: prevStatus } : prev));
      const msg = err instanceof Error ? err.message : 'No se pudo cambiar el estado.';
      setCloseError(msg);
      showTempMessage(msg);
    }
  };

  const handleSelfAssign = async () => {
    setTask((prev) => (prev ? { ...prev, assigned_to: profile.id, assignee: profile } : prev));
    await updateTaskFields(task.id, { assigned_to: profile.id }, profile);
    showTempMessage('Parte asignado a tu lista.');
    await load(true);
  };

  const handleChangeAssignee = async (techId: string | null) => {
    const nextAssignee = techId ? technicians.find((t) => t.id === techId) || null : null;
    setTask((prev) =>
      prev ? { ...prev, assigned_to: techId, assignee: nextAssignee } : prev
    );
    await updateTaskFields(task.id, { assigned_to: techId }, profile);
    showTempMessage('Técnico actualizado y notificado.');
    await load(true);
  };

  const handleChangePriority = async (priority: TaskPriority) => {
    setTask((prev) => (prev ? { ...prev, priority } : prev));
    await updateTaskFields(task.id, { priority }, profile);
    showTempMessage('Prioridad actualizada.');
    await load(true);
  };

  const handleAddTechnicalNote = async (noteText: string) => {
    const res = await addTaskNote(task.id, noteText, profile);
    if (res.offlineQueued) {
      const nowIso = new Date(
        Math.max(
          Date.now(),
          ...pendingOfflineNotes.map((n) => (Date.parse(n.createdAt) || 0) + 1)
        )
      ).toISOString();
      setPendingOfflineNotes((prev) => [
        {
          id: `offline-note-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          text: noteText.trim(),
          authorName: profile.full_name,
          createdAt: nowIso,
          pendingSync: true,
        },
        ...prev,
      ]);
      showTempMessage('Sin conexión: nota técnica guardada en cola offline.');
    } else {
      showTempMessage('Nota técnica registrada.');
      await load(true);
    }
  };

  const handleSaveResolution = async () => {
    const clean = resolutionDraft.trim();
    if (task.status === 'completed' && isResolutionRequiredForClosure(taskType) && !clean) {
      const msg = 'Para cerrar este parte es obligatorio indicar la resolución del problema.';
      setResolutionError(msg);
      showTempMessage(msg);
      return;
    }
    setSavingResolution(true);
    setResolutionError(null);
    try {
      const res = await updateTaskFields(task.id, { resolution: clean || null }, profile);
      resolutionDirtyRef.current = false;
      setResolutionDraft(clean);
      setTask((prev) =>
        prev
          ? {
              ...prev,
              resolution: clean || null,
              resolution_updated_at: new Date().toISOString(),
              resolution_updated_by: profile.id,
              resolution_updater: profile,
            }
          : prev
      );
      if (res.offlineQueued) {
        showTempMessage('Sin conexión: resolución guardada en cola offline.');
      } else {
        showTempMessage('Resolución guardada correctamente.');
        await load(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo guardar la resolución.';
      setResolutionError(msg);
      showTempMessage(msg);
    } finally {
      setSavingResolution(false);
    }
  };

  const handleCloseTask = async () => {
    setCloseError(null);
    if (taskType === 'installation') {
      setFinishInstallError(null);
      setShowFinishInstallModal(true);
      return;
    }
    try {
      const ok = await prepareTaskClosure();
      if (!ok) return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'No se pudo guardar la resolución.';
      setCloseError(msg);
      showTempMessage(msg);
      return;
    }

    const prevStatus = task.status;
    setTask((prev) => (prev ? { ...prev, status: 'completed' } : prev));
    try {
      const res = await updateTaskStatus(task.id, 'completed', profile);
      if (res.offlineQueued) {
        showTempMessage('Sin conexión: cierre guardado en cola offline.');
      } else {
        showTempMessage('Parte cerrado automáticamente en estado Completada.');
        await load(true);
      }
    } catch (err) {
      setTask((prev) => (prev ? { ...prev, status: prevStatus } : prev));
      const msg = err instanceof Error ? err.message : 'No se pudo cerrar la tarea.';
      setCloseError(msg);
      showTempMessage(msg);
    }
  };

  const handleFinishInstallationWithoutPhoto = async () => {
    setFinishingInstall(true);
    setFinishInstallError(null);
    suppressReloadRef.current = true;
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
      suppressReloadRef.current = false;
      await load(true);
    } catch (err) {
      setFinishInstallError(
        err instanceof Error ? err.message : 'No se pudo finalizar la instalación.'
      );
    } finally {
      suppressReloadRef.current = false;
      setFinishingInstall(false);
    }
  };

  const handleFinishInstallationWithPhoto = async (file: File) => {
    setFinishingInstall(true);
    setFinishInstallError(null);
    suppressReloadRef.current = true;
    try {
      await uploadTaskAttachment(task.id, file, 'Parte de trabajo físico', profile, {
        kind: 'physical_work_order',
      });
      await updateTaskFields(task.id, { physical_work_order_attached: true }, profile);
      await updateTaskStatus(task.id, 'completed', profile);
      setShowFinishInstallModal(false);
      showTempMessage('Parte de trabajo físico adjuntado e instalación Completada.');
      suppressReloadRef.current = false;
      await load(true);
    } catch (err) {
      setFinishInstallError(
        err instanceof Error
          ? err.message
          : 'No se pudo adjuntar el parte de trabajo físico y finalizar.'
      );
    } finally {
      suppressReloadRef.current = false;
      setFinishingInstall(false);
    }
  };

  const handleDownloadPdf = async (variant: PdfVariant) => {
    setGeneratingPdfVariant(variant);
    try {
      const [{ task: freshTask, attachments: freshAttachments }, { downloadTaskPDF }] =
        await Promise.all([
          refreshTaskMediaUrls(task, attachments),
          import('@/lib/pdf-generator'),
        ]);
      await downloadTaskPDF(freshTask, history, freshAttachments, variant);
      setShowPdfModal(false);
      showTempMessage(
        variant === 'client'
          ? 'PDF para Cliente generado correctamente.'
          : 'PDF Interno completo generado correctamente.'
      );
    } catch (err) {
      showTempMessage(
        err instanceof Error ? err.message : 'No se pudo generar el documento PDF.'
      );
    } finally {
      setGeneratingPdfVariant(null);
    }
  };

  const handleSaveSignature = async (dataUrl: string, signerName: string) => {
    const res = await saveTaskSignature(task.id, dataUrl, signerName, profile);
    if (res.offlineQueued) {
      setTask((prev) =>
        prev ? { ...prev, client_signature_url: dataUrl, signer_name: signerName } : prev
      );
      showTempMessage('Sin conexión: firma guardada en cola offline.');
    } else {
      showTempMessage('Firma del cliente guardada correctamente.');
      await load(true);
    }
  };

  const handleSoftDelete = async (reason: string) => {
    setDeletingTask(true);
    try {
      await softDeleteTask(task.id, reason, profile);
      setShowDeleteModal(false);
      showTempMessage('Parte enviado a la papelera. Registro guardado en historial.');
      await load(true);
    } catch (err) {
      showTempMessage(err instanceof Error ? err.message : 'No se pudo eliminar el parte.');
    } finally {
      setDeletingTask(false);
    }
  };

  const handleRestoreTask = async () => {
    setRestoringTask(true);
    try {
      await restoreTask(task.id, profile);
      showTempMessage('Parte restaurado y devuelto a la lista activa.');
      await load(true);
    } catch (err) {
      showTempMessage(err instanceof Error ? err.message : 'No se pudo restaurar el parte.');
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

      <TaskHeaderSection
        task={task}
        taskType={taskType}
        sla={sla}
        profile={profile}
        isCoord={isCoord}
        isDeleted={isDeleted}
        technicians={technicians}
        fullAddress={fullAddress}
        phone={phone}
        mapsUrl={mapsUrl}
        onOpenEdit={() => setShowEditModal(true)}
        onOpenDelete={() => setShowDeleteModal(true)}
        onOpenStatusSheet={() => setShowStatusSheet(true)}
        onSelfAssign={handleSelfAssign}
        onChangeAssignee={(id) => void handleChangeAssignee(id)}
        onChangePriority={(prio) => void handleChangePriority(prio)}
      />

      {/* Equipo y Descripción */}
      <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2">
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
              onClick={() => setShowEditModal(true)}
              className="text-xs font-bold text-navy hover:underline inline-flex items-center gap-1"
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

      {taskType === 'installation' && (
        <InstallationWorkflowSection
          task={task}
          orderAttachments={orderAttachments}
          currentUser={profile}
          isDeleted={isDeleted}
          onChanged={() => load(true)}
          onFeedback={showTempMessage}
        />
      )}

      {taskType === 'cxc_incident' && (
        <CxcMetersSection
          task={task}
          currentUser={profile}
          isDeleted={isDeleted}
          onChanged={() => load(true)}
          onFeedback={showTempMessage}
        />
      )}

      <TaskCommentsSection
        taskId={task.id}
        initialComments={comments}
        currentUser={profile}
        isDeleted={isDeleted}
      />

      <TaskTechnicalNotesSection
        task={task}
        taskType={taskType}
        history={history}
        pendingOfflineNotes={pendingOfflineNotes}
        isDeleted={isDeleted}
        onAddNote={handleAddTechnicalNote}
      />

      {isResolutionRequiredForClosure(taskType) && (
        <TaskResolutionSection
          task={task}
          history={history}
          draftValue={resolutionDraft}
          saving={savingResolution}
          error={resolutionError}
          isDeleted={isDeleted}
          textareaRef={resolutionTextareaRef}
          onChangeDraft={(val) => {
            resolutionDirtyRef.current = true;
            setResolutionDraft(val);
            if (resolutionError && val.trim()) setResolutionError(null);
          }}
          onSave={handleSaveResolution}
        />
      )}

      <TaskMaterialsSection
        task={task}
        taskType={taskType}
        currentUser={profile}
        isDeleted={isDeleted}
        onChanged={() => load(true)}
        onFeedback={showTempMessage}
      />

      <TaskGallerySection
        taskId={task.id}
        title={taskType === 'installation' ? 'Fotos de la Instalación' : 'Fotografías'}
        attachments={photoAttachments}
        currentUser={profile}
        isDeleted={isDeleted}
        onChanged={() => load(true)}
        onFeedback={showTempMessage}
      />

      {taskType === 'installation' && (
        <PhysicalWorkOrderSection
          task={task}
          attachments={physicalWorkOrderAttachments}
          currentUser={profile}
          isDeleted={isDeleted}
          onChanged={() => load(true)}
          onFeedback={showTempMessage}
        />
      )}

      <TaskClosureSection
        task={task}
        taskType={taskType}
        isDeleted={isDeleted}
        closeError={closeError}
        generatingPdf={Boolean(generatingPdfVariant)}
        onOpenSignature={() => setShowSignatureModal(true)}
        onDownloadPdf={() => setShowPdfModal(true)}
        onCloseTask={handleCloseTask}
      />

      <TaskHistorySection history={history} />

      {showEditModal && (
        <TaskEditModal
          task={task}
          taskType={taskType}
          profile={profile}
          isCoord={isCoord}
          onClose={() => setShowEditModal(false)}
          onSaved={async (msg) => {
            setShowEditModal(false);
            showTempMessage(msg);
            await load(true);
          }}
        />
      )}

      {showDeleteModal && (
        <TaskDeleteModal
          taskCode={task.code}
          profile={profile}
          deleting={deletingTask}
          onClose={() => setShowDeleteModal(false)}
          onConfirmDelete={handleSoftDelete}
        />
      )}

      {showStatusSheet && (
        <TaskStatusSheet
          currentStatus={task.status}
          onClose={() => setShowStatusSheet(false)}
          onSelectStatus={handleStatusChange}
        />
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

      {showPdfModal && (
        <PdfExportModal
          taskCode={task.code}
          generatingVariant={generatingPdfVariant}
          onClose={() => {
            if (!generatingPdfVariant) setShowPdfModal(false);
          }}
          onSelectVariant={handleDownloadPdf}
        />
      )}
    </div>
  );
}
