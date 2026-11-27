import type {
  AppNotification,
  Attachment,
  Customer,
  NotificationType,
  Profile,
  PushSubscriptionRecord,
  Task,
  TaskComment,
  TaskHistoryItem,
} from '@/types/database';

export interface DemoDatabaseState {
  profiles: Profile[];
  passwords: Record<string, string>;
  customers: Customer[];
  tasks: Task[];
  history: TaskHistoryItem[];
  comments: TaskComment[];
  attachments: Attachment[];
  pushSubscriptions: PushSubscriptionRecord[];
  notifications: AppNotification[];
  seqCounter: number;
  vapidKeys?: {
    publicKey: string;
    privateKey: string;
  };
  revision: number;
}

export function createInitialDemoState(): DemoDatabaseState {
  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 3600 * 1000).toISOString();
  const hoursFromNow = (h: number) => new Date(now + h * 3600 * 1000).toISOString();

  const profiles: Profile[] = [
    {
      id: 'user-admin-1',
      email: 'admin@vistalegre.com',
      full_name: 'Carlos Mendoza',
      phone: '+34 600 111 222',
      avatar_url: null,
      role: 'admin',
      notification_level: 'all',
      is_active: true,
      created_at: hoursAgo(720),
      updated_at: hoursAgo(24),
    },
    {
      id: 'user-coord-1',
      email: 'coordinador@vistalegre.com',
      full_name: 'Laura Navarro',
      phone: '+34 600 222 333',
      avatar_url: null,
      role: 'coordinator',
      notification_level: 'assigned_or_created',
      is_active: true,
      created_at: hoursAgo(680),
      updated_at: hoursAgo(12),
    },
    {
      id: 'user-tech-1',
      email: 'tecnico@vistalegre.com',
      full_name: 'Javier Ruiz',
      phone: '+34 611 333 444',
      avatar_url: null,
      role: 'technician',
      notification_level: 'assigned_or_created',
      is_active: true,
      created_at: hoursAgo(500),
      updated_at: hoursAgo(3),
    },
    {
      id: 'user-tech-2',
      email: 'marta.soler@vistalegre.com',
      full_name: 'Marta Soler',
      phone: '+34 622 444 555',
      avatar_url: null,
      role: 'technician',
      notification_level: 'assigned_or_created',
      is_active: true,
      created_at: hoursAgo(420),
      updated_at: hoursAgo(5),
    },
  ];

  const customers: Customer[] = [
    {
      id: 'cust-1',
      name: 'Clínica Dental Vistalegre',
      tax_id: 'B84512093',
      address: 'Av. de la Constitución, 48',
      city: 'Madrid',
      postal_code: '28014',
      country: 'ES',
      contact_name: 'Dra. Beatriz Gómez',
      contact_phone: '+34 915 234 890',
      contact_email: 'recepcion@clinicavistalegre.es',
      notes: 'Acceso por patio interior. Horario de 09:00 a 19:00.',
      is_active: true,
      created_by: 'user-coord-1',
      created_at: hoursAgo(600),
      updated_at: hoursAgo(200),
    },
    {
      id: 'cust-2',
      name: 'Hotel Mirador Norte',
      tax_id: 'A28910455',
      address: 'Paseo de la Castellana, 210',
      city: 'Madrid',
      postal_code: '28046',
      country: 'ES',
      contact_name: 'Roberto Sánchez (Mantenimiento)',
      contact_phone: '+34 913 998 110',
      contact_email: 'mantenimiento@hotelmirador.es',
      notes: 'Preguntar en conserjería por llave de sala técnica planta -2.',
      is_active: true,
      created_by: 'user-coord-1',
      created_at: hoursAgo(520),
      updated_at: hoursAgo(100),
    },
    {
      id: 'cust-3',
      name: 'Logística Ibérica Sur S.L.',
      tax_id: 'B91004512',
      address: 'Pol. Ind. Las Mercedes, Nave 14',
      city: 'Getafe',
      postal_code: '28906',
      country: 'ES',
      contact_name: 'Antonio Márquez',
      contact_phone: '+34 654 321 987',
      contact_email: 'almacen@logisticaiberica.es',
      notes: 'Obligatorio chaleco reflectante en zona de muelles.',
      is_active: true,
      created_by: 'user-admin-1',
      created_at: hoursAgo(400),
      updated_at: hoursAgo(48),
    },
    {
      id: 'cust-4',
      name: 'Instituto Tecnológico Valdebebas',
      tax_id: 'Q2801944E',
      address: 'C/ María de las Mercedes, 12',
      city: 'Madrid',
      postal_code: '28055',
      country: 'ES',
      contact_name: 'Elena Castro',
      contact_phone: '+34 917 882 340',
      contact_email: 'direccion@itvaldebebas.edu.es',
      notes: null,
      is_active: true,
      created_by: 'user-coord-1',
      created_at: hoursAgo(300),
      updated_at: hoursAgo(24),
    },
  ];

  const tasks: Task[] = [
    {
      id: 'task-1',
      code: 'VS-2026-0001',
      task_type: 'rma_incident',
      customer_id: 'cust-2',
      site_contact_name: 'Roberto Sánchez',
      site_contact_phone: '+34 913 998 110',
      site_address: 'Paseo de la Castellana, 210',
      site_city: 'Madrid',
      equipment_ref: 'Enfriadora Daikin EWYT-B',
      equipment_sn: 'DK-2024-99104',
      problem_desc:
        'Parada intermitente por alarma de alta presión en circuito 1. Posible obstrucción en condensador o fallo de transductor.',
      priority: 'urgent',
      status: 'in_progress',
      assigned_to: 'user-tech-1',
      assigned_at: hoursAgo(5),
      resolution_notes: 'Detectada suciedad severa en batería y presostato descalibrado.',
      materials_used: [
        { id: 'mat-1', name: 'Transductor presión 0-30 bar', ref: 'DK-TR30', qty: 1 },
        { id: 'mat-2', name: 'Limpiador serpentín 5L', ref: 'CHEM-05', qty: 1 },
      ],
      client_signature_url: null,
      signer_name: null,
      pdf_url: null,
      completed_at: null,
      estimated_duration: 120,
      due_date: hoursAgo(2),
      created_by: 'user-coord-1',
      created_at: hoursAgo(6),
      updated_at: hoursAgo(1),
    },
    {
      id: 'task-2',
      code: 'VS-2026-0002',
      task_type: 'cxc_incident',
      customer_id: 'cust-1',
      site_contact_name: 'Dra. Beatriz Gómez',
      site_contact_phone: '+34 915 234 890',
      site_address: 'Av. de la Constitución, 48',
      site_city: 'Madrid',
      equipment_ref: 'Impresora Multifunción Ricoh IM C3000',
      equipment_sn: 'RC-8821-M4',
      problem_desc: 'Atasco recurrente en bandeja 2 y código de error SC542 en unidad fusora.',
      priority: 'high',
      status: 'assigned',
      assigned_to: 'user-tech-1',
      assigned_at: hoursAgo(3),
      resolution_notes: null,
      materials_used: [{ id: 'mat-cxc-1', name: 'Rodillo fusor superior', ref: 'RC-FUS-02', qty: 1 }],
      meter_bw: 45820,
      meter_color: 18940,
      client_signature_url: null,
      signer_name: null,
      pdf_url: null,
      completed_at: null,
      estimated_duration: 60,
      due_date: hoursFromNow(2),
      created_by: 'user-coord-1',
      created_at: hoursAgo(3.5),
      updated_at: hoursAgo(3),
    },
    {
      id: 'task-3',
      code: 'VS-2026-0003',
      task_type: 'installation',
      customer_id: 'cust-3',
      site_contact_name: 'Antonio Márquez',
      site_contact_phone: '+34 654 321 987',
      site_address: 'Pol. Ind. Las Mercedes, Nave 14',
      site_city: 'Getafe',
      equipment_ref: 'Terminal RFID Zebra FX9600 + Antena',
      equipment_sn: 'ZB-9600-332',
      problem_desc: 'Instalación completa de nuevo arco de lectura RFID en muelle 4 según pedido adjunto.',
      priority: 'medium',
      status: 'pending',
      assigned_to: null,
      assigned_at: null,
      resolution_notes: null,
      materials_used: [],
      scheduled_date: hoursFromNow(48),
      merchandise_check_done: null,
      merchandise_check_notes: null,
      client_signature_url: null,
      signer_name: null,
      pdf_url: null,
      completed_at: null,
      estimated_duration: 90,
      due_date: hoursFromNow(36),
      created_by: 'user-admin-1',
      created_at: hoursAgo(2),
      updated_at: hoursAgo(2),
    },
    {
      id: 'task-4',
      code: 'VS-2026-0004',
      task_type: 'rma_incident',
      customer_id: 'cust-4',
      site_contact_name: 'Elena Castro',
      site_contact_phone: '+34 917 882 340',
      site_address: 'C/ María de las Mercedes, 12',
      site_city: 'Madrid',
      equipment_ref: 'Proyector Láser Epson EB-L630U',
      equipment_sn: 'EP-630-1129',
      problem_desc: 'Sin señal HDMI en aula magna; verificar matriz de conmutación.',
      priority: 'medium',
      status: 'on_hold',
      assigned_to: 'user-tech-2',
      assigned_at: hoursAgo(26),
      resolution_notes: 'A la espera de matriz HDMI 4x2 solicitada a proveedor.',
      materials_used: [{ id: 'mat-3', name: 'Cable HDMI 2.1 fibra 15m', ref: 'HD-15F', qty: 1 }],
      client_signature_url: null,
      signer_name: null,
      pdf_url: null,
      completed_at: null,
      estimated_duration: 75,
      created_by: 'user-coord-1',
      created_at: hoursAgo(28),
      updated_at: hoursAgo(12),
    },
    {
      id: 'task-5',
      code: 'VS-2026-0005',
      task_type: 'rma_incident',
      customer_id: 'cust-1',
      site_contact_name: 'Dra. Beatriz Gómez',
      site_contact_phone: '+34 915 234 890',
      site_address: 'Av. de la Constitución, 48',
      site_city: 'Madrid',
      equipment_ref: 'SAI APC Smart-UPS 3000VA',
      equipment_sn: 'APC-3000-7712',
      problem_desc: 'Sustitución preventiva de pack de baterías y test de autonomía.',
      priority: 'low',
      status: 'completed',
      assigned_to: 'user-tech-1',
      assigned_at: hoursAgo(30),
      resolution_notes: 'Baterías sustituidas, test de carga al 100% superado (38 min autonomía).',
      materials_used: [{ id: 'mat-4', name: 'Pack Batería RBC43', ref: 'APC-RBC43', qty: 1 }],
      client_signature_url: null,
      signer_name: 'Beatriz Gómez',
      pdf_url: null,
      completed_at: hoursAgo(4),
      estimated_duration: 45,
      created_by: 'user-coord-1',
      created_at: hoursAgo(32),
      updated_at: hoursAgo(4),
    },
    {
      id: 'task-6',
      code: 'VS-2026-0006',
      task_type: 'task',
      customer_id: 'cust-2',
      site_contact_name: 'Roberto Sánchez',
      site_contact_phone: '+34 913 998 110',
      site_address: 'Paseo de la Castellana, 210',
      site_city: 'Madrid',
      equipment_ref: null,
      equipment_sn: null,
      problem_desc: 'Revisar inventario de repuestos en almacén del hotel y actualizar etiquetas de mantenimiento.',
      priority: 'low',
      status: 'assigned',
      assigned_to: 'user-tech-1',
      assigned_at: hoursAgo(4),
      resolution_notes: null,
      materials_used: [],
      client_signature_url: null,
      signer_name: null,
      pdf_url: null,
      completed_at: null,
      estimated_duration: 45,
      created_by: 'user-coord-1',
      created_at: hoursAgo(5),
      updated_at: hoursAgo(4),
    },
  ];

  const history: TaskHistoryItem[] = [
    {
      id: 'hist-1',
      task_id: 'task-1',
      actor_id: 'user-coord-1',
      event_type: 'created',
      field_name: null,
      old_value: null,
      new_value: 'VS-2026-0001',
      note: 'Parte de trabajo abierto por recepción de llamada urgente.',
      metadata: {},
      created_at: hoursAgo(6),
    },
    {
      id: 'hist-2',
      task_id: 'task-1',
      actor_id: 'user-coord-1',
      event_type: 'assigned',
      field_name: 'assigned_to',
      old_value: null,
      new_value: 'Javier Ruiz',
      note: 'Asignado a Javier Ruiz',
      metadata: {},
      created_at: hoursAgo(5.8),
    },
    {
      id: 'hist-3',
      task_id: 'task-1',
      actor_id: 'user-tech-1',
      event_type: 'status_changed',
      field_name: 'status',
      old_value: 'assigned',
      new_value: 'en_route',
      note: null,
      metadata: {},
      created_at: hoursAgo(4),
    },
    {
      id: 'hist-4',
      task_id: 'task-1',
      actor_id: 'user-tech-1',
      event_type: 'status_changed',
      field_name: 'status',
      old_value: 'en_route',
      new_value: 'in_progress',
      note: null,
      metadata: {},
      created_at: hoursAgo(3),
    },
    {
      id: 'hist-5',
      task_id: 'task-1',
      actor_id: 'user-tech-1',
      event_type: 'note_added',
      field_name: 'resolution_notes',
      old_value: null,
      new_value: null,
      note: 'Detectada suciedad severa en batería y presostato descalibrado.',
      metadata: {},
      created_at: hoursAgo(1),
    },
  ];

  const comments: TaskComment[] = [
    {
      id: 'comm-1',
      task_id: 'task-1',
      author_id: 'user-coord-1',
      body: 'Roberto confirma que tienen acceso a la sala de máquinas hasta las 18:30.',
      created_at: hoursAgo(4.5),
    },
    {
      id: 'comm-2',
      task_id: 'task-1',
      author_id: 'user-tech-1',
      body: 'Recibido. Estoy limpiando condensador y calibrando el transductor.',
      created_at: hoursAgo(1.2),
    },
  ];

  const notifications: AppNotification[] = [
    {
      id: 'notif-1',
      recipient_id: 'user-tech-1',
      actor_id: 'user-coord-1',
      task_id: 'task-2',
      type: 'task_assigned',
      title: 'Nuevo parte asignado: VS-2026-0002',
      body: 'Laura Navarro te ha asignado el parte de Clínica Dental Vistalegre (Prioridad Alta).',
      is_read: false,
      push_sent: true,
      created_at: hoursAgo(3),
      read_at: null,
    },
    {
      id: 'notif-2',
      recipient_id: 'user-tech-1',
      actor_id: 'user-admin-1',
      task_id: 'task-3',
      type: 'task_created',
      title: 'Parte disponible sin asignar: VS-2026-0003',
      body: 'Logística Ibérica Sur S.L. — Terminal RFID Zebra FX9600.',
      is_read: false,
      push_sent: true,
      created_at: hoursAgo(2),
      read_at: null,
    },
    {
      id: 'notif-3',
      recipient_id: 'user-coord-1',
      actor_id: 'user-tech-1',
      task_id: 'task-1',
      type: 'status_changed',
      title: 'Actualización en VS-2026-0001',
      body: 'Javier Ruiz cambió el estado a En Proceso.',
      is_read: false,
      push_sent: true,
      created_at: hoursAgo(3),
      read_at: null,
    },
  ];

  return {
    profiles,
    passwords: {
      'admin@vistalegre.com': 'demo1234',
      'coordinador@vistalegre.com': 'demo1234',
      'tecnico@vistalegre.com': 'demo1234',
      'marta.soler@vistalegre.com': 'demo1234',
    },
    customers,
    tasks,
    history,
    comments,
    attachments: [],
    pushSubscriptions: [],
    notifications,
    seqCounter: 7,
    revision: 1,
  };
}

