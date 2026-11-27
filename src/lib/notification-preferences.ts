import type {
  NotificationEventKey,
  NotificationLevel,
  NotificationPreferences,
  NotificationType,
  Profile,
  Task,
  TaskPriority,
  TaskType,
  UserRole,
} from '@/types/database';

export const NOTIFICATION_EVENT_META: Array<{
  key: NotificationEventKey;
  label: string;
  description: string;
}> = [
  {
    key: 'task_created',
    label: 'Nueva tarea / parte creado',
    description: 'Cuando se da de alta una instalación, incidencia RMA/CXC o tarea.',
  },
  {
    key: 'task_assigned',
    label: 'Asignación o reasignación',
    description: 'Cuando se te asigna un parte o cambia el técnico responsable.',
  },
  {
    key: 'comment_added',
    label: 'Mensajes en el chat interno',
    description: 'Nuevos comentarios o notas añadidas dentro de un parte.',
  },
  {
    key: 'status_changed',
    label: 'Cambios de estado',
    description: 'En camino, en curso, en espera, completado o cancelado.',
  },
  {
    key: 'priority_changed',
    label: 'Cambios de prioridad',
    description: 'Subidas o bajadas de urgencia (p. ej. paso a Alta o Urgente).',
  },
  {
    key: 'task_updated',
    label: 'Actualizaciones técnicas y archivos',
    description: 'Fecha acordada, cotejo, fotos, pedidos PDF, firma, contadores o papelera.',
  },
  {
    key: 'sla_alert',
    label: 'Alertas y recordatorios SLA',
    description: 'Avisos diarios de partes que vencen hoy o tienen el plazo vencido.',
  },
];

export type NotificationPresetId =
  | 'technician_standard'
  | 'coordinator_ops'
  | 'urgent_only'
  | 'muted';

export const NOTIFICATION_PRESETS: Array<{
  id: NotificationPresetId;
  label: string;
  description: string;
  build: () => NotificationPreferences;
}> = [
  {
    id: 'technician_standard',
    label: 'Técnico Estándar',
    description: 'Asignados y sin asignar. Push en asignaciones, chat y SLA.',
    build: () => buildDefaultByRole('technician', 'assigned_or_created'),
  },
  {
    id: 'coordinator_ops',
    label: 'Coordinación Completa',
    description: 'Todo el equipo en app; Push en altas sin asignar, chat, urgencias y SLA.',
    build: () => buildDefaultByRole('coordinator', 'all'),
  },
  {
    id: 'urgent_only',
    label: 'Solo Urgencias',
    description: 'In-App para prioridad Alta/Urgente y Push únicamente si es Urgente o SLA.',
    build: () => ({
      scope: 'all',
      include_unassigned_new_tasks: true,
      include_created_by_me: true,
      in_app_enabled: true,
      push_enabled: true,
      events: {
        task_created: { in_app: true, push: true },
        task_assigned: { in_app: true, push: true },
        comment_added: { in_app: true, push: false },
        status_changed: { in_app: false, push: false },
        priority_changed: { in_app: true, push: true },
        task_updated: { in_app: false, push: false },
        sla_alert: { in_app: true, push: true },
      },
      task_types: {
        installation: true,
        rma_incident: true,
        cxc_incident: true,
        task: true,
      },
      min_priority_in_app: 'high',
      min_priority_push: 'urgent',
      quiet_hours: {
        enabled: false,
        start: '21:00',
        end: '08:00',
        allow_urgent_override: true,
      },
      allow_user_override: false,
    }),
  },
  {
    id: 'muted',
    label: 'Silenciado',
    description: 'Desactiva todos los avisos In-App y Push temporalmente sin dar de baja.',
    build: () => ({
      ...buildDefaultByRole('technician', 'none'),
      scope: 'none',
      in_app_enabled: false,
      push_enabled: false,
      events: {
        task_created: { in_app: false, push: false },
        task_assigned: { in_app: false, push: false },
        comment_added: { in_app: false, push: false },
        status_changed: { in_app: false, push: false },
        priority_changed: { in_app: false, push: false },
        task_updated: { in_app: false, push: false },
        sla_alert: { in_app: false, push: false },
      },
    }),
  },
];

