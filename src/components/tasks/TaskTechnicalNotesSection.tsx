'use client';

import { useMemo, useState } from 'react';
import { ClipboardList, Send } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import {
  extractTechnicalNotes,
  type TechnicalNoteEntry,
} from '@/lib/task-notes';
import type { Task, TaskHistoryItem, TaskType } from '@/types/database';

interface TaskTechnicalNotesSectionProps {
  task: Task;
  taskType: TaskType;
  history: TaskHistoryItem[];
  pendingOfflineNotes: TechnicalNoteEntry[];
  isDeleted: boolean;
  onAddNote: (noteText: string) => Promise<void>;
}

export function TaskTechnicalNotesSection({
  task,
  taskType,
  history,
  pendingOfflineNotes,
  isDeleted,
  onAddNote,
}: TaskTechnicalNotesSectionProps) {
  const [noteInput, setNoteInput] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const notes = useMemo(
    () => extractTechnicalNotes(task, history, pendingOfflineNotes),
    [task, history, pendingOfflineNotes]
  );

  const placeholder =
    taskType === 'installation'
      ? 'Anota incidencias durante la instalación o comentarios técnicos...'
      : taskType === 'task'
      ? 'Añade avances técnicos o incidencias de la tarea...'
      : 'Añade diagnóstico, actuaciones o incidencias técnicas...';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = noteInput.trim();
    if (!clean) return;
    setSavingNote(true);
    try {
      await onAddNote(clean);
      setNoteInput('');
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <section
      aria-labelledby="technical-notes-heading"
      className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="technical-notes-heading"
          className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2"
        >
          <ClipboardList size={16} className="text-magenta" /> Notas Técnicas e Incidencias (
          {notes.length})
        </h2>
        <span className="text-[11px] font-semibold text-mid-grey">
          Más reciente primero
        </span>
      </div>

      {!isDeleted && (
        <form onSubmit={handleSubmit} className="space-y-2">
          <textarea
            rows={3}
            value={noteInput}
            onChange={(e) => setNoteInput(e.target.value)}
            placeholder={placeholder}
            aria-label="Nueva nota técnica o incidencia"
            className="w-full px-3 py-2.5 bg-bg-input border border-border text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-navy"
          />
          <Button type="submit" size="sm" isLoading={savingNote} disabled={!noteInput.trim()}>
            <Send size={14} /> Guardar nota
          </Button>
        </form>
      )}

      {notes.length === 0 ? (
        <p className="text-xs text-mid-grey italic">
          Sin notas técnicas ni incidencias registradas todavía.
        </p>
      ) : (
        <ul className="space-y-2.5" aria-label="Listado de notas técnicas e incidencias">
          {notes.map((entry, idx) => (
            <li
              key={entry.id}
              data-testid="technical-note-item"
              className={`p-3 rounded-sm border ${
                idx === 0
                  ? 'bg-navy/[0.04] border-navy/25 border-l-4 border-l-navy'
                  : 'bg-off-white border-border'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-extrabold text-navy truncate">
                    {entry.authorName}
                  </span>
                  {entry.pendingSync && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300 rounded-xs">
                      Pendiente de sincronizar
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-semibold text-mid-grey">
                  {new Date(entry.createdAt).toLocaleString('es-ES', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
              <p className="text-sm text-charcoal whitespace-pre-wrap leading-relaxed break-words">
                {entry.text}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
