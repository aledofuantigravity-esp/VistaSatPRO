'use client';

import { useEffect, useState } from 'react';
import {
  Calendar,
  CalendarPlus,
  CheckSquare,
  Download,
  Eye,
  FileText,
  FileUp,
  FolderOpen,
  Package,
  Plus,
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
import { downloadInstallationIcs } from '@/lib/ics';
import { isSafePreviewUrl } from '@/lib/security';
import { dateInputToIso, formatDateOnlyEs, toDateInputValue } from '@/lib/task-dates';
import type {
  Attachment,
  AttachmentKind,
  InstallationProductItem,
  Profile,
  Task,
} from '@/types/database';

interface DraftProductRow {
  id: string;
  name: string;
  qty: string;
}

interface InstallationWorkflowSectionProps {
  task: Task;
  orderAttachments: Attachment[];
  interestAttachments: Attachment[];
  currentUser: Profile;
  isDeleted: boolean;
  onChanged: () => Promise<void>;
  onFeedback: (msg: string) => void;
}

export function isInterestDocumentAttachment(att: Attachment): boolean {
  return (
    att.attachment_kind === 'interest_document' ||
    Boolean(att.caption?.startsWith('[DOC_INTERES]'))
  );
}

export function isInstallationOrderAttachment(att: Attachment): boolean {
  if (isInterestDocumentAttachment(att)) return false;
  return (
    att.attachment_kind === 'installation_order' ||
    Boolean(att.caption?.startsWith('[PEDIDO_INSTALACION]'))
  );
}

function InstallationDocumentsCard({
  title,
  icon,
  attachments,
  emptyText,
  uploadButtonLabel,
  uploadingLabel,
  uploading,
  errorMessage,
  multiple = false,
  isDeleted,
  currentUser,
  onUploadFiles,
  onPreview,
  onDelete,
}: {
  title: string;
  icon: React.ReactNode;
  attachments: Attachment[];
  emptyText: string;
  uploadButtonLabel: string;
  uploadingLabel: string;
  uploading: boolean;
  errorMessage?: string | null;
  multiple?: boolean;
  isDeleted: boolean;
  currentUser: Profile;
  onUploadFiles: (files: File[]) => void;
  onPreview: (att: Attachment) => void;
  onDelete: (att: Attachment) => void;
}) {
  return (
    <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2">
          {icon} {title} ({attachments.length})
        </h2>

        {!isDeleted && (
          <label className="relative inline-flex items-center gap-1.5 px-3 py-2 bg-navy text-white text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-navy-dark min-h-[38px]">
            <FileUp size={14} /> {uploading ? uploadingLabel : uploadButtonLabel}
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              multiple={multiple}
              onChange={(e) => {
                // Clonar antes de limpiar value porque FileList es una colección viva en algunos navegadores
                const picked = Array.from(e.target.files || []);
                e.target.value = '';
                if (picked.length > 0) {
                  onUploadFiles(picked);
                }
              }}
              className="sr-only"
              disabled={uploading}
            />
          </label>
        )}
      </div>

      {errorMessage && (
        <p
          role="alert"
          className="text-xs font-semibold text-danger bg-danger/10 p-3 border-l-4 border-danger"
        >
          {errorMessage}
        </p>
      )}

      {attachments.length === 0 ? (
        <p className="text-xs text-mid-grey">{emptyText}</p>
      ) : (
        <div className="space-y-2">
          {attachments.map((att) => (
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
                  onClick={() => onPreview(att)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-navy text-white text-xs font-bold hover:bg-navy-dark"
                >
                  <Eye size={13} /> Visualizar
                </button>
                <a
                  href={att.public_url}
                  download={att.file_name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-border text-xs font-bold text-charcoal hover:bg-white"
                >
                  <Download size={13} />
                </a>
                {!isDeleted &&
                  (currentUser.role === 'admin' ||
                    currentUser.role === 'coordinator' ||
                    att.uploaded_by === currentUser.id) && (
                    <button
                      type="button"
                      onClick={() => onDelete(att)}
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
  );
}

function InstallationProductsCard({
  taskId,
  initialProducts,
  currentUser,
  isDeleted,
  onChanged,
  onFeedback,
}: {
  taskId: string;
  initialProducts: InstallationProductItem[];
  currentUser: Profile;
  isDeleted: boolean;
  onChanged: () => Promise<void>;
  onFeedback: (msg: string) => void;
}) {
  const [rows, setRows] = useState<DraftProductRow[]>(() =>
    initialProducts.map((p) => ({
      id: p.id,
      name: p.name,
      qty: String(Math.max(1, Number(p.qty) || 1)),
    }))
  );
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const normalizedDraft: InstallationProductItem[] = rows
    .filter((r) => r.name.trim().length > 0)
    .map((r) => ({
      id: r.id,
      name: r.name.trim(),
      qty: Math.max(1, parseInt(r.qty, 10) || 1),
    }));

  const normalizedInitial = initialProducts
    .filter((p) => p.name.trim().length > 0)
    .map((p) => ({
      id: p.id,
      name: p.name.trim(),
      qty: Math.max(1, Math.floor(Number(p.qty) || 1)),
    }));

  const isDirty =
    JSON.stringify(normalizedDraft.map((p) => ({ name: p.name, qty: p.qty }))) !==
    JSON.stringify(normalizedInitial.map((p) => ({ name: p.name, qty: p.qty })));

  const totalUnits = normalizedInitial.reduce((sum, p) => sum + p.qty, 0);

  const handleAddRow = () => {
    setErrorMsg(null);
    setRows((prev) => [
      ...prev,
      { id: `inst-prod-${Date.now()}-${prev.length + 1}`, name: '', qty: '1' },
    ]);
  };

  const handleUpdateRow = (id: string, field: 'name' | 'qty', value: string) => {
    setErrorMsg(null);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  };

  const handleRemoveRow = (id: string) => {
    setErrorMsg(null);
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSaving(true);
    try {
      const res = await updateTaskFields(
        taskId,
        { installation_products: normalizedDraft },
        currentUser
      );
      if (res.offlineQueued) {
        onFeedback('Sin conexión: productos a instalar guardados en cola offline.');
      } else {
        onFeedback('Productos a instalar actualizados.');
        await onChanged();
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'No se pudieron guardar los productos a instalar.';
      setErrorMsg(msg);
      onFeedback(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2">
            <Package size={16} className="text-magenta" /> Productos a Instalar (
            {normalizedInitial.length})
          </h2>
          {normalizedInitial.length > 0 && (
            <span className="text-[11px] font-bold px-2 py-0.5 bg-off-white border border-border text-navy">
              {totalUnits} ud.
            </span>
          )}
        </div>

        {!isDeleted && (
          <button
            type="button"
            onClick={handleAddRow}
            className="inline-flex items-center gap-1 px-3 py-2 bg-navy text-white text-xs font-bold uppercase tracking-wider hover:bg-navy-dark min-h-[38px]"
            aria-label="Añadir producto a instalar"
          >
            <Plus size={14} /> Añadir producto
          </button>
        )}
      </div>

      {errorMsg && (
        <p
          role="alert"
          className="text-xs font-semibold text-danger bg-danger/10 p-3 border-l-4 border-danger"
        >
          {errorMsg}
        </p>
      )}

      {isDeleted ? (
        normalizedInitial.length === 0 ? (
          <p className="text-xs text-mid-grey">No se han añadido productos a instalar todavía.</p>
        ) : (
          <div className="divide-y divide-border border border-border rounded-sm">
            {normalizedInitial.map((prod) => (
              <div
                key={prod.id}
                className="flex items-center justify-between px-3 py-2.5 text-sm"
              >
                <span className="font-bold text-charcoal">{prod.name}</span>
                <span className="text-xs font-bold bg-off-white px-2 py-1 border border-border text-navy">
                  x{prod.qty}
                </span>
              </div>
            ))}
          </div>
        )
      ) : (
        <form onSubmit={handleSave} className="space-y-3">
          {rows.length === 0 ? (
            <p className="text-xs text-mid-grey">
              No se han añadido productos a instalar todavía.
            </p>
          ) : (
            <div className="space-y-2">
              {rows.map((row, idx) => (
                <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => handleUpdateRow(row.id, 'name', e.target.value)}
                    placeholder={`Producto ${idx + 1} (ej. Impresora, Finisher, Bandeja)`}
                    aria-label={`Producto a instalar ${idx + 1}`}
                    className="col-span-7 sm:col-span-8 px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
                  />
                  <input
                    type="number"
                    min={1}
                    value={row.qty}
                    onChange={(e) => handleUpdateRow(row.id, 'qty', e.target.value)}
                    aria-label={`Cantidad producto ${idx + 1}`}
                    className="col-span-3 sm:col-span-2 px-2 py-2 bg-bg-input border border-border text-sm text-center text-charcoal"
                  />
                  <div className="col-span-2 flex items-center gap-1">
                    {idx === rows.length - 1 && (
                      <button
                        type="button"
                        onClick={handleAddRow}
                        className="flex-1 h-9 bg-navy text-white hover:bg-navy-dark flex items-center justify-center"
                        aria-label="Añadir otra línea de producto"
                        title="Añadir otra línea"
                      >
                        <Plus size={15} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemoveRow(row.id)}
                      className="flex-1 h-9 border border-border text-mid-grey hover:text-danger flex items-center justify-center"
                      aria-label={`Eliminar producto ${idx + 1}`}
                      title="Quitar producto"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(rows.length > 0 || isDirty) && (
            <div className="flex justify-end">
              <Button
                type="submit"
                size="sm"
                variant="secondary"
                disabled={!isDirty}
                isLoading={saving}
              >
                Guardar productos
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}

export function InstallationWorkflowSection({
  task,
  orderAttachments,
  interestAttachments,
  currentUser,
  isDeleted,
  onChanged,
  onFeedback,
}: InstallationWorkflowSectionProps) {
  const [scheduledInput, setScheduledInput] = useState(
    toDateInputValue(task.scheduled_date)
  );
  const [savingSchedule, setSavingSchedule] = useState(false);

  const [checkNotes, setCheckNotes] = useState(task.merchandise_check_notes || '');
  const [savingCheck, setSavingCheck] = useState(false);

  const [uploadingOrder, setUploadingOrder] = useState(false);
  const [uploadingInterest, setUploadingInterest] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [interestError, setInterestError] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{
    attachment: Attachment;
    sectionLabel: string;
  } | null>(null);
  const [safePdfObjectUrl, setSafePdfObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    const rawUrl = previewDoc?.attachment.public_url;
    let revoked = false;
    let objectUrl: string | null = null;

    if (!rawUrl || !rawUrl.startsWith('data:application/pdf')) {
      return;
    }

    fetch(rawUrl)
      .then((res) => res.blob())
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setSafePdfObjectUrl(objectUrl);
      })
      .catch(() => {
        if (!revoked) setSafePdfObjectUrl(null);
      });

    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      setSafePdfObjectUrl(null);
    };
  }, [previewDoc]);

  const handleSaveScheduledDate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSchedule(true);
    try {
      const nextIso = dateInputToIso(scheduledInput);
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

  const uploadDocuments = async (files: File[], kind: AttachmentKind) => {
    const isInterest = kind === 'interest_document';
    if (isInterest) {
      setInterestError(null);
      setUploadingInterest(true);
    } else {
      setOrderError(null);
      setUploadingOrder(true);
    }

    try {
      for (const file of files) {
        const caption = isInterest
          ? `Documento de interés: ${file.name}`
          : `Pedido de instalación: ${file.name}`;
        await uploadTaskAttachment(task.id, file, caption, currentUser, { kind });
      }
      onFeedback(
        isInterest
          ? files.length > 1
            ? `${files.length} documentos de interés adjuntados.`
            : 'Documento de interés adjuntado.'
          : 'Pedido de instalación adjuntado.'
      );
      await onChanged();
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : isInterest
          ? 'No se pudo subir el documento de interés.'
          : 'No se pudo subir el pedido de instalación.';
      if (isInterest) setInterestError(msg);
      else setOrderError(msg);
      onFeedback(msg);
    } finally {
      if (isInterest) setUploadingInterest(false);
      else setUploadingOrder(false);
    }
  };

  const handleDeleteDocument = async (att: Attachment, successMsg: string) => {
    try {
      await deleteTaskAttachment(task.id, att, currentUser);
      if (previewDoc?.attachment.id === att.id) setPreviewDoc(null);
      onFeedback(successMsg);
      await onChanged();
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : 'No se pudo eliminar el documento.');
    }
  };

  const savedProducts = (task.installation_products || []).filter(
    (p) => p.name.trim().length > 0
  );
  const productsKey = JSON.stringify(savedProducts);

  return (
    <div className="space-y-4">
      {/* 0. Productos a Instalar (opcionales al crear, editables en el parte) */}
      <InstallationProductsCard
        key={productsKey}
        taskId={task.id}
        initialProducts={savedProducts}
        currentUser={currentUser}
        isDeleted={isDeleted}
        onChanged={onChanged}
        onFeedback={onFeedback}
      />

      {/* 1. Pedido de Instalación adjunto */}
      <InstallationDocumentsCard
        title="Pedido de Instalación"
        icon={<FileText size={16} className="text-magenta" />}
        attachments={orderAttachments}
        emptyText="No se ha adjuntado ningún pedido de instalación todavía (admite PDF o imagen)."
        uploadButtonLabel="Adjuntar Pedido"
        uploadingLabel="Subiendo..."
        uploading={uploadingOrder}
        errorMessage={orderError}
        isDeleted={isDeleted}
        currentUser={currentUser}
        onUploadFiles={(files) => void uploadDocuments(files, 'installation_order')}
        onPreview={(att) =>
          setPreviewDoc({ attachment: att, sectionLabel: 'Pedido de Instalación' })
        }
        onDelete={(att) =>
          void handleDeleteDocument(att, 'Pedido de instalación eliminado.')
        }
      />

      {/* 2. Documentos de Interés (debajo de Pedido y encima de Fecha Acordada) */}
      <InstallationDocumentsCard
        title="Documentos de Interés"
        icon={<FolderOpen size={16} className="text-magenta" />}
        attachments={interestAttachments}
        emptyText="No se ha adjuntado ningún documento de interés todavía (admite PDF o imagen)."
        uploadButtonLabel="Adjuntar Documento"
        uploadingLabel="Subiendo..."
        uploading={uploadingInterest}
        errorMessage={interestError}
        multiple
        isDeleted={isDeleted}
        currentUser={currentUser}
        onUploadFiles={(files) => void uploadDocuments(files, 'interest_document')}
        onPreview={(att) =>
          setPreviewDoc({ attachment: att, sectionLabel: 'Documento de Interés' })
        }
        onDelete={(att) =>
          void handleDeleteDocument(att, 'Documento de interés eliminado.')
        }
      />

      {/* 3. Fecha acordada para la instalación (solo fecha, sin hora) */}
      <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2">
            <Calendar size={16} className="text-magenta" /> Fecha Acordada para la Instalación
          </h2>
          {task.scheduled_date && (
            <button
              type="button"
              onClick={() => downloadInstallationIcs(task)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-off-white border border-border text-xs font-bold text-navy hover:bg-navy/5 rounded-xs"
            >
              <CalendarPlus size={14} className="text-magenta" /> Añadir a calendario (.ics)
            </button>
          )}
        </div>

        <p className="text-xs text-dark-grey">
          {task.scheduled_date ? (
            <>
              Programada para:{' '}
              <strong className="text-navy">
                {formatDateOnlyEs(task.scheduled_date, 'full')}
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
              type="date"
              aria-label="Fecha acordada de instalación"
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

      {/* 4. Checklist: Cotejo de mercancía */}
      <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2">
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
            <span className="px-2.5 py-1 text-xs font-extrabold uppercase bg-amber-100 text-amber-800 rounded-sm">
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

      {/* Modal Visor de Pedido / Documento de Interés */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 bg-charcoal/80 flex items-center justify-center p-3 sm:p-6"
          onClick={() => setPreviewDoc(null)}
        >
          <div
            className="bg-white w-full max-w-4xl h-[86dvh] rounded-lg shadow-elevated overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-navy text-white px-4 py-3 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">
                  {previewDoc.sectionLabel} · {previewDoc.attachment.file_name}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewDoc.attachment.public_url}
                  download={previewDoc.attachment.file_name}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 bg-white/15 hover:bg-white/25 text-xs font-bold rounded-xs"
                >
                  Descargar
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  className="p-1 text-white/80 hover:text-white"
                  aria-label="Cerrar visor de documento"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="flex-1 bg-off-white overflow-auto flex items-center justify-center p-2">
              {!isSafePreviewUrl(previewDoc.attachment.public_url) ? (
                <p className="text-sm text-danger font-semibold p-4">
                  URL de documento bloqueada por seguridad.
                </p>
              ) : previewDoc.attachment.mime_type === 'application/pdf' ||
                previewDoc.attachment.file_name.toLowerCase().endsWith('.pdf') ? (
                previewDoc.attachment.public_url.startsWith('data:') && !safePdfObjectUrl ? (
                  <p className="text-xs text-mid-grey p-4">Cargando documento PDF...</p>
                ) : (
                  <iframe
                    src={
                      previewDoc.attachment.public_url.startsWith('data:')
                        ? safePdfObjectUrl || undefined
                        : previewDoc.attachment.public_url
                    }
                    title={previewDoc.attachment.file_name}
                    className="w-full h-full border-0 bg-white"
                  />
                )
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={previewDoc.attachment.public_url}
                  alt={previewDoc.attachment.file_name}
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
