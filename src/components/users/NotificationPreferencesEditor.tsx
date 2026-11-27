'use client';

import { Bell, BellOff, Lock, MoonStar, Smartphone, Sparkles } from 'lucide-react';
import {
  NOTIFICATION_EVENT_META,
  NOTIFICATION_PRESETS,
} from '@/lib/notification-preferences';
import {
  TASK_PRIORITY_META,
  TASK_TYPE_META,
  type NotificationPreferences,
  type NotificationScope,
  type TaskPriority,
  type TaskType,
} from '@/types/database';

interface NotificationPreferencesEditorProps {
  value: NotificationPreferences;
  onChange: (next: NotificationPreferences) => void;
  isAdminView?: boolean;
  readOnly?: boolean;
}

const SCOPE_OPTIONS: Array<{
  value: NotificationScope;
  label: string;
  desc: string;
}> = [
  {
    value: 'all',
    label: 'Todos los partes',
    desc: 'Recibe avisos de toda la actividad del equipo.',
  },
  {
    value: 'assigned_or_created',
    label: 'Asignados o creados',
    desc: 'Partes asignados al usuario o creados por él.',
  },
  {
    value: 'assigned_only',
    label: 'Solo asignados',
    desc: 'Únicamente partes donde sea el técnico asignado.',
  },
  {
    value: 'none',
    label: 'Silenciado',
    desc: 'No recibe notificaciones automáticas.',
  },
];

const PRIORITY_OPTIONS: Array<{ value: TaskPriority; label: string }> = [
  { value: 'low', label: 'Todas (desde Baja)' },
  { value: 'medium', label: 'Desde Media' },
  { value: 'high', label: 'Desde Alta' },
  { value: 'urgent', label: 'Solo Urgentes' },
];

