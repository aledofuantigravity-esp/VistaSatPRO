'use client';

import { useEffect } from 'react';
import { Building2, FileDown, ShieldCheck, X } from 'lucide-react';
import type { ReportPdfVariant } from '@/lib/report-analytics';

interface ReportPdfModalProps {
  taskCount: number;
  customerFilterLabel?: string;
  isSingleCustomer: boolean;
  generatingVariant: ReportPdfVariant | null;
  onClose: () => void;
  onSelectVariant: (variant: ReportPdfVariant) => Promise<void>;
}

export function ReportPdfModal({
  taskCount,
  customerFilterLabel,
  isSingleCustomer,
  generatingVariant,
  onClose,
  onSelectVariant,
}: ReportPdfModalProps) {
  const isBusy = Boolean(generatingVariant);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isBusy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isBusy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-charcoal/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => {
        if (!isBusy) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-pdf-modal-title"
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-lg sm:rounded-lg shadow-elevated overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-navy text-white px-5 py-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <FileDown size={18} className="text-magenta flex-shrink-0" />
            <h3 id="report-pdf-modal-title" className="text-sm font-bold truncate">
              Exportar Informe Operativo PDF ({taskCount} parte{taskCount === 1 ? '' : 's'})
            </h3>
          </div>
          <button
            type="button"
            disabled={isBusy}
            onClick={onClose}
            className="p-1 text-white/80 hover:text-white disabled:opacity-40"
            aria-label="Cerrar selector de informe PDF"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <p className="text-xs font-medium text-dark-grey">
            Selecciona qué versión del informe gráfico profesional deseas generar:
          </p>

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
                  ? 'Generando Informe Ejecutivo...'
                  : 'Informe Ejecutivo Interno'}
              </span>
              <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-magenta/10 text-magenta border border-magenta/30 rounded-xs">
                Completo
              </span>
            </div>
            <p className="text-xs text-mid-grey leading-relaxed">
              Incluye KPIs, cumplimiento SLA, gráficas de evolución y distribución, focos
              críticos abiertos, instalaciones y productos, repuestos con coste estimado,
              rendimiento técnico, top clientes y anexo detallado.
            </p>
          </button>

          <button
            type="button"
            disabled={isBusy}
            onClick={() => void onSelectVariant('client')}
            className="w-full text-left p-4 rounded-sm border-2 border-border hover:border-success hover:bg-emerald-50/40 transition-colors disabled:opacity-60 cursor-pointer space-y-1.5"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 text-sm font-extrabold text-navy">
                <Building2 size={16} className="text-success" />
                {generatingVariant === 'client'
                  ? 'Generando Informe para Cliente...'
                  : 'Informe de Servicio para Cliente'}
              </span>
              <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xs">
                Comercial
              </span>
            </div>
            <p className="text-xs text-mid-grey leading-relaxed">
              Dossier limpio y visual listo para entregar
              {isSingleCustomer && customerFilterLabel
                ? ` a ${customerFilterLabel}`
                : ' al cliente'}
              : resumen de servicio, gráficas, instalaciones/productos y actuaciones realizadas
              (sin costes internos, rendimiento técnico ni otros clientes).
            </p>
            {!isSingleCustomer && (
              <p className="text-[11px] font-semibold text-petrol">
                Consejo: filtra por un cliente concreto antes de exportar si quieres generar su
                dossier mensual individual.
              </p>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
