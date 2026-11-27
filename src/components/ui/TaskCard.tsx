'use client';

import Link from 'next/link';
import { Camera, Clock, MapPin, Phone, User, Wrench, ChevronRight } from 'lucide-react';
import { PriorityBadge, StatusBadge } from './Badge';
import { getSlaStatus } from '@/lib/sla';
import { TASK_STATUS_META, type Task } from '@/types/database';

export function TaskCard({ task }: { task: Task }) {
  const statusColor = TASK_STATUS_META[task.status]?.borderHex || '#002169';
  const address = [task.site_address || task.customer?.address, task.site_city || task.customer?.city]
    .filter(Boolean)
    .join(', ');
  const phone = task.site_contact_phone || task.customer?.contact_phone;
  const mapsUrl = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;
  const sla = getSlaStatus(task);

  return (
    <div
      className="bg-white dark:bg-surface rounded-md shadow-card border border-border/60 overflow-hidden transition-transform active:scale-[0.99]"
      style={{ borderLeftWidth: '5px', borderLeftColor: statusColor }}
    >
      <Link href={`/tasks/${task.id}`} className="block p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-extrabold tracking-wider text-navy dark:text-sky-300 uppercase">
                {task.code}
              </span>
              {sla && (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-extrabold uppercase rounded-xs ${sla.badgeClass}`}
                >
                  <Clock size={10} /> {sla.shortLabel}
                </span>
              )}
              {(task.attachment_count ?? 0) > 0 && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-off-white dark:bg-bg-input text-mid-grey border border-border rounded-xs">
                  <Camera size={10} /> {task.attachment_count}
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-charcoal leading-snug mt-0.5">
              {task.customer?.name || 'Cliente'}
            </h3>
          </div>
          <PriorityBadge priority={task.priority} />
        </div>

        {task.equipment_ref && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-petrol dark:text-sky-300 mb-1.5">
            <Wrench size={13} className="flex-shrink-0" />
            <span className="truncate">{task.equipment_ref}</span>
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
            <ChevronRight size={16} className="text-navy dark:text-sky-300" />
          </div>
        </div>
      </Link>

      {/* Acciones rápidas en campo (1 toque) */}
      {(mapsUrl || phone) && (
        <div className="grid grid-cols-2 border-t border-border/70 bg-off-white/70 dark:bg-bg-input/60 divide-x divide-border/70">
          {mapsUrl ? (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-bold text-navy dark:text-slate-200 hover:bg-navy/5 dark:hover:bg-white/5 min-h-[44px]"
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
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 text-xs font-bold text-navy dark:text-slate-200 hover:bg-navy/5 dark:hover:bg-white/5 min-h-[44px]"
            >
              <Phone size={14} className="text-petrol dark:text-sky-300" />
              <span className="truncate">Llamar</span>
            </a>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
