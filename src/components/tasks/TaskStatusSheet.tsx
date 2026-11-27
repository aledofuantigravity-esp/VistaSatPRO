'use client';

import { X } from 'lucide-react';
import { TASK_STATUS_META, type TaskStatus } from '@/types/database';

interface TaskStatusSheetProps {
  currentStatus: TaskStatus;
  onClose: () => void;
  onSelectStatus: (status: TaskStatus) => void;
}

export function TaskStatusSheet({
  currentStatus,
  onClose,
  onSelectStatus,
}: TaskStatusSheetProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-charcoal/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-lg sm:rounded-lg p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <h3 className="text-base font-bold text-charcoal">Actualizar Estado del Parte</h3>
          <button type="button" onClick={onClose} className="p-1 text-mid-grey">
            <X size={20} />
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {(Object.keys(TASK_STATUS_META) as TaskStatus[]).map((st) => {
            const meta = TASK_STATUS_META[st];
            const isCurrent = currentStatus === st;
            return (
              <button
                key={st}
                type="button"
                onClick={() => onSelectStatus(st)}
                className={`flex items-center justify-between px-4 py-3 border text-sm font-bold min-h-[48px] transition-colors ${
                  isCurrent
                    ? 'border-navy bg-navy/5 text-navy'
                    : 'border-border bg-white text-charcoal hover:bg-off-white'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: meta.color }}
                  />
                  {meta.label}
                </span>
                {isCurrent && <span className="text-xs text-magenta">Actual</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
