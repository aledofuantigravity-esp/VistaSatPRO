import {
  TASK_PRIORITY_META,
  TASK_STATUS_META,
  type TaskPriority,
  type TaskStatus,
} from '@/types/database';

export function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = TASK_STATUS_META[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-bold uppercase tracking-wide ${meta.bgClass} ${meta.textClass}`}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: meta.color }}
      />
      {meta.label}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const meta = TASK_PRIORITY_META[priority];
  const isUrgent = priority === 'urgent';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-xs font-bold uppercase tracking-wide ${meta.bgClass} ${meta.textClass} ${
        isUrgent ? 'badge-urgent ring-1 ring-danger/40' : ''
      }`}
    >
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: meta.dotColor }}
      />
      {meta.label}
    </span>
  );
}
