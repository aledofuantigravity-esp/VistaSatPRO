// Tipos de dominio y base de datos para VistaSatPRO

export type UserRole = 'admin' | 'coordinator' | 'technician';

export type NotificationLevel = 'all' | 'assigned_or_created' | 'none';

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';

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
  | 'field_updated';

export type NotificationType =
  | 'task_created'
  | 'task_assigned'
  | 'task_updated'
  | 'status_changed'
  | 'priority_changed'
  | 'comment_added'
  | 'reassigned';

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
  created_by: string;
  created_at: string;
  updated_at: string;

  // Relaciones expandidas opcionales
  customer?: Customer;
  assignee?: Profile | null;
  creator?: Profile | null;
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
