'use client';

import { memo, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Calendar, Camera, Clock, MapPin, Phone, User, Wrench, ChevronRight } from 'lucide-react';
import { PriorityBadge, StatusBadge, TaskTypeBadge } from './Badge';
import { prefetchTaskDetail } from '@/lib/data-service';
import { getSlaStatus } from '@/lib/sla';
import { formatDateOnlyEs } from '@/lib/task-dates';
import {
  normalizeTaskStatus,
  resolveTaskType,
  TASK_STATUS_META,
  type Task,
} from '@/types/database';

interface TaskCardProps {
  task: Task;
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export const TaskCard = memo(function TaskCard({
  task,
  selectable = false,
  selected = false,
  onToggleSelect,
}: TaskCardProps) {
  const prefetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (prefetchTimerRef.current) {
        clearTimeout(prefetchTimerRef.current);
      }
    };
  }, []);

  const schedulePrefetch = () => {
    if (prefetchTimerRef.current) clearTimeout(prefetchTimerRef.current);
    prefetchTimerRef.current = setTimeout(() => {
      prefetchTaskDetail(task.id);
    }, 120);
  };

  const cancelPrefetch = () => {
    if (prefetchTimerRef.current) {
      clearTimeout(prefetchTimerRef.current);
      prefetchTimerRef.current = null;
    }
  };

  const statusColor = TASK_STATUS_META[normalizeTaskStatus(task.status)]?.borderHex || '#002169';
  const address = [task.site_address || task.customer?.address, task.site_city || task.customer?.city]
    .filter(Boolean)
    .join(', ');
  const phone = task.site_contact_phone || task.customer?.contact_phone;
  const mapsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;
  const sla = getSlaStatus(task);
  const taskType = resolveTaskType(task);

  return (
    <div
      data-testid="task-card"
      onMouseEnter={schedulePrefetch}
      onMouseLeave={cancelPrefetch}
      onFocus={schedulePrefetch}
      className={`bg-white rounded-md shadow-card border overflow-hidden transition-transform active:scale-[0.99] ${
        selected ? 'border-magenta ring-2 ring-magenta/40' : 'border-border/60'
      }`}
      style={{ borderLeftWidth: '5px', borderLeftColor: statusColor }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            {selectable && (
              <label
                className="inline-flex items-center justify-center w-6 h-6 mt-0.5 flex-shrink-0 bg-off-white border border-border rounded-xs cursor-pointer hover:border-navy"
                title={`Seleccionar ${task.code}`}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onToggleSelect?.()}
                  aria-label={`Seleccionar parte ${task.code}`}
                  className="accent-magenta w-4 h-4 cursor-pointer"
                />
              </label>
            )}

            <Link href={`/tasks/${task.id}`} className="min-w-0 flex-1 block">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-extrabold tracking-wider text-navy uppercase">
                  {task.code}
                </span>
                <TaskTypeBadge taskType={taskType} />
                {sla && (
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-extrabold uppercase rounded-xs ${sla.badgeClass}`}
                  >
                    <Clock size={10} /> {sla.shortLabel}
                  </span>
                )}
                {(task.attachment_count ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-off-white text-mid-grey border border-border rounded-xs">
                    <Camera size={10} /> {task.attachment_count}
                  </span>
                )}
              </div>
              <h3 className="text-base font-bold text-charcoal leading-snug mt-0.5 break-words">
                {task.customer?.name || 'Cliente'}
              </h3>
            </Link>
          </div>

          <Link
            href={`/tasks/${task.id}`}
            className="flex-shrink-0"
            data-testid="task-card-priority"
          >
            <PriorityBadge priority={task.priority} />
          </Link>
        </div>

        <Link href={`/tasks/${task.id}`} className="block">
          {taskType === 'installation' && task.scheduled_date && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-petrol mb-1">
              <Calendar size={13} className="flex-shrink-0" />
              <span>
                Acordada: {formatDateOnlyEs(task.scheduled_date, 'short')}
              </span>
            </div>
          )}

          {task.equipment_ref && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-petrol mb-1.5">
              <Wrench size={13} className="flex-shrink-0" />
              <span className="truncate">
                {task.equipment_ref}
                {taskType === 'cxc_incident' && task.equipment_sn ? ` · S/N ${task.equipment_sn}` : ''}
              </span>
            </div>
          )}

          <p className="text-sm text-dark-grey line-clamp-2 mb-3 leading-snug">
            {task.problem_desc}
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/70">
            <StatusBadge status={task.status} />

            <div className="flex items-center gap-3 text-xs text-mid-grey">
              <span className="inline-flex items-center gap-1">
                <User size={13} />
                {task.assignee ? task.assignee.full_name : 'Sin asignar'}
              </span>
              <ChevronRight size={16} className="text-navy" />
            </div>
          </div>
        </Link>
      </div>

      {/* Acciones rápidas en campo (1 toque) */}
      {(mapsUrl || phone) && (
        <div className="grid grid-cols-2 border-t border-border/70 bg-off-white/70 divide-x divide-border/70">
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-bold text-navy hover:bg-navy/5 min-h-[44px]"
            >
              <MapPin size={14} className="text-magenta" />
              <span className="truncate">Abrir Maps</span>
            </a>
          ) : (
            <span />
          )}
          {phone ? (
            <a
              href={`tel:${phone.replace(/\s+/g, '')}`}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-bold text-navy hover:bg-navy/5 min-h-[44px]"
            >
              <Phone size={14} className="text-petrol" />
              <span className="truncate">Llamar</span>
            </a>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
});
