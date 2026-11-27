'use client';

import { useState } from 'react';
import { CheckCircle2, FileDown, PenTool } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { refreshSignedUrl } from '@/lib/data-service';
import type { Task, TaskType } from '@/types/database';

interface TaskClosureSectionProps {
  task: Task;
  taskType: TaskType;
  isDeleted: boolean;
  closeError: string | null;
  generatingPdf: boolean;
  onOpenSignature: () => void;
  onDownloadPdf: () => void;
  onCloseTask: () => void;
}

export function TaskClosureSection({
  task,
  taskType,
  isDeleted,
  closeError,
  generatingPdf,
  onOpenSignature,
  onDownloadPdf,
  onCloseTask,
}: TaskClosureSectionProps) {
  const [refreshedSig, setRefreshedSig] = useState<{
    originalUrl: string;
    freshUrl: string;
  } | null>(null);
  const [retriedSigUrl, setRetriedSigUrl] = useState<string | null>(null);

  const signatureUrl =
    refreshedSig && refreshedSig.originalUrl === task.client_signature_url
      ? refreshedSig.freshUrl
      : task.client_signature_url;

  const handleSignatureError = async () => {
    if (!task.client_signature_url || retriedSigUrl === task.client_signature_url) return;
    setRetriedSigUrl(task.client_signature_url);
    const fresh = await refreshSignedUrl(task.client_signature_url);
    if (fresh) {
      setRefreshedSig({ originalUrl: task.client_signature_url, freshUrl: fresh });
    }
  };

  return (
    <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-4">
      <h2 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2">
        <PenTool size={16} className="text-magenta" />{' '}
        {taskType === 'installation'
          ? 'Finalización de Instalación · Parte de Instalación PDF y Firma'
          : taskType === 'cxc_incident'
          ? 'Cierre de Incidencia CXC y Parte PDF'
          : taskType === 'task'
          ? 'Finalización de Tarea y Parte PDF'
          : 'Conformidad, Cierre y Parte PDF'}
      </h2>

      {signatureUrl && (
        <div className="p-3 bg-off-white border border-border inline-block">
          <p className="text-xs font-bold text-dark-grey mb-1">
            Firmado por: {task.signer_name || 'Cliente'}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={signatureUrl}
            alt="Firma cliente"
            onError={() => void handleSignatureError()}
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
          <Button type="button" variant="secondary" onClick={onOpenSignature}>
            <PenTool size={16} />{' '}
            {task.client_signature_url ? 'Actualizar Firma' : 'Firma Cliente'}
          </Button>
        )}

        <Button
          type="button"
          variant="primary"
          isLoading={generatingPdf}
          onClick={onDownloadPdf}
        >
          <FileDown size={16} />{' '}
          {generatingPdf
            ? 'Generando PDF...'
            : taskType === 'installation'
            ? 'Parte de Instalación (PDF)'
            : 'Descargar PDF'}
        </Button>

        {!isDeleted && task.status !== 'completed' && (
          <Button type="button" variant="accent" onClick={onCloseTask}>
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
  );
}
