'use client';

import { Building2, FileDown, ShieldCheck, X } from 'lucide-react';
import type { PdfVariant } from '@/lib/pdf-helpers';

interface PdfExportModalProps {
  taskCode: string;
  generatingVariant: PdfVariant | null;
  onClose: () => void;
  onSelectVariant: (variant: PdfVariant) => Promise<void>;
}

export function PdfExportModal({
  taskCode,
  generatingVariant,
  onClose,
  onSelectVariant,
}: PdfExportModalProps) {
  const isBusy = Boolean(generatingVariant);

  return (
    <div
      className="fixed inset-0 z-50 bg-charcoal/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => {
        if (!isBusy) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-export-title"
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-lg sm:rounded-lg shadow-elevated overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-navy text-white px-5 py-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileDown size={18} className="text-magenta flex-shrink-0" />
            <h3 id="pdf-export-title" className="text-sm font-bold truncate">
              Descargar Parte en PDF · {taskCode}
            </h3>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            className="p-1 text-white/80 hover:text-white disabled:opacity-40"
            aria-label="Cerrar selector de PDF"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs font-medium text-dark-grey">
            Selecciona qué versión del documento PDF deseas generar y descargar:
          </p>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => void onSelectVariant('client')}
            className="w-full text-left p-4 rounded-sm border-2 border-border hover:border-success hover:bg-emerald-50/40 transition-colors disabled:opacity-60 cursor-pointer space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-extrabold text-navy">
                <Building2 size={16} className="text-success" />
                {generatingVariant === 'client' ? 'Generando PDF Cliente...' : 'PDF para Cliente'}
              </span>
              <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xs">
                Comercial
              </span>
            </div>
            <p className="text-xs text-mid-grey leading-relaxed">
              Copia limpia lista para entregar al cliente: cliente, equipo, avería o solicitud,
              resolución, materiales, fotografías, parte físico y firma (sin notas ni historial
              interno).
            </p>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => void onSelectVariant('internal')}
            className="w-full text-left p-4 rounded-sm border-2 border-border hover:border-navy hover:bg-navy/[0.03] transition-colors disabled:opacity-60 cursor-pointer space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-extrabold text-navy">
                <ShieldCheck size={16} className="text-magenta" />
                {generatingVariant === 'internal'
                  ? 'Generando PDF Interno...'
                  : 'PDF Interno (Completo)'}
              </span>
              <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-navy/10 text-navy border border-navy/25 rounded-xs">
                Uso Interno SAT
              </span>
            </div>
            <p className="text-xs text-mid-grey leading-relaxed">
              Informe completo del servicio técnico: incluye todo lo anterior más{' '}
              <strong>Notas Técnicas e Incidencias</strong>, SLA, tiempos de actuación e{' '}
              <strong>Historial Cronológico completo</strong>.
            </p>
          </button>

          <div className="pt-2 border-t border-border flex justify-end">
            <button
              type="button"
              disabled={isBusy}
              onClick={onClose}
              className="text-xs font-bold text-mid-grey hover:text-charcoal px-2 py-1 disabled:opacity-40"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
