// Tipos de dominio y base de datos para VistaSatPRO

export type UserRole = 'admin' | 'coordinator' | 'technician';

export type NotificationLevel = 'all' | 'assigned_or_created' | 'none';

export type NotificationScope = 'all' | 'assigned_or_created' | 'assigned_only' | 'none';

export type NotificationEventKey =
  | 'task_created'
  | 'task_assigned'
  | 'comment_added'
  | 'status_changed'
  | 'priority_changed'
  | 'task_updated'
  | 'sla_alert';

export interface ChannelToggle {
  in_app: boolean;
  push: boolean;
}

export interface NotificationPreferences {
  scope: NotificationScope;
  include_unassigned_new_tasks: boolean;
  include_created_by_me: boolean;
  in_app_enabled: boolean;
  push_enabled: boolean;
  events: Record<NotificationEventKey, ChannelToggle>;
  task_types: Record<TaskType, boolean>;
  min_priority_in_app: TaskPriority;
  min_priority_push: TaskPriority;
  quiet_hours: {
    enabled: boolean;
    start: string;
    end: string;
    allow_urgent_override: boolean;
  };
  allow_user_override: boolean;
}

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

export type TaskType = 'installation' | 'rma_incident' | 'cxc_incident' | 'task';

export type AttachmentKind = 'photo' | 'installation_order';

export type TaskStatus =
  | 'pending'
  | 'assigned'
  | 'en_route'
  | 'in_progress'
  | 'on_hold'
  | 'completed'
  | 'cancelled';

export type TaskHistoryEventType =
  | 'created'
  | 'status_changed'
  | 'priority_changed'
  | 'assigned'
  | 'reassigned'
  | 'note_added'
  | 'attachment_added'
  | 'signature_captured'
  | 'pdf_generated'
  | 'field_updated'
  | 'deleted'
  | 'restored';

export type NotificationType =
  | 'task_created'
  | 'task_assigned'
  | 'task_updated'
  | 'status_changed'
  | 'priority_changed'
  | 'comment_added'
  | 'reassigned'
  | 'sla_alert';

export interface MaterialItem {
  id: string;
  name: string;
  ref?: string;
  qty: number;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  role: UserRole;
  notification_level: NotificationLevel;
  notification_preferences?: NotificationPreferences | null;
  is_active: boolean;
  is_online?: boolean;
  last_seen_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  tax_id: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  code: string;
  task_type?: TaskType;
  customer_id: string;
  site_contact_name: string | null;
  site_contact_phone: string | null;
  site_address: string | null;
  site_city: string | null;
  equipment_ref: string | null;
  equipment_sn: string | null;
  problem_desc: string;
  priority: TaskPriority;
  status: TaskStatus;
  assigned_to: string | null;
  assigned_at: string | null;
  resolution_notes: string | null;
  materials_used: MaterialItem[];
  client_signature_url: string | null;
  signer_name: string | null;
  pdf_url: string | null;
  completed_at: string | null;
  estimated_duration: number | null;
  due_date?: string | null;
  // Campos específicos por tipo de tarea
  scheduled_date?: string | null;
  merchandise_check_done?: boolean | null;
  merchandise_check_notes?: string | null;
  merchandise_checked_at?: string | null;
  merchandise_checked_by?: string | null;
  meter_bw?: number | null;
  meter_color?: number | null;
  // Auditoría y borrado lógico
  created_by: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deletion_reason?: string | null;

  // Relaciones expandidas opcionales
  customer?: Customer;
  assignee?: Profile | null;
  creator?: Profile | null;
  deleter?: Profile | null;
  attachment_count?: number;
}

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
  author?: Profile;
}

export interface TaskHistoryItem {
  id: string;
  task_id: string;
  actor_id: string;
  event_type: TaskHistoryEventType;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  actor?: Profile;
}

export interface Attachment {
  id: string;
  task_id: string;
  uploaded_by: string;
  storage_path: string;
  public_url: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  caption: string | null;
  attachment_kind?: AttachmentKind;
  created_at: string;
}