const PRIORITY_RANK: Record<TaskPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  urgent: 3,
};

function buildDefaultByRole(
  role: UserRole,
  legacyLevel: NotificationLevel
): NotificationPreferences {
  const isCoordOrAdmin = role === 'admin' || role === 'coordinator';

  const scope: NotificationPreferences['scope'] =
    legacyLevel === 'none'
      ? 'none'
      : legacyLevel === 'all'
      ? 'all'
      : 'assigned_or_created';

  const enabled = scope !== 'none';

  return {
    scope,
    include_unassigned_new_tasks: true,
    include_created_by_me: true,
    in_app_enabled: enabled,
    push_enabled: enabled,
    events: {
      task_created: { in_app: enabled, push: enabled },
      task_assigned: { in_app: enabled, push: enabled },
      comment_added: { in_app: enabled, push: enabled },
      status_changed: { in_app: enabled, push: isCoordOrAdmin ? false : enabled },
      priority_changed: { in_app: enabled, push: enabled },
      task_updated: { in_app: enabled, push: false },
      sla_alert: { in_app: enabled, push: enabled },
    },
    task_types: {
      installation: true,
      rma_incident: true,
      cxc_incident: true,
      task: true,
    },
    min_priority_in_app: 'low',
    min_priority_push: 'low',
    quiet_hours: {
      enabled: false,
      start: '21:00',
      end: '08:00',
      allow_urgent_override: true,
    },
    allow_user_override: false,
  };
}

export function getDefaultNotificationPreferences(
  role: UserRole = 'technician',
  legacyLevel: NotificationLevel = 'assigned_or_created'
): NotificationPreferences {
  return buildDefaultByRole(role, legacyLevel);
}

/**
 * Normaliza un objeto parcial de preferencias asegurando que todas las claves existen.
 */
export function normalizeNotificationPreferences(
  raw: Partial<NotificationPreferences> | null | undefined,
  role: UserRole = 'technician',
  legacyLevel: NotificationLevel = 'assigned_or_created'
): NotificationPreferences {
  const base = buildDefaultByRole(role, legacyLevel);
  if (!raw || typeof raw !== 'object') return base;

  const events = { ...base.events };
  if (raw.events && typeof raw.events === 'object') {
    for (const meta of NOTIFICATION_EVENT_META) {
      const candidate = raw.events[meta.key];
      if (candidate && typeof candidate === 'object') {
        events[meta.key] = {
          in_app:
            typeof candidate.in_app === 'boolean'
              ? candidate.in_app
              : base.events[meta.key].in_app,
          push:
            typeof candidate.push === 'boolean'
              ? candidate.push
              : base.events[meta.key].push,
        };
      }
    }
  }

  return {
    scope:
      raw.scope === 'all' ||
      raw.scope === 'assigned_or_created' ||
      raw.scope === 'assigned_only' ||
      raw.scope === 'none'
        ? raw.scope
        : base.scope,
    include_unassigned_new_tasks:
      typeof raw.include_unassigned_new_tasks === 'boolean'
        ? raw.include_unassigned_new_tasks
        : base.include_unassigned_new_tasks,
    include_created_by_me:
      typeof raw.include_created_by_me === 'boolean'
        ? raw.include_created_by_me
        : base.include_created_by_me,
    in_app_enabled:
      typeof raw.in_app_enabled === 'boolean'
        ? raw.in_app_enabled
        : base.in_app_enabled,
    push_enabled:
      typeof raw.push_enabled === 'boolean'
        ? raw.push_enabled
        : base.push_enabled,
    events,
    task_types: {
      installation:
        typeof raw.task_types?.installation === 'boolean'
          ? raw.task_types.installation
          : base.task_types.installation,
      rma_incident:
        typeof raw.task_types?.rma_incident === 'boolean'
          ? raw.task_types.rma_incident
          : base.task_types.rma_incident,
      cxc_incident:
        typeof raw.task_types?.cxc_incident === 'boolean'
          ? raw.task_types.cxc_incident
          : base.task_types.cxc_incident,
      task:
        typeof raw.task_types?.task === 'boolean'
          ? raw.task_types.task
          : base.task_types.task,
    },
    min_priority_in_app:
      raw.min_priority_in_app && raw.min_priority_in_app in PRIORITY_RANK
        ? raw.min_priority_in_app
        : base.min_priority_in_app,
    min_priority_push:
      raw.min_priority_push && raw.min_priority_push in PRIORITY_RANK
        ? raw.min_priority_push
        : base.min_priority_push,
    quiet_hours: {
      enabled:
        typeof raw.quiet_hours?.enabled === 'boolean'
          ? raw.quiet_hours.enabled
          : base.quiet_hours.enabled,
      start:
        typeof raw.quiet_hours?.start === 'string' &&
        /^\d{2}:\d{2}$/.test(raw.quiet_hours.start)
          ? raw.quiet_hours.start
          : base.quiet_hours.start,
      end:
        typeof raw.quiet_hours?.end === 'string' &&
        /^\d{2}:\d{2}$/.test(raw.quiet_hours.end)
          ? raw.quiet_hours.end
          : base.quiet_hours.end,
      allow_urgent_override:
        typeof raw.quiet_hours?.allow_urgent_override === 'boolean'
          ? raw.quiet_hours.allow_urgent_override
          : base.quiet_hours.allow_urgent_override,
    },
    allow_user_override:
      typeof raw.allow_user_override === 'boolean'
        ? raw.allow_user_override
        : base.allow_user_override,
  };
}

