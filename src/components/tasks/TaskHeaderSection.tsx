'use client';

import Link from 'next/link';
import {
  ArrowLeft,
  Clock,
  MapPin,
  Pencil,
  Phone,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { PriorityBadge, StatusBadge, TaskTypeBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { SlaInfo } from '@/lib/sla';
import {
  TASK_PRIORITY_META,
  type Profile,
  type Task,
  type TaskPriority,
  type TaskType,
} from '@/types/database';

interface TaskHeaderSectionProps {
  task: Task;
  taskType: TaskType;
  sla: SlaInfo | null;
  profile: Profile;
  isCoord: boolean;
  isDeleted: boolean;
  technicians: Profile[];
  fullAddress: string;
  phone: string | null | undefined;
  mapsUrl: string | null;
  onOpenEdit: () => void;
  onOpenDelete: () => void;
  onOpenStatusSheet: () => void;
  onSelfAssign: () => void;
  onChangeAssignee: (techId: string | null) => void;
  onChangePriority: (priority: TaskPriority) => void;
}

export function TaskHeaderSection({
  task,
  taskType,
  sla,
  profile,
  isCoord,
  isDeleted,
  technicians,
  fullAddress,
  phone,
  mapsUrl,
  onOpenEdit,
  onOpenDelete,
  onOpenStatusSheet,
  onSelfAssign,
  onChangeAssignee,
  onChangePriority,
}: TaskHeaderSectionProps) {
  return (
    <div className="bg-white rounded-md shadow-card p-5 border border-border/60">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-3">
          <Link
            href="/tasks"
            className="p-2 bg-off-white border border-border text-navy hover:bg-navy/5"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <span className="text-xs font-extrabold tracking-widest text-navy uppercase">
              {task.code}
            </span>
            <h1 className="text-lg sm:text-xl font-bold text-charcoal leading-tight">
              {task.customer?.name || 'Cliente'}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <TaskTypeBadge taskType={taskType} />
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          {sla && (
            <span
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-bold uppercase tracking-wide ${sla.badgeClass}`}
            >
              <Clock size={12} /> {sla.label}
            </span>
          )}
          {!isDeleted && (
            <>
              <button
                type="button"
                onClick={onOpenEdit}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold border border-navy text-navy hover:bg-navy/5 min-h-[34px]"
              >
                <Pencil size={13} /> Editar
              </button>
              <button
                type="button"
                onClick={onOpenDelete}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold border border-danger text-danger hover:bg-danger/5 min-h-[34px]"
              >
                <Trash2 size={13} /> Eliminar
              </button>
            </>
          )}
        </div>
      </div>

      {/* Acciones directas de campo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3 border-t border-border">
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 py-2.5 px-3 bg-off-white border border-border text-xs font-bold text-navy hover:bg-navy/5 min-h-[44px]"
          >
            <MapPin size={16} className="text-magenta" />
            <span className="truncate">{fullAddress}</span>
          </a>
        )}
        {phone && (
          <a
            href={`tel:${phone.replace(/\s+/g, '')}`}
            className="flex items-center justify-center gap-2 py-2.5 px-3 bg-off-white border border-border text-xs font-bold text-navy hover:bg-navy/5 min-h-[44px]"
          >
            <Phone size={16} className="text-petrol" />
            <span>{phone}</span>
          </a>
        )}
        {!isDeleted && (
          <button
            type="button"
            onClick={onOpenStatusSheet}
            className="flex items-center justify-center gap-2 py-2.5 px-3 bg-navy text-white text-xs font-bold uppercase tracking-wider hover:bg-navy-dark min-h-[44px]"
          >
            <Clock size={16} /> Cambiar Estado
          </button>
        )}
      </div>

      {/* Auto-asignarse si está pendiente sin técnico */}
      {!isDeleted && !task.assigned_to && profile.role === 'technician' && (
        <div className="mt-3 pt-3 border-t border-border">
          <Button variant="accent" size="sm" className="w-full" onClick={onSelfAssign}>
            <UserCheck size={16} /> Asignarme este parte
          </Button>
        </div>
      )}

      {/* Controles de coordinación (el select de Técnico debe ser el primer <select> del detalle) */}
      {!isDeleted && isCoord && (
        <div className="mt-4 pt-3 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase text-mid-grey mb-1">
              Técnico asignado
            </label>
            <select
              value={task.assigned_to || ''}
              onChange={(e) => onChangeAssignee(e.target.value || null)}
              className="w-full px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
            >
              <option value="">Sin asignar</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold uppercase text-mid-grey mb-1">
              Prioridad
            </label>
            <select
              value={task.priority}
              onChange={(e) => onChangePriority(e.target.value as TaskPriority)}
              className="w-full px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
            >
              {Object.entries(TASK_PRIORITY_META).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
