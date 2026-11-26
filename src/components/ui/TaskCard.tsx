'use client';

import Link from 'next/link';
import { MapPin, Phone, User, Wrench, ChevronRight } from 'lucide-react';
import { PriorityBadge, StatusBadge } from './Badge';
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

  return (
    <div
      className="bg-white rounded-md shadow-card border border-border/60 overflow-hidden transition-transform active:scale-[0.99]"
      style={{ borderLeftWidth: '5px', borderLeftColor: statusColor }}
    >
      <Link href={`/tasks/${task.id}`} className="block p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <div>
            <span className="text-xs font-extrabold tracking-wider text-navy uppercase">
              {task.code}
            </span>
            <h3 className="text-base font-bold text-charcoal leading-snug mt-0.5">
              {task.customer?.name || 'Cliente'}
            </h3>
          </div>
          <PriorityBadge priority={task.priority} />
        </div>

        {task.equipment_ref && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-petrol mb-1.5">
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
            <ChevronRight size={16} className="text-navy" />
          </div>
        </div>
      </Link>

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
}
