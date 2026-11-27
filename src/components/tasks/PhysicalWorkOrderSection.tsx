'use client';

import { useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Download,
  Eye,
  FileCheck2,
  ImagePlus,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  deleteTaskAttachment,
  refreshSignedUrl,
  updateTaskFields,
  uploadTaskAttachment,
} from '@/lib/data-service';
import type { Attachment, Profile, Task } from '@/types/database';

export function isPhysicalWorkOrderAttachment(att: Attachment): boolean {
  return (
    att.attachment_kind === 'physical_work_order' ||
    Boolean(att.caption?.startsWith('[PARTE_FISICO]'))
  );
}

interface PhysicalWorkOrderSectionProps {
  task: Task;
  attachments: Attachment[];
  currentUser: Profile;
  isDeleted: boolean;
  onChanged: () => Promise<void>;
  onFeedback: (msg: string) => void;
}

export function PhysicalWorkOrderSection({
  task,
  attachments,
  currentUser,
  isDeleted,
  onChanged,
  onFeedback,
}: PhysicalWorkOrderSectionProps) {
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [zoom, setZoom] = useState<1 | 1.75 | 2.5>(1);
  const [refreshedUrls, setRefreshedUrls] = useState<Record<string, string>>({});
  const retriedIdsRef = useRef<Set<string>>(new Set());

  const hasAttachments = attachments.length > 0;
  const shouldShow =
    hasAttachments ||
    task.physical_work_order_attached === false ||
    task.status === 'completed';

  if (!shouldShow) return null;

  const getDisplayUrl = (att: Attachment) => refreshedUrls[att.id] || att.public_url;

  const handleImageError = async (att: Attachment) => {
    if (retriedIdsRef.current.has(att.id)) return;
    retriedIdsRef.current.add(att.id);
    const fresh = await refreshSignedUrl(att.storage_path || att.public_url);
    if (fresh) {
      setRefreshedUrls((prev) => ({ ...prev, [att.id]: fresh }));
    }
  };

  const canDelete = (att: Attachment) =>
    !isDeleted &&
    (currentUser.role === 'admin' ||
      currentUser.role === 'coordinator' ||
      att.uploaded_by === currentUser.id);

  const handleUploadLater = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const res = await uploadTaskAttachment(
        task.id,
        file,
        'Parte de trabajo físico',
        currentUser,
        { kind: 'physical_work_order' }
      );
      if (res.offlineQueued) {
        onFeedback('Sin conexión: parte físico optimizado y guardado en cola offline.');
      } else {
        if (task.physical_work_order_attached !== true) {
          await updateTaskFields(task.id, { physical_work_order_attached: true }, currentUser);
        }
        onFeedback('Parte de trabajo físico adjuntado correctamente.');
        await onChanged();
      }
    } catch (err) {
      onFeedback(
        err instanceof Error ? err.message : 'No se pudo subir el parte de trabajo físico.'
      );
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (att: Attachment) => {
    setDeletingId(att.id);
    try {
      await deleteTaskAttachment(task.id, att, currentUser);
      if (attachments.length <= 1 && task.status === 'completed') {
        await updateTaskFields(task.id, { physical_work_order_attached: false }, currentUser);
      }
      if (previewAttachment?.id === att.id) {
        setPreviewAttachment(null);
      }
      onFeedback('Parte de trabajo físico eliminado.');
      await onChanged();
    } catch (err) {
      onFeedback(
        err instanceof Error ? err.message : 'No se pudo eliminar el parte de trabajo físico.'
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2">
          <FileCheck2 size={16} className="text-magenta" /> Parte de Trabajo Físico
        </h2>

        {hasAttachments ? (
          <span className="px-2.5 py-1 text-xs font-extrabold uppercase bg-success/15 text-success rounded-sm">
            Adjuntado
          </span>
        ) : (
          <span className="px-2.5 py-1 text-xs font-extrabold uppercase bg-amber-100 text-amber-800 rounded-sm">
            No adjuntado
          </span>
        )}
      </div>

      {hasAttachments ? (
        <div className="space-y-3">
          {attachments.map((att) => {
            const url = getDisplayUrl(att);
            return (
              <div
                key={att.id}
                className="border border-border rounded-sm bg-off-white overflow-hidden"
              >
                <div className="p-3 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setZoom(1);
                      setPreviewAttachment(att);
                    }}
                    className="w-full sm:w-40 h-32 bg-white border border-border rounded-xs overflow-hidden flex-shrink-0 flex items-center justify-center"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt="Parte de trabajo físico"
                      onError={() => void handleImageError(att)}
                      className="w-full h-full object-contain"
                    />
                  </button>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <p className="text-xs font-extrabold uppercase tracking-wider text-navy">
                      Parte de trabajo físico
                    </p>
                    <p className="text-xs font-semibold text-charcoal truncate">{att.file_name}</p>
                    <p className="text-[11px] text-mid-grey">
                      Adjuntado el{' '}
                      {new Date(att.created_at).toLocaleString('es-ES', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setZoom(1);
                          setPreviewAttachment(att);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-navy text-white text-xs font-bold hover:bg-navy-dark"
                      >
                        <Eye size={13} /> Ampliar
                      </button>
                      <a
                        href={url}
                        download={att.file_name}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-border text-xs font-bold text-charcoal hover:bg-white"
                      >
                        <Download size={13} /> Descargar
                      </a>
                      {canDelete(att) && (
                        <button
                          type="button"
                          disabled={deletingId === att.id}
                          onClick={() => handleDelete(att)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 border border-danger/40 text-xs font-bold text-danger hover:bg-danger/10 disabled:opacity-40"
                        >
                          <Trash2 size={13} /> Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-3.5 bg-amber-50 border-l-4 border-amber-500 rounded-xs space-y-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="text-xs font-bold text-charcoal">
                No se ha adjuntado parte de trabajo físico
              </p>
              <p className="text-[11px] text-dark-grey">
                Esta instalación se cerró sin fotografía del documento físico.
              </p>
            </div>
          </div>

          {!isDeleted && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-navy text-white text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-navy-dark">
                <Camera size={14} /> {uploading ? 'Subiendo...' : 'Añadir con Cámara'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/*"
                  capture="environment"
                  onChange={handleUploadLater}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-navy text-navy text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-navy/5">
                <ImagePlus size={14} /> {uploading ? 'Subiendo...' : 'Añadir de Galería'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/*"
                  onChange={handleUploadLater}
                  className="hidden"
                  disabled={uploading}
                />
              </label>
            </div>
          )}
        </div>
      )}

      {/* Visor ampliado del parte de trabajo físico */}
      {previewAttachment && (
        <div
          className="fixed inset-0 z-50 bg-black/92 flex flex-col justify-between p-4 select-none"
          onClick={() => setPreviewAttachment(null)}
        >
          <div
            className="flex items-center justify-between text-white z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-xs font-bold">
              Parte de trabajo físico · {previewAttachment.file_name}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setZoom((z) => (z === 2.5 ? 1.75 : 1))}
                disabled={zoom === 1}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-full disabled:opacity-40"
                aria-label="Reducir zoom"
              >
                <ZoomOut size={18} />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => (z === 1 ? 1.75 : z === 1.75 ? 2.5 : 1))}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-full"
                aria-label="Aumentar zoom"
              >
                <ZoomIn size={18} />
              </button>
              <button
                type="button"
                onClick={() => setPreviewAttachment(null)}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-full"
                aria-label="Cerrar visor"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div
            className="flex-1 flex items-center justify-center overflow-auto my-2"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getDisplayUrl(previewAttachment)}
              alt="Parte de trabajo físico"
              onError={() => void handleImageError(previewAttachment)}
              onClick={() => setZoom((z) => (z === 1 ? 1.75 : z === 1.75 ? 2.5 : 1))}
              className="max-w-full max-h-[80dvh] object-contain transition-transform duration-200 cursor-zoom-in"
              style={{ transform: `scale(${zoom})` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