export interface PushSubscriptionRecord {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  device_label: string | null;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

export interface AppNotification {
  id: string;
  recipient_id: string;
  actor_id: string;
  task_id: string | null;
  type: NotificationType;
  title: string;
  body: string;
  is_read: boolean;
  push_sent: boolean;
  created_at: string;
  read_at: string | null;
  actor?: Profile;
}

// ─── Etiquetas y Tokens Semánticos en Español ────────────────────────────────

export const TASK_STATUS_META: Record<
  TaskStatus,
  { label: string; color: string; bgClass: string; textClass: string; borderHex: string }
> = {
  pending: {
    label: 'Pendiente',
    color: '#666666',
    bgClass: 'bg-mid-grey/15',
    textClass: 'text-dark-grey',
    borderHex: '#666666',
  },
  assigned: {
    label: 'Asignada',
    color: '#004876',
    bgClass: 'bg-petrol/15',
    textClass: 'text-petrol',
    borderHex: '#004876',
  },
  en_route: {
    label: 'En Camino',
    color: '#002169',
    bgClass: 'bg-navy/15',
    textClass: 'text-navy',
    borderHex: '#002169',
  },
  in_progress: {
    label: 'En Proceso',
    color: '#004876',
    bgClass: 'bg-petrol/20',
    textClass: 'text-petrol',
    borderHex: '#004876',
  },
  on_hold: {
    label: 'En Espera',
    color: '#5E3654',
    bgClass: 'bg-plum/15',
    textClass: 'text-plum',
    borderHex: '#5E3654',
  },
  completed: {
    label: 'Completada',
    color: '#1A7A4A',
    bgClass: 'bg-success/15',
    textClass: 'text-success',
    borderHex: '#1A7A4A',
  },
  cancelled: {
    label: 'Cancelada',
    color: '#353740',
    bgClass: 'bg-dark-grey/15',
    textClass: 'text-dark-grey',
    borderHex: '#353740',
  },
};

export const TASK_PRIORITY_META: Record<
  TaskPriority,
  { label: string; bgClass: string; textClass: string; dotColor: string }
> = {
  low: {
    label: 'Baja',
    bgClass: 'bg-light-grey/20',
    textClass: 'text-mid-grey',
    dotColor: '#9B9B9B',
  },
  medium: {
    label: 'Media',
    bgClass: 'bg-coral/20',
    textClass: 'text-burgundy',
    dotColor: '#EA7267',
  },
  high: {
    label: 'Alta',
    bgClass: 'bg-magenta/15',
    textClass: 'text-magenta',
    dotColor: '#CF095E',
  },
  urgent: {
    label: 'Urgente',
    bgClass: 'bg-danger/15',
    textClass: 'text-danger',
    dotColor: '#D40000',
  },
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  coordinator: 'Coordinador SAT',
  technician: 'Técnico de Campo',
};

export const TASK_TYPE_META: Record<
  TaskType,
  {
    label: string;
    shortLabel: string;
    description: string;
    bgClass: string;
    textClass: string;
    borderColor: string;
  }
> = {
  installation: {
    label: 'Instalación',
    shortLabel: 'Instalación',
    description: 'Pedido adjunto, cotejo de mercancía, fecha acordada y parte de instalación.',
    bgClass: 'bg-petrol/15 dark:bg-sky-500/20',
    textClass: 'text-petrol dark:text-sky-300',
    borderColor: '#004876',
  },
  rma_incident: {
    label: 'Incidencia RMA',
    shortLabel: 'RMA',
    description: 'Parte de reparación y asistencia técnica SAT estándar.',
    bgClass: 'bg-navy/10 dark:bg-white/10',
    textClass: 'text-navy dark:text-slate-200',
    borderColor: '#002169',
  },
  cxc_incident: {
    label: 'Incidencia CXC',
    shortLabel: 'CXC',
    description: 'Contadores B/N y color, piezas a sustituir y nº de serie obligatorio al cerrar.',
    bgClass: 'bg-magenta/15 dark:bg-magenta/25',
    textClass: 'text-magenta dark:text-pink-300',
    borderColor: '#CF095E',
  },
  task: {
    label: 'Tarea',
    shortLabel: 'Tarea',
    description: 'Tarea general con seguimiento de avance hasta su finalización.',
    bgClass: 'bg-plum/15 dark:bg-purple-500/20',
    textClass: 'text-plum dark:text-purple-300',
    borderColor: '#5E3654',
  },
};

export function resolveTaskType(task: Pick<Task, 'task_type'> | null | undefined): TaskType {
  return task?.task_type ?? 'rma_incident';
}
