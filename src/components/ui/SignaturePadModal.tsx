'use client';

import { useEffect, useRef, useState } from 'react';
import SignaturePad from 'signature_pad';
import { Eraser, Check, X } from 'lucide-react';
import { Button } from './Button';

export function SignaturePadModal({
  isOpen,
  initialSignerName,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  initialSignerName?: string;
  onClose: () => void;
  onSave: (dataUrl: string, signerName: string) => Promise<void>;
}) {
  if (!isOpen) return null;

  return (
    <SignaturePadModalBody
      key={initialSignerName || 'signer'}
      initialSignerName={initialSignerName}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function SignaturePadModalBody({
  initialSignerName,
  onClose,
  onSave,
}: {
  initialSignerName?: string;
  onClose: () => void;
  onSave: (dataUrl: string, signerName: string) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);
  const [signerName, setSignerName] = useState(initialSignerName || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.scale(ratio, ratio);

    const pad = new SignaturePad(canvas, {
      backgroundColor: '#FFFFFF',
      penColor: '#002169',
      minWidth: 1.5,
      maxWidth: 3,
    });
    padRef.current = pad;

    return () => {
      pad.off();
      padRef.current = null;
    };
  }, []);

  const handleClear = () => {
    padRef.current?.clear();
    setError(null);
  };

  const handleConfirm = async () => {
    if (!padRef.current || padRef.current.isEmpty()) {
      setError('Por favor, solicita al cliente que firme en el recuadro.');
      return;
    }
    if (!signerName.trim()) {
      setError('Indica el nombre de la persona que firma.');
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const dataUrl = padRef.current.toDataURL('image/png');
      await onSave(dataUrl, signerName.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error guardando la firma');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-charcoal/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-lg sm:rounded-lg shadow-elevated overflow-hidden">
        <div className="bg-navy text-white px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold">Conformidad y Firma del Cliente</h3>
            <p className="text-xs text-white/70">Firme dentro del recuadro con el dedo o lápiz</p>
          </div>
          <button onClick={onClose} className="p-1 text-white/80 hover:text-white" aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-dark-grey mb-1">
              Nombre del firmante
            </label>
            <input
              type="text"
              value={signerName}
              onChange={(e) => setSignerName(e.target.value)}
              placeholder="Ej. María López (Responsable)"
              className="w-full px-3 py-2.5 bg-bg-input border border-border text-charcoal focus:outline-none focus:ring-2 focus:ring-navy"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-dark-grey">Firma digital</span>
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex items-center gap-1 text-xs font-bold text-magenta hover:underline"
              >
                <Eraser size={14} /> Limpiar
              </button>
            </div>
            <div className="border-2 border-dashed border-navy/40 bg-white rounded-sm overflow-hidden touch-none">
              <canvas ref={canvasRef} className="w-full h-48 block cursor-crosshair" />
            </div>
          </div>

          {error && (
            <p className="text-xs font-semibold text-danger bg-danger/10 p-2.5 border-l-4 border-danger">
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="button" variant="accent" isLoading={isSaving} onClick={handleConfirm}>
              <Check size={16} /> Guardar firma
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
