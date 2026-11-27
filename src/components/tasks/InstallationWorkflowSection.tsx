'use client';

import { useState } from 'react';
import {
  Calendar,
  CheckSquare,
  Download,
  Eye,
  FileText,
  FileUp,
  Square,
  Trash2,
  X,
  XSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  deleteTaskAttachment,
  updateTaskFields,
  uploadTaskAttachment,
} from '@/lib/data-service';
import { toDatetimeLocalValue } from '@/lib/sla';
import type { Attachment, Profile, Task } from '@/types/database';

interface InstallationWorkflowSectionProps {
  task: Task;
  orderAttachments: Attachment[];
  currentUser: Profile;
  isDeleted: boolean;
  onChanged: () => Promise<void>;
  onFeedback: (msg: string) => void;
}

export function isInstallationOrderAttachment(att: Attachment): boolean {
  return (
    att.attachment_kind === 'installation_order' ||
    Boolean(att.caption?.startsWith('[PEDIDO_INSTALACION]'))
  );
}

export function InstallationWorkflowSection({
  task,
  orderAttachments,
  currentUser,
  isDeleted,
  onChanged,
  onFeedback,
}: InstallationWorkflowSectionProps) {
  const [scheduledInput, setScheduledInput] = useState(
    toDatetimeLocalValue(task.scheduled_date)
  );
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [checkNotes, setCheckNotes] = useState(task.merchandise_check_notes || '');
  const [savingCheck, setSavingCheck] = useState(false);

  const [uploadingOrder, setUploadingOrder] = useState(false);
  const [previewOrder, setPreviewOrder] = useState<Attachment | null>(null);

  const handleSaveScheduledDate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSchedule(true);
    try {
      const nextIso = scheduledInput.trim()
        ? new Date(scheduledInput).toISOString()
        : null;
      await updateTaskFields(task.id, { scheduled_date: nextIso }, currentUser);
      onFeedback(
        nextIso
          ? 'Fecha acordada de instalación guardada.'
          : 'Fecha acordada de instalación eliminada.'
      );
      await onChanged();
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : 'No se pudo guardar la fecha.');
    } finally {
      setSavingSchedule(false);
    }
  };

  const handleToggleMerchandise = async (done: boolean) => {
    setSavingCheck(true);
    try {
      await updateTaskFields(
        task.id,
        {
          merchandise_check_done: done,
          merchandise_check_notes: checkNotes.trim() || null,
        },
        currentUser
      );
      onFeedback(
        done
          ? 'Cotejo de mercancía marcado como REALIZADO.'
          : 'Cotejo de mercancía marcado como NO REALIZADO.'
      );
      await onChanged();
    } catch (err) {
      onFeedback(
        err instanceof Error ? err.message : 'Error actualizando el cotejo de mercancía.'
      );
    } finally {
      setSavingCheck(false);
    }
  };

  const handleUploadOrder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingOrder(true);
    try {
      await uploadTaskAttachment(
        task.id,
        file,
        `Pedido de instalación: ${file.name}`,
        currentUser,
        { kind: 'installation_order' }
      );
      onFeedback('Pedido de instalación adjuntado.');
      await onChanged();
    } catch (err) {
      onFeedback(
        err instanceof Error ? err.message : 'No se pudo subir el pedido de instalación.'
      );
    } finally {
      setUploadingOrder(false);
      e.target.value = '';
    }
  };

  const handleDeleteOrder = async (att: Attachment) => {
    try {
      await deleteTaskAttachment(task.id, att, currentUser);
      if (previewOrder?.id === att.id) setPreviewOrder(null);
      onFeedback('Pedido de instalación eliminado.');
      await onChanged();
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : 'No se pudo eliminar el pedido.');
    }
  };

  return (
    <div className="space-y-4">
      {/* 1. Pedido de Instalación adjunto */}
      <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 border border-border/60 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-navy dark:text-sky-300 uppercase tracking-wider flex items-center gap-2">
            <FileText size={16} className="text-magenta" /> Pedido de Instalación (
            {orderAttachments.length})
          </h2>

          {!isDeleted && (
            <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-navy text-white text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-navy-dark min-h-[38px]">
              <FileUp size={14} /> {uploadingOrder ? 'Subiendo...' : 'Adjuntar Pedido'}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                onChange={handleUploadOrder}
                className="hidden"
                disabled={uploadingOrder}
              />
            </label>
          )}
        </div>

        {orderAttachments.length === 0 ? (
          <p className="text-xs text-mid-grey">
            No se ha adjuntado ningún pedido de instalación todavía (admite PDF o imagen).
          </p>
        ) : (
          <div className="space-y-2">
            {orderAttachments.map((att) => (
              <div
                key={att.id}
                className="flex flex-wrap items-center justify-between gap-2 p-3 bg-off-white border border-border rounded-sm"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <FileText size={18} className="text-magenta flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-charcoal truncate">{att.file_name}</p>
                    <p className="text-[11px] text-mid-grey">
                      {new Date(att.created_at).toLocaleString('es-ES')}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPreviewOrder(att)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-navy text-white text-xs font-bold hover:bg-navy-dark"
                  >
                    <Eye size={13} /> Visualizar
                  </button>
                  <a
                    href={att.public_url}
                    download={att.file_name}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-border text-xs font-bold text-charcoal hover:bg-white dark:hover:bg-white/10"
                  >
                    <Download size={13} />
                  </a>
                  {!isDeleted &&
                    (currentUser.role === 'admin' ||
                      currentUser.role === 'coordinator' ||
                      att.uploaded_by === currentUser.id) && (
                      <button
                        type="button"
                        onClick={() => handleDeleteOrder(att)}
                        className="p-1.5 text-mid-grey hover:text-danger"
                        aria-label={`Eliminar ${att.file_name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Fecha futura acordada para la instalación */}
      <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 border border-border/60 space-y-3">
        <h2 className="text-sm font-bold text-navy dark:text-sky-300 uppercase tracking-wider flex items-center gap-2">
          <Calendar size={16} className="text-magenta" /> Fecha Acordada para la Instalación
        </h2>

        <p className="text-xs text-dark-grey">
          {task.scheduled_date ? (
            <>
              Programada para:{' '}
              <strong className="text-navy dark:text-sky-300">
                {new Date(task.scheduled_date).toLocaleString('es-ES', {
                  dateStyle: 'full',
                  timeStyle: 'short',
                })}
              </strong>
            </>
          ) : (
            'Pendiente de acordar fecha con el cliente.'
          )}
        </p>

        {!isDeleted && (
          <form
            onSubmit={handleSaveScheduledDate}
            className="flex flex-wrap items-center gap-2"
          >
            <input
              type="datetime-local"
              value={scheduledInput}
              onChange={(e) => setScheduledInput(e.target.value)}
              className="flex-1 min-w-[220px] px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
            />
            <Button type="submit" size="sm" variant="secondary" isLoading={savingSchedule}>
              Guardar fecha acordada
            </Button>
          </form>
        )}
      </div>

      {/* 3. Checklist: Cotejo de mercancía */}
      <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 border border-border/60 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-navy dark:text-sky-300 uppercase tracking-wider flex items-center gap-2">
            <CheckSquare size={16} className="text-magenta" /> Checklist: Cotejo de Mercancía
          </h2>

          {task.merchandise_check_done === true ? (
            <span className="px-2.5 py-1 text-xs font-extrabold uppercase bg-success/15 text-success rounded-sm">
              Realizado
            </span>
          ) : task.merchandise_check_done === false ? (
            <span className="px-2.5 py-1 text-xs font-extrabold uppercase bg-danger/15 text-danger rounded-sm">
              No realizado
            </span>
          ) : (
            <span className="px-2.5 py-1 text-xs font-extrabold uppercase bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 rounded-sm">
              Pendiente
            </span>
          )}
        </div>

        <p className="text-xs text-mid-grey">
          Verifica que todo el material del pedido ha llegado completo y sin daños antes o al iniciar la instalación.
        </p>

        {!isDeleted && (
          <>
            <input
              type="text"
              value={checkNotes}
              onChange={(e) => setCheckNotes(e.target.value)}
              placeholder="Observaciones del cotejo (opcional, ej. Falta bandeja adicional)..."
              className="w-full px-3 py-2 bg-bg-input border border-border text-xs text-charcoal"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                disabled={savingCheck}
                onClick={() => handleToggleMerchandise(true)}
                className={`flex items-center justify-center gap-2 py-3 px-4 border-2 text-xs font-extrabold uppercase tracking-wider min-h-[46px] transition-colors ${
                  task.merchandise_check_done === true
                    ? 'border-success bg-success text-white'
                    : 'border-border bg-off-white text-charcoal hover:border-success'
                }`}
              >
                {task.merchandise_check_done === true ? (
                  <CheckSquare size={17} />
                ) : (
                  <Square size={17} />
                )}
                Cotejo Realizado
              </button>

              <button
                type="button"
                disabled={savingCheck}
                onClick={() => handleToggleMerchandise(false)}
                className={`flex items-center justify-center gap-2 py-3 px-4 border-2 text-xs font-extrabold uppercase tracking-wider min-h-[46px] transition-colors ${
                  task.merchandise_check_done === false
                    ? 'border-danger bg-danger text-white'
                    : 'border-border bg-off-white text-charcoal hover:border-danger'
                }`}
              >
                {task.merchandise_check_done === false ? (
                  <XSquare size={17} />
                ) : (
                  <Square size={17} />
                )}
                No Realizado
              </button>
            </div>
          </>
        )}

        {task.merchandise_checked_at && (
          <p className="text-[11px] text-mid-grey">
            Última verificación:{' '}
            {new Date(task.merchandise_checked_at).toLocaleString('es-ES')}
          </p>
        )}
      </div>

      {/* Modal Visor de Pedido de Instalación */}
      {previewOrder && (
        <div
          className="fixed inset-0 z-50 bg-charcoal/80 flex items-center justify-center p-3 sm:p-6"
          onClick={() => setPreviewOrder(null)}
        >
          <div
            className="bg-white dark:bg-surface w-full max-w-4xl h-[86dvh] rounded-lg shadow-elevated overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-navy text-white px-4 py-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">
                  Pedido de Instalación · {previewOrder.file_name}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewOrder.public_url}
                  download={previewOrder.file_name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 bg-white/15 hover:bg-white/25 text-xs font-bold rounded-xs"
                >
                  Descargar
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewOrder(null)}
                  className="p-1 text-white/80 hover:text-white"
                  aria-label="Cerrar visor de pedido"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-off-white overflow-auto flex items-center justify-center p-2">
              {previewOrder.mime_type === 'application/pdf' ||
              previewOrder.file_name.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={previewOrder.public_url}
                  title={previewOrder.file_name}
                  className="w-full h-full border-0 bg-white"
                />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={previewOrder.public_url}
                  alt={previewOrder.file_name}
                  className="max-w-full max-h-full object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