/**
 * Calcula destinatarios y genera notificaciones respetando estrictamente
 * el filtro anti-autonotificación (actorId !== recipientId) y preferencias de coordinador.
 */
export function buildNotificationRecipients(
  state: DemoDatabaseState,
  params: {
    task: Task;
    actorId: string;
    type: NotificationType;
    title: string;
    body: string;
    isNewTask?: boolean;
  }
): AppNotification[] {
  const { task, actorId, type, title, body, isNewTask } = params;
  const recipients = new Set<string>();

  if (task.assigned_to) {
    recipients.add(task.assigned_to);
  }

  if (isNewTask && !task.assigned_to) {
    state.profiles
      .filter((p) => p.role === 'technician' && p.is_active)
      .forEach((p) => recipients.add(p.id));
  }

  state.profiles
    .filter((p) => (p.role === 'admin' || p.role === 'coordinator') && p.is_active)
    .forEach((coord) => {
      if (coord.notification_level === 'all') {
        recipients.add(coord.id);
      } else if (
        coord.notification_level === 'assigned_or_created' &&
        (task.created_by === coord.id || task.assigned_to === coord.id)
      ) {
        recipients.add(coord.id);
      }
    });

  // REGLA CRÍTICA: Nunca autonotificar al autor de la acción
  recipients.delete(actorId);

  const nowIso = new Date().toISOString();
  const created: AppNotification[] = [];

  for (const recipientId of recipients) {
    if (recipientId === actorId) continue;
    const item: AppNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      recipient_id: recipientId,
      actor_id: actorId,
      task_id: task.id,
      type,
      title,
      body,
      is_read: false,
      push_sent: true,
      created_at: nowIso,
      read_at: null,
    };
    state.notifications.unshift(item);
    created.push(item);
  }

  return created;
}

export function hydrateTasks(state: DemoDatabaseState, tasks: Task[]): Task[] {
  return tasks.map((t) => ({
    ...t,
    task_type: t.task_type || 'rma_incident',
    customer: state.customers.find((c) => c.id === t.customer_id),
    assignee: t.assigned_to ? state.profiles.find((p) => p.id === t.assigned_to) || null : null,
    creator: state.profiles.find((p) => p.id === t.created_by) || null,
    deleter: t.deleted_by ? state.profiles.find((p) => p.id === t.deleted_by) || null : null,
    attachment_count: state.attachments.filter(
      (a) => a.task_id === t.id && a.attachment_kind !== 'installation_order'
    ).length,
  }));
}
