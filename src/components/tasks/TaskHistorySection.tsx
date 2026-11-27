'use client';

import { History } from 'lucide-react';
import {
  getTaskStatusLabel,
  TASK_PRIORITY_META,
  type TaskHistoryItem,
  type TaskPriority,
} from '@/types/database';

export function TaskHistorySection({ history }: { history: TaskHistoryItem[] }) {
  return (
    <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-4">
      <h2 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2">
        <History size={16} className="text-magenta" /> Historial Cronológico Inmutable (
        {history.length})
      </h2>

      <div className="relative pl-5 border-l-2 border-navy/20 space-y-4">
        {history.map((item) => {
          const isDeletedEv = item.event_type === 'deleted';
          const isRestoredEv = item.event_type === 'restored';
          const isFieldEv = item.event_type === 'field_updated';
          const dotClass = isDeletedEv
            ? 'bg-danger'
            : isRestoredEv
            ? 'bg-emerald-600'
            : isFieldEv
            ? 'bg-amber-500'
            : 'bg-navy';

          return (
            <div key={item.id} className="relative">
              <span
                className={`absolute -left-[25px] top-1 w-3 h-3 rounded-full ${dotClass} border-2 border-white`}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-charcoal">
                    {item.actor?.full_name || 'Sistema'}
                  </span>
                  {isDeletedEv && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-danger/10 text-danger border border-danger/30">
                      Eliminado
                    </span>
                  )}
                  {isRestoredEv && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Restaurado
                    </span>
                  )}
                  {isFieldEv && (
                    <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-amber-100 text-amber-800 border border-amber-300">
                      Modificado
                    </span>
                  )}
                </div>
                <span className="text-[11px] font-medium text-mid-grey">
                  {new Date(item.created_at).toLocaleString('es-ES', {
                    dateStyle: 'short',
                    timeStyle: 'medium',
                  })}
                </span>
              </div>
              <p
                className={`text-xs mt-0.5 leading-relaxed ${
                  isDeletedEv
                    ? 'text-danger font-semibold'
                    : isRestoredEv
                    ? 'text-emerald-800 font-semibold'
                    : 'text-dark-grey'
                }`}
              >
                {item.note ? (
                  item.note
                ) : item.event_type === 'status_changed' ? (
                  <>
                    Estado: <strong>{getTaskStatusLabel(item.old_value)}</strong> →{' '}
                    <strong className="text-navy">
                      {getTaskStatusLabel(item.new_value)}
                    </strong>
                  </>
                ) : item.event_type === 'priority_changed' ? (
                  <>
                    Prioridad:{' '}
                    <strong>
                      {TASK_PRIORITY_META[item.old_value as TaskPriority]?.label ||
                        item.old_value}
                    </strong>{' '}
                    →{' '}
                    <strong className="text-navy">
                      {TASK_PRIORITY_META[item.new_value as TaskPriority]?.label ||
                        item.new_value}
                    </strong>
                  </>
                ) : (
                  `${item.event_type}: ${item.old_value ? `${item.old_value} → ` : ''}${
                    item.new_value || ''
                  }`
                )}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
