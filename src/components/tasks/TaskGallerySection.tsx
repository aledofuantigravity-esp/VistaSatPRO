'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  deleteTaskAttachment,
  refreshSignedUrl,
  uploadTaskAttachment,
} from '@/lib/data-service';
import type { Attachment, Profile } from '@/types/database';

interface TaskGallerySectionProps {
  taskId: string;
  title?: string;
  attachments: Attachment[];
  currentUser: Profile;
  isDeleted: boolean;
  onChanged: () => Promise<void>;
  onFeedback: (msg: string) => void;
}

export function TaskGallerySection({
  taskId,
  title = 'Fotografías',
  attachments,
  currentUser,
  isDeleted,
  onChanged,
  onFeedback,
}: TaskGallerySectionProps) {
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [offlinePhotos, setOfflinePhotos] = useState<Attachment[]>([]);
  const [refreshedUrls, setRefreshedUrls] = useState<Record<string, string>>({});
  const retriedIdsRef = useRef<Set<string>>(new Set());

  // Lightbox con navegación y zoom
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);
  const [zoom, setZoom] = useState<1 | 1.75 | 2.5>(1);
  const touchStartX = useRef<number | null>(null);

  const visibleAttachments = [...offlinePhotos, ...attachments];
  const activeAttachment =
    lightboxIdx !== null && visibleAttachments[lightboxIdx]
      ? visibleAttachments[lightboxIdx]
      : null;

  const getDisplayUrl = (att: Attachment) => refreshedUrls[att.id] || att.public_url;

  const handleImageError = async (att: Attachment) => {
    if (retriedIdsRef.current.has(att.id)) return;
    retriedIdsRef.current.add(att.id);
    const fresh = await refreshSignedUrl(att.storage_path || att.public_url);
    if (fresh) {
      setRefreshedUrls((prev) => ({ ...prev, [att.id]: fresh }));
    }
  };

  const openLightbox = (index: number) => {
    setZoom(1);
    setLightboxIdx(index);
  };

  const closeLightbox = () => {
    setLightboxIdx(null);
    setZoom(1);
  };

  const goPrev = () => {
    if (visibleAttachments.length === 0) return;
    setZoom(1);
    setLightboxIdx((prev) =>
      prev === null
        ? 0
        : (prev - 1 + visibleAttachments.length) % visibleAttachments.length
    );
  };

  const goNext = () => {
    if (visibleAttachments.length === 0) return;
    setZoom(1);
    setLightboxIdx((prev) =>
      prev === null ? 0 : (prev + 1) % visibleAttachments.length
    );
  };

  useEffect(() => {
    if (lightboxIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeLightbox();
      } else if (e.key === 'ArrowLeft') {
        setZoom(1);
        setLightboxIdx((prev) =>
          prev === null
            ? 0
            : (prev - 1 + visibleAttachments.length) % visibleAttachments.length
        );
      } else if (e.key === 'ArrowRight') {
        setZoom(1);
        setLightboxIdx((prev) =>
          prev === null ? 0 : (prev + 1) % visibleAttachments.length
        );
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightboxIdx, visibleAttachments.length]);

  useEffect(() => {
    const onOfflineSynced = () => {
      setOfflinePhotos([]);
      void onChanged();
    };
    window.addEventListener('vistasat:offline-synced', onOfflineSynced);
    return () => window.removeEventListener('vistasat:offline-synced', onOfflineSynced);
  }, [onChanged]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      let uploadedCount = 0;
      let queuedCount = 0;
      for (const file of files) {
        const res = await uploadTaskAttachment(
          taskId,
          file,
          caption.trim() || undefined,
          currentUser
        );
        if (res.offlineQueued) {
          queuedCount++;
          setOfflinePhotos((prev) => [res, ...prev]);
        } else {
          uploadedCount++;
        }
      }
      setCaption('');
      if (queuedCount > 0) {
        onFeedback(
          queuedCount === 1
            ? 'Sin conexión: fotografía comprimida y guardada en cola offline.'
            : `Sin conexión: ${queuedCount} fotografías guardadas en cola offline.`
        );
      } else {
        onFeedback(
          uploadedCount === 1
            ? 'Fotografía adjuntada al parte.'
            : `${uploadedCount} fotografías adjuntadas al parte.`
        );
        await onChanged();
      }
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : 'No se pudo subir la fotografía.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (att: Attachment) => {
    if (att.id.startsWith('offline-')) {
      setOfflinePhotos((prev) => prev.filter((item) => item.id !== att.id));
      setConfirmDeleteId(null);
      return;
    }
    setDeletingId(att.id);
    try {
      await deleteTaskAttachment(taskId, att, currentUser);
      setConfirmDeleteId(null);
      if (lightboxIdx !== null) closeLightbox();
      onFeedback('Fotografía eliminada del parte.');
      await onChanged();
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : 'No se pudo eliminar la fotografía.');
    } finally {
      setDeletingId(null);
    }
  };

  const canDeleteAttachment = (att: Attachment) =>
    !isDeleted &&
    !att.id.startsWith('offline-') &&
    (currentUser.role === 'admin' ||
      currentUser.role === 'coordinator' ||
      att.uploaded_by === currentUser.id);

  const cycleZoom = () => {
    setZoom((prev) => (prev === 1 ? 1.75 : prev === 1.75 ? 2.5 : 1));
  };

  return (
    <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2">
          <Camera size={16} className="text-magenta" /> {title} ({visibleAttachments.length})
        </h2>

        {!isDeleted && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-navy text-white text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-navy-dark min-h-[40px]">
              <Camera size={15} /> {uploading ? 'Optimizando...' : 'Usar Cámara'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                capture="environment"
                onChange={handlePhotoUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
            <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-off-white border border-navy text-navy text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-navy/5 min-h-[40px]">
              <ImagePlus size={15} /> {uploading ? 'Optimizando...' : 'Subir de Galería'}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/*"
                multiple
                onChange={handlePhotoUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>
        )}
      </div>

      {!isDeleted && (
        <input
          type="text"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          placeholder="Descripción opcional antes de seleccionar foto (ej. Placa quemada)"
          className="w-full px-3 py-2 bg-bg-input border border-border text-xs text-charcoal"
        />
      )}

      {visibleAttachments.length === 0 ? (
        <p className="text-xs text-mid-grey">
          Aún no hay fotografías adjuntas. Usa la cámara o galería del móvil.
        </p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {visibleAttachments.map((att, index) => (
            <div
              key={att.id}
              className="relative group rounded-sm overflow-hidden border border-border bg-off-white flex flex-col"
            >
              <button
                type="button"
                onClick={() => openLightbox(index)}
                className="aspect-square w-full overflow-hidden block relative"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getDisplayUrl(att)}
                  alt={att.caption || att.file_name}
                  loading="lazy"
                  decoding="async"
                  onError={() => void handleImageError(att)}
                  className="w-full h-full object-cover transition-transform group-hover:scale-105"
                />
                {att.id.startsWith('offline-') && (
                  <span className="absolute top-1 left-1 px-1.5 py-0.5 bg-warning text-charcoal text-[10px] font-bold rounded-xs">
                    Pendiente red
                  </span>
                )}
              </button>

              <div className="p-2 flex items-center justify-between gap-1 text-[11px] bg-white border-t border-border">
                <span className="truncate text-dark-grey font-medium">
                  {att.caption || att.file_name}
                </span>
                {canDeleteAttachment(att) && (
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmDeleteId(confirmDeleteId === att.id ? null : att.id)
                    }
                    className="p-1 text-mid-grey hover:text-danger flex-shrink-0"
                    aria-label={`Eliminar ${att.file_name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              {confirmDeleteId === att.id && (
                <div className="absolute inset-0 bg-charcoal/90 text-white p-3 flex flex-col items-center justify-center text-center gap-2">
                  <p className="text-xs font-bold">¿Eliminar esta foto?</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2.5 py-1 text-xs bg-white/15 hover:bg-white/25 rounded-xs"
                    >
                      No
                    </button>
                    <button
                      type="button"
                      disabled={deletingId === att.id}
                      onClick={() => handleDelete(att)}
                      className="px-2.5 py-1 text-xs font-bold bg-danger hover:opacity-90 rounded-xs"
                    >
                      {deletingId === att.id ? '...' : 'Sí, borrar'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Visor Lightbox mejorado con zoom y swipe */}
      {activeAttachment && (
        <div
          className="fixed inset-0 z-50 bg-black/92 flex flex-col justify-between p-4 select-none"
          onClick={closeLightbox}
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0]?.clientX ?? null;
          }}
          onTouchEnd={(e) => {
            if (touchStartX.current === null) return;
            const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
            const delta = endX - touchStartX.current;
            touchStartX.current = null;
            if (Math.abs(delta) > 50 && zoom === 1) {
              if (delta > 0) goPrev();
              else goNext();
            }
          }}
        >
          <div
            className="flex items-center justify-between text-white z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-xs font-bold">
              {(lightboxIdx ?? 0) + 1} / {visibleAttachments.length}
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
                onClick={cycleZoom}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-full"
                aria-label="Aumentar zoom"
              >
                <ZoomIn size={18} />
              </button>
              <button
                type="button"
                onClick={closeLightbox}
                className="p-2 bg-white/10 hover:bg-white/20 rounded-full"
                aria-label="Cerrar visor"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div
            className="flex-1 flex items-center justify-center relative overflow-auto my-2"
            onClick={(e) => e.stopPropagation()}
          >
            {visibleAttachments.length > 1 && (
              <button
                type="button"
                onClick={goPrev}
                className="absolute left-1 sm:left-3 z-10 p-2.5 bg-black/60 hover:bg-black/80 text-white rounded-full"
                aria-label="Foto anterior"
              >
                <ChevronLeft size={24} />
              </button>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getDisplayUrl(activeAttachment)}
              alt={activeAttachment.caption || activeAttachment.file_name}
              onError={() => void handleImageError(activeAttachment)}
              onClick={cycleZoom}
              className="max-w-full max-h-[76dvh] object-contain transition-transform duration-200 cursor-zoom-in"
              style={{ transform: `scale(${zoom})` }}
            />

            {visibleAttachments.length > 1 && (
              <button
                type="button"
                onClick={goNext}
                className="absolute right-1 sm:right-3 z-10 p-2.5 bg-black/60 hover:bg-black/80 text-white rounded-full"
                aria-label="Siguiente foto"
              >
                <ChevronRight size={24} />
              </button>
            )}
          </div>

          <div
            className="text-center text-white space-y-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-bold">
              {activeAttachment.caption || activeAttachment.file_name}
            </p>
            <p className="text-[11px] text-white/65">
              {new Date(activeAttachment.created_at).toLocaleString('es-ES')} · Zoom {zoom}x
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