/**
 * Mantiene sincronizada la columna clásica `notification_level` a partir del nuevo modelo.
 */
export function syncLegacyNotificationLevel(
  prefs: NotificationPreferences
): NotificationLevel {
  if (
    prefs.scope === 'none' ||
    (!prefs.in_app_enabled && !prefs.push_enabled)
  ) {
    return 'none';
  }
  if (prefs.scope === 'all') {
    return 'all';
  }
  return 'assigned_or_created';
}

export function mapNotificationTypeToEventKey(
  type: NotificationType
): NotificationEventKey {
  if (type === 'reassigned') return 'task_assigned';
  return type;
}

function getMadridMinutesOfDay(now: Date): number {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  const [hStr, mStr] = formatted.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

function parseMinutes(hhmm: string): number {
  const [hStr, mStr] = hhmm.split(':');
  return Number(hStr) * 60 + Number(mStr);
}

export function isWithinQuietHours(
  quiet: NotificationPreferences['quiet_hours'],
  now = new Date()
): boolean {
  if (!quiet.enabled) return false;
  const currentMin = getMadridMinutesOfDay(now);
  const startMin = parseMinutes(quiet.start);
  const endMin = parseMinutes(quiet.end);
  if (startMin === endMin) return false;
  // Rango nocturno que cruza medianoche (ej. 21:00 -> 08:00)
  if (startMin > endMin) {
    return currentMin >= startMin || currentMin < endMin;
  }
  // Rango diurno en el mismo día (ej. 14:00 -> 16:00)
  return currentMin >= startMin && currentMin < endMin;
}

export interface NotificationDeliveryDecision {
  inApp: boolean;
  push: boolean;
}

/**
 * Motor unificado de evaluación de entrega (In-App y Web Push) por usuario.
 */
export function evaluateUserNotificationDelivery(params: {
  recipient: Pick<
    Profile,
    'id' | 'role' | 'is_active' | 'notification_level' | 'notification_preferences'
  >;
  actorId: string;
  task: Pick<Task, 'assigned_to' | 'created_by' | 'priority' | 'task_type'>;
  eventType: NotificationType;
  isNewTask?: boolean;
  now?: Date;
}): NotificationDeliveryDecision {
  const { recipient, actorId, task, eventType, isNewTask, now } = params;

  // 1. Reglas absolutas: nunca autonotificar y nunca a usuarios desactivados
  if (!recipient.is_active || recipient.id === actorId) {
    return { inApp: false, push: false };
  }

  const prefs = normalizeNotificationPreferences(
    recipient.notification_preferences,
    recipient.role,
    recipient.notification_level
  );

  if (prefs.scope === 'none' || (!prefs.in_app_enabled && !prefs.push_enabled)) {
    return { inApp: false, push: false };
  }

  // 2. Comprobar ámbito del parte
  const isAssignedToUser = task.assigned_to === recipient.id;
  const isCreatedByUser = task.created_by === recipient.id;
  const isUnassignedNewForTech =
    Boolean(isNewTask) &&
    !task.assigned_to &&
    recipient.role === 'technician' &&
    prefs.include_unassigned_new_tasks;
  const isUnassignedForCoord =
    Boolean(isNewTask) &&
    !task.assigned_to &&
    (recipient.role === 'admin' || recipient.role === 'coordinator') &&
    prefs.include_unassigned_new_tasks;

  let matchesScope = false;
  if (prefs.scope === 'all') {
    matchesScope = true;
  } else if (prefs.scope === 'assigned_or_created') {
    matchesScope =
      isAssignedToUser ||
      (prefs.include_created_by_me && isCreatedByUser) ||
      isUnassignedNewForTech ||
      isUnassignedForCoord;
  } else if (prefs.scope === 'assigned_only') {
    matchesScope = isAssignedToUser || isUnassignedNewForTech;
  }

  if (!matchesScope) {
    return { inApp: false, push: false };
  }

  // 3. Comprobar filtro de tipo de tarea
  const taskType: TaskType = task.task_type || 'rma_incident';
  if (!prefs.task_types[taskType]) {
    return { inApp: false, push: false };
  }

  // 4. Comprobar evento y prioridad mínima por canal
  const eventKey = mapNotificationTypeToEventKey(eventType);
  const eventToggle = prefs.events[eventKey];
  const taskRank = PRIORITY_RANK[task.priority || 'medium'];

  const inAppAllowed =
    prefs.in_app_enabled &&
    eventToggle.in_app &&
    taskRank >= PRIORITY_RANK[prefs.min_priority_in_app];

  let pushAllowed =
    prefs.push_enabled &&
    eventToggle.push &&
    taskRank >= PRIORITY_RANK[prefs.min_priority_push];

  // 5. Comprobar horario silencioso para Push
  if (pushAllowed && isWithinQuietHours(prefs.quiet_hours, now)) {
    const canBypassUrgent =
      prefs.quiet_hours.allow_urgent_override && task.priority === 'urgent';
    if (!canBypassUrgent) {
      pushAllowed = false;
    }
  }

  return { inApp: inAppAllowed, push: pushAllowed };
}

/**
 * Genera badges breves para mostrar el resumen de notificaciones en la ficha del usuario (/users).
 */
export function summarizeNotificationPreferences(
  profile: Pick<Profile, 'role' | 'notification_level' | 'notification_preferences'>
): {
  scopeLabel: string;
  pushLabel: string;
  extraBadges: string[];
  isMuted: boolean;
} {
  const prefs = normalizeNotificationPreferences(
    profile.notification_preferences,
    profile.role,
    profile.notification_level
  );

  if (prefs.scope === 'none' || (!prefs.in_app_enabled && !prefs.push_enabled)) {
    return {
      scopeLabel: 'Silenciado',
      pushLabel: 'Sin avisos',
      extraBadges: [],
      isMuted: true,
    };
  }

  const scopeLabel =
    prefs.scope === 'all'
      ? 'Todos los partes'
      : prefs.scope === 'assigned_only'
      ? 'Solo asignados'
      : 'Asignados o creados';

  const activePushCount = Object.values(prefs.events).filter((e) => e.push).length;
  const pushLabel = !prefs.push_enabled || activePushCount === 0
    ? 'Push apagado'
    : prefs.min_priority_push === 'urgent'
    ? 'Push: Solo Urgentes'
    : prefs.min_priority_push === 'high'
    ? 'Push: Alta+'
    : `Push: ${activePushCount}/7 eventos`;

  const extraBadges: string[] = [];
  if (prefs.quiet_hours.enabled) {
    extraBadges.push(`DND ${prefs.quiet_hours.start}-${prefs.quiet_hours.end}`);
  }
  const enabledTypes = Object.values(prefs.task_types).filter(Boolean).length;
  if (enabledTypes < 4) {
    extraBadges.push(`${enabledTypes}/4 tipos`);
  }

  return {
    scopeLabel,
    pushLabel,
    extraBadges,
    isMuted: false,
  };
}