export function NotificationPreferencesEditor({
  value,
  onChange,
  readOnly = false,
}: NotificationPreferencesEditorProps) {
  const disabled = readOnly;
  const isMuted = value.scope === 'none';

  const applyPreset = (presetBuild: () => NotificationPreferences) => {
    if (disabled) return;
    const preset = presetBuild();
    onChange({
      ...preset,
      allow_user_override: false,
    });
  };

  const toggleEventChannel = (
    eventKey: keyof NotificationPreferences['events'],
    channel: 'in_app' | 'push'
  ) => {
    if (disabled) return;
    onChange({
      ...value,
      events: {
        ...value.events,
        [eventKey]: {
          ...value.events[eventKey],
          [channel]: !value.events[eventKey][channel],
        },
      },
    });
  };

  const toggleAllEventsForChannel = (channel: 'in_app' | 'push', enabled: boolean) => {
    if (disabled) return;
    const nextEvents = { ...value.events };
    for (const meta of NOTIFICATION_EVENT_META) {
      nextEvents[meta.key] = {
        ...nextEvents[meta.key],
        [channel]: enabled,
      };
    }
    onChange({
      ...value,
      events: nextEvents,
    });
  };

  return (
    <div className="space-y-5">
      {readOnly && (
        <div className="p-3 bg-navy/5 border-l-4 border-navy text-xs text-charcoal flex items-start gap-2">
          <Lock size={15} className="text-navy flex-shrink-0 mt-0.5" />
          <span>
            Configuración asignada por el <strong>Administrador</strong>. Solo un Administrador
            puede modificar tus notificaciones y avisos Push desde la pestaña de Usuarios.
          </span>
        </div>
      )}

      {/* 1. Plantillas rápidas de 1 clic */}
      {!disabled && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-mid-grey flex items-center gap-1.5 mb-2">
            <Sparkles size={13} className="text-magenta" /> Plantillas rápidas
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {NOTIFICATION_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.build)}
                className="text-left p-2.5 border border-border bg-off-white hover:border-navy hover:bg-navy/5 rounded-sm transition-colors"
              >
                <p className="text-xs font-bold text-navy">{preset.label}</p>
                <p className="text-[11px] text-mid-grey leading-snug mt-0.5">
                  {preset.description}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 2. Ámbito de partes */}
      <div>
        <p className="text-xs font-bold uppercase tracking-wider text-mid-grey mb-2">
          1. ¿Sobre qué partes recibe notificaciones?
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {SCOPE_OPTIONS.map((opt) => {
            const active = value.scope === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={disabled}
                onClick={() =>
                  onChange({
                    ...value,
                    scope: opt.value,
                    in_app_enabled: opt.value === 'none' ? false : true,
                    push_enabled: opt.value === 'none' ? false : value.push_enabled,
                  })
                }
                className={`text-left p-3 border rounded-sm transition-colors ${
                  active
                    ? 'border-navy bg-navy/5 dark:bg-white/10'
                    : 'border-border bg-white dark:bg-surface hover:bg-off-white'
                } disabled:opacity-60`}
              >
                <p className="text-xs font-bold text-charcoal">{opt.label}</p>
                <p className="text-[11px] text-mid-grey mt-0.5">{opt.desc}</p>
              </button>
            );
          })}
        </div>

        {!isMuted && value.scope !== 'all' && (
          <div className="mt-2.5 space-y-2 p-3 bg-off-white border border-border rounded-sm">
            <label className="flex items-center gap-2 text-xs font-medium text-charcoal cursor-pointer">
              <input
                type="checkbox"
                disabled={disabled}
                checked={value.include_unassigned_new_tasks}
                onChange={(e) =>
                  onChange({
                    ...value,
                    include_unassigned_new_tasks: e.target.checked,
                  })
                }
                className="accent-navy w-4 h-4"
              />
              Incluir partes nuevos sin técnico asignado
            </label>
            {value.scope === 'assigned_or_created' && (
              <label className="flex items-center gap-2 text-xs font-medium text-charcoal cursor-pointer">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={value.include_created_by_me}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      include_created_by_me: e.target.checked,
                    })
                  }
                  className="accent-navy w-4 h-4"
                />
                Seguir avisando de partes creados por el usuario aunque se asignen a otro
              </label>
            )}
          </div>
        )}
      </div>

      {/* 3. Canales maestros + Matriz de eventos */}
      <div className={isMuted ? 'opacity-50 pointer-events-none' : ''}>
        <p className="text-xs font-bold uppercase tracking-wider text-mid-grey mb-2">
          2. Canales y detalle por tipo de evento
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mb-3">
          <label className="flex items-center justify-between p-3 border border-border bg-white dark:bg-surface rounded-sm cursor-pointer">
            <span className="flex items-center gap-2 text-xs font-bold text-charcoal">
              {value.in_app_enabled ? (
                <Bell size={15} className="text-navy" />
              ) : (
                <BellOff size={15} className="text-mid-grey" />
              )}
              Notificaciones en la App
            </span>
            <input
              type="checkbox"
              disabled={disabled}
              checked={value.in_app_enabled}
              onChange={(e) =>
                onChange({ ...value, in_app_enabled: e.target.checked })
              }
              className="accent-navy w-4 h-4"
            />
          </label>

          <label className="flex items-center justify-between p-3 border border-border bg-white dark:bg-surface rounded-sm cursor-pointer">
            <span className="flex items-center gap-2 text-xs font-bold text-charcoal">
              <Smartphone
                size={15}
                className={value.push_enabled ? 'text-magenta' : 'text-mid-grey'}
              />
              Web Push (Móvil / PC)
            </span>
            <input
              type="checkbox"
              disabled={disabled}
              checked={value.push_enabled}
              onChange={(e) =>
                onChange({ ...value, push_enabled: e.target.checked })
              }
              className="accent-magenta w-4 h-4"
            />
          </label>
        </div>

        <div className="border border-border rounded-sm overflow-hidden">
          <div className="grid grid-cols-[1fr_68px_68px] items-center bg-off-white px-3 py-2 border-b border-border text-[11px] font-bold uppercase text-mid-grey">
            <span>Evento</span>
            <div className="text-center">
              <span>En App</span>
              {!disabled && value.in_app_enabled && (
                <button
                  type="button"
                  onClick={() => {
                    const allOn = NOTIFICATION_EVENT_META.every(
                      (m) => value.events[m.key].in_app
                    );
                    toggleAllEventsForChannel('in_app', !allOn);
                  }}
                  className="block mx-auto text-[10px] text-navy hover:underline normal-case font-semibold"
                >
                  Alternar
                </button>
              )}
            </div>
            <div className="text-center">
              <span>Push</span>
              {!disabled && value.push_enabled && (
                <button
                  type="button"
                  onClick={() => {
                    const allOn = NOTIFICATION_EVENT_META.every(
                      (m) => value.events[m.key].push
                    );
                    toggleAllEventsForChannel('push', !allOn);
                  }}
                  className="block mx-auto text-[10px] text-magenta hover:underline normal-case font-semibold"
                >
                  Alternar
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-border bg-white dark:bg-surface">
            {NOTIFICATION_EVENT_META.map((ev) => {
              const toggle = value.events[ev.key];
              return (
                <div
                  key={ev.key}
                  className="grid grid-cols-[1fr_68px_68px] items-center px-3 py-2.5 gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-charcoal">{ev.label}</p>
                    <p className="text-[11px] text-mid-grey leading-snug">
                      {ev.description}
                    </p>
                  </div>
                  <div className="flex justify-center">
                    <input
                      type="checkbox"
                      aria-label={`${ev.label} en App`}
                      disabled={disabled || !value.in_app_enabled}
                      checked={toggle.in_app}
                      onChange={() => toggleEventChannel(ev.key, 'in_app')}
                      className="accent-navy w-4 h-4 disabled:opacity-40"
                    />
                  </div>
                  <div className="flex justify-center">
                    <input
                      type="checkbox"
                      aria-label={`${ev.label} por Push`}
                      disabled={disabled || !value.push_enabled}
                      checked={toggle.push}
                      onChange={() => toggleEventChannel(ev.key, 'push')}
                      className="accent-magenta w-4 h-4 disabled:opacity-40"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 4. Tipos de tarea y prioridad mínima */}
      <div className={isMuted ? 'opacity-50 pointer-events-none' : ''}>
        <p className="text-xs font-bold uppercase tracking-wider text-mid-grey mb-2">
          3. Filtros por tipo de tarea y prioridad mínima
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          {(Object.keys(TASK_TYPE_META) as TaskType[]).map((typeKey) => {
            const active = value.task_types[typeKey];
            return (
              <label
                key={typeKey}
                className={`flex items-center gap-2 p-2.5 border rounded-sm text-xs font-bold cursor-pointer ${
                  active
                    ? 'border-navy bg-navy/5 text-navy dark:text-slate-100'
                    : 'border-border bg-white dark:bg-surface text-mid-grey'
                }`}
              >
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={active}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      task_types: {
                        ...value.task_types,
                        [typeKey]: e.target.checked,
                      },
                    })
                  }
                  className="accent-navy w-4 h-4"
                />
                <span className="truncate">{TASK_TYPE_META[typeKey].shortLabel}</span>
              </label>
            );
          })}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-dark-grey mb-1">
              Prioridad mínima En App
            </label>
            <select
              disabled={disabled || !value.in_app_enabled}
              value={value.min_priority_in_app}
              onChange={(e) =>
                onChange({
                  ...value,
                  min_priority_in_app: e.target.value as TaskPriority,
                })
              }
              className="w-full px-3 py-2 text-xs bg-bg-input border border-border disabled:opacity-50"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} ({TASK_PRIORITY_META[opt.value].label})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-dark-grey mb-1">
              Prioridad mínima Web Push
            </label>
            <select
              disabled={disabled || !value.push_enabled}
              value={value.min_priority_push}
              onChange={(e) =>
                onChange({
                  ...value,
                  min_priority_push: e.target.value as TaskPriority,
                })
              }
              className="w-full px-3 py-2 text-xs bg-bg-input border border-border disabled:opacity-50"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label} ({TASK_PRIORITY_META[opt.value].label})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* 5. Horario silencioso para Push */}
      <div
        className={`p-3 border border-border rounded-sm bg-off-white space-y-2.5 ${
          isMuted || !value.push_enabled ? 'opacity-50 pointer-events-none' : ''
        }`}
      >
        <label className="flex items-center justify-between cursor-pointer">
          <span className="flex items-center gap-2 text-xs font-bold text-charcoal">
            <MoonStar size={15} className="text-navy" />
            Horario silencioso para Web Push (No molestar)
          </span>
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.quiet_hours.enabled}
            onChange={(e) =>
              onChange({
                ...value,
                quiet_hours: { ...value.quiet_hours, enabled: e.target.checked },
              })
            }
            className="accent-navy w-4 h-4"
          />
        </label>

        {value.quiet_hours.enabled && (
          <>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-mid-grey mb-1">
                  Desde (hora Madrid)
                </label>
                <input
                  type="time"
                  disabled={disabled}
                  value={value.quiet_hours.start}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      quiet_hours: {
                        ...value.quiet_hours,
                        start: e.target.value || '21:00',
                      },
                    })
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-surface border border-border"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-mid-grey mb-1">
                  Hasta (hora Madrid)
                </label>
                <input
                  type="time"
                  disabled={disabled}
                  value={value.quiet_hours.end}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      quiet_hours: {
                        ...value.quiet_hours,
                        end: e.target.value || '08:00',
                      },
                    })
                  }
                  className="w-full px-2.5 py-1.5 text-xs bg-white dark:bg-surface border border-border"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-dark-grey cursor-pointer pt-1">
              <input
                type="checkbox"
                disabled={disabled}
                checked={value.quiet_hours.allow_urgent_override}
                onChange={(e) =>
                  onChange({
                    ...value,
                    quiet_hours: {
                      ...value.quiet_hours,
                      allow_urgent_override: e.target.checked,
                    },
                  })
                }
                className="accent-magenta w-4 h-4"
              />
              Permitir Web Push de partes Urgentes incluso en horario silencioso
            </label>
          </>
        )}
      </div>
    </div>
  );
}
