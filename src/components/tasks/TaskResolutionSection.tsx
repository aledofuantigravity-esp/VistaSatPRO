'use client';

import type { RefObject } from 'react';
import { CheckCircle2, FileCheck2, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { getLastResolutionAudit } from '@/lib/task-notes';
import type { Task, TaskHistoryItem } from '@/types/database';

interface TaskResolutionSectionProps {
  task: Task;
  history: TaskHistoryItem[];
  draftValue: string;
  saving: boolean;
  error: string | null;
  isDeleted: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  onChangeDraft: (val: string) => void;
  onSave: () => Promise<void>;
}

export function TaskResolutionSection({
  task,
  history,
  draftValue,
  saving,
  error,
  isDeleted,
  textareaRef,
  onChangeDraft,
  onSave,
}: TaskResolutionSectionProps) {
  const hasSaved = Boolean(task.resolution?.trim());
  const audit = getLastResolutionAudit(task, history);
  const isDirty = draftValue.trim() !== (task.resolution || '').trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave();
  };

  return (
    <section
      aria-labelledby="task-resolution-heading"
      className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="task-resolution-heading"
          className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2"
        >
          <FileCheck2 size={16} className="text-magenta" /> Resolución
        </h2>

        {hasSaved ? (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xs">
            <CheckCircle2 size={12} /> Registrada
          </span>
        ) : (
          <span className="px-2 py-0.5 text-[11px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-300 rounded-xs">
            Obligatoria al cerrar
          </span>
        )}
      </div>

      {audit && (
        <p className="text-[11px] font-medium text-mid-grey">
          Última actualización por <strong className="text-charcoal">{audit.authorName}</strong> el{' '}
          {new Date(audit.updatedAt).toLocaleString('es-ES', {
            dateStyle: 'short',
            timeStyle: 'short',
          })}
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="p-3 bg-danger/10 border-l-4 border-danger text-xs font-bold text-danger"
        >
          {error}
        </div>
      )}

      {isDeleted ? (
        <div className="p-3 bg-off-white border border-border text-sm text-charcoal whitespace-pre-wrap">
          {task.resolution?.trim() || 'Sin resolución registrada.'}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            ref={textareaRef}
            rows={3}
            value={draftValue}
            onChange={(e) => onChangeDraft(e.target.value)}
            placeholder="Describe la resolución aplicada al problema (obligatorio para cerrar el parte)..."
            aria-label="Resolución del problema"
            className={`w-full px-3 py-2.5 bg-bg-input border text-sm text-charcoal focus:outline-none focus:ring-2 ${
              error
                ? 'border-danger focus:ring-danger'
                : 'border-border focus:ring-navy'
            }`}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="submit"
              size="sm"
              isLoading={saving}
              disabled={!isDirty && hasSaved}
            >
              <Save size={14} /> Guardar resolución
            </Button>
            {isDirty && draftValue.trim() && (
              <span className="text-[11px] text-mid-grey">
                Hay cambios sin guardar (se guardarán también al cerrar el parte).
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  );
}
