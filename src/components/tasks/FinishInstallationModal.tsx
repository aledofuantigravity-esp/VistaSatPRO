'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  FileCheck2,
  FileX2,
  ImagePlus,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface FinishInstallationModalProps {
  taskCode: string;
  submitting: boolean;
  error: string | null;
  onClose: () => void;
  onFinishWithoutPhoto: () => Promise<void>;
  onFinishWithPhoto: (file: File) => Promise<void>;
}

export function FinishInstallationModal({
  taskCode,
  submitting,
  error,
  onClose,
  onFinishWithoutPhoto,
  onFinishWithPhoto,
}: FinishInstallationModalProps) {
  const [step, setStep] = useState<'ask' | 'upload'>('ask');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const previewUrl = useMemo(
    () => (selectedFile ? URL.createObjectURL(selectedFile) : null),
    [selectedFile]
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setLocalError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setLocalError('Selecciona una imagen válida (JPG, PNG o WEBP).');
      e.target.value = '';
      return;
    }
    setSelectedFile(file);
    e.target.value = '';
  };

  const handleConfirmUpload = async () => {
    if (!selectedFile) {
      setLocalError('Selecciona o haz una foto del parte de trabajo físico.');
      return;
    }
    setLocalError(null);
    await onFinishWithPhoto(selectedFile);
  };

  const displayError = localError || error;

  return (
    <div
      className="fixed inset-0 z-50 bg-charcoal/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="finish-install-title"
    >
      <div
        className="bg-white dark:bg-surface w-full sm:max-w-lg rounded-t-lg sm:rounded-lg shadow-elevated overflow-hidden max-h-[92dvh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera */}
        <div className="bg-navy text-white px-5 py-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileCheck2 size={18} className="text-magenta flex-shrink-0" />
            <h3 id="finish-install-title" className="text-sm font-bold truncate">
              Finalizar Instalación · {taskCode}
            </h3>
          </div>
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="p-1 text-white/80 hover:text-white disabled:opacity-40"
            aria-label="Cerrar diálogo de finalización"
          >
            <X size={20} />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {displayError && (
            <div className="p-3 bg-danger/10 border-l-4 border-danger text-xs font-bold text-danger">
              {displayError}
            </div>
          )}

          {step === 'ask' ? (
            <>
              <div className="space-y-2">
                <p className="text-sm font-bold text-charcoal">
                  ¿Deseas añadir una foto del parte de trabajo físico antes de finalizar?
                </p>
                <p className="text-xs text-mid-grey leading-relaxed">
                  Si adjuntas la foto, quedará guardada en el parte finalizado como{' '}
                  <strong>Parte de trabajo físico</strong> y se incluirá en el PDF. Si eliges{' '}
                  <strong>No</strong>, la instalación se cerrará dejando constancia de que no se ha
                  adjuntado parte físico.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <Button
                  type="button"
                  variant="accent"
                  disabled={submitting}
                  onClick={() => {
                    setLocalError(null);
                    setStep('upload');
                  }}
                >
                  <Camera size={16} /> Sí, añadir foto
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  isLoading={submitting}
                  onClick={onFinishWithoutPhoto}
                >
                  <FileX2 size={16} /> No, cerrar sin foto
                </Button>
              </div>

              <div className="pt-1 border-t border-border flex justify-end">
                <button
                  type="button"
                  disabled={submitting}
                  onClick={onClose}
                  className="text-xs font-bold text-mid-grey hover:text-charcoal px-2 py-1"
                >
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-navy dark:text-sky-300">
                  Adjuntar foto del parte de trabajo físico
                </p>
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => {
                    setStep('ask');
                    setLocalError(null);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-bold text-mid-grey hover:text-charcoal"
                >
                  <ArrowLeft size={14} /> Volver
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <label className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-navy text-white text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-navy-dark min-h-[46px] rounded-xs">
                  <Camera size={16} /> Usar Cámara
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    capture="environment"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={submitting}
                  />
                </label>

                <label className="inline-flex items-center justify-center gap-2 px-4 py-3 bg-off-white dark:bg-bg-input border border-navy dark:border-slate-400 text-navy dark:text-slate-100 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-navy/5 dark:hover:bg-white/10 min-h-[46px] rounded-xs">
                  <ImagePlus size={16} /> Galería de Fotos
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/*"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={submitting}
                  />
                </label>
              </div>

              {selectedFile && previewUrl ? (
                <div className="space-y-2 border border-border rounded-sm p-3 bg-off-white">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-charcoal truncate">
                      {selectedFile.name}
                    </span>
                    <span className="text-[11px] text-mid-grey flex-shrink-0">
                      {(selectedFile.size / 1024).toFixed(0)} KB
                    </span>
                  </div>
                  <div className="w-full max-h-64 overflow-hidden flex items-center justify-center bg-white border border-border rounded-xs">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt="Vista previa del parte de trabajo físico"
                      className="max-h-64 w-auto object-contain"
                    />
                  </div>
                  <p className="text-[11px] text-mid-grey">
                    Comprueba que el documento se vea nítido. Si lo necesitas, vuelve a pulsar Cámara
                    o Galería para sustituirlo.
                  </p>
                </div>
              ) : (
                <div className="p-4 border border-dashed border-border rounded-sm text-center text-xs text-mid-grey">
                  Selecciona una foto desde la cámara o la galería para previsualizarla antes de
                  finalizar.
                </div>
              )}

              <div className="pt-2 border-t border-border flex flex-wrap items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={submitting}
                  onClick={onClose}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  variant="accent"
                  size="sm"
                  disabled={!selectedFile}
                  isLoading={submitting}
                  onClick={handleConfirmUpload}
                >
                  <CheckCircle2 size={15} /> Subir y Finalizar Instalación
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
