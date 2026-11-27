'use client';

import { useEffect, useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { listCustomers, updateTaskFields } from '@/lib/data-service';
import { toDatetimeLocalValue } from '@/lib/sla';
import { useAppCache } from '@/store/app-cache';
import {
  TASK_PRIORITY_META,
  type Customer,
  type Profile,
  type Task,
  type TaskPriority,
  type TaskType,
} from '@/types/database';

interface TaskEditModalProps {
  task: Task;
  taskType: TaskType;
  profile: Profile;
  isCoord: boolean;
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}

export function TaskEditModal({
  task,
  taskType,
  profile,
  isCoord,
  onClose,
  onSaved,
}: TaskEditModalProps) {
  const cachedCustomers = useAppCache((s) => s.customers);
  const [customers, setCustomers] = useState<Customer[]>(() =>
    cachedCustomers.filter((c) => c.is_active)
  );
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [editCustomerId, setEditCustomerId] = useState(task.customer_id);
  const [editPriority, setEditPriority] = useState<TaskPriority>(task.priority);
  const [editEquipmentRef, setEditEquipmentRef] = useState(task.equipment_ref || '');
  const [editEquipmentSn, setEditEquipmentSn] = useState(task.equipment_sn || '');
  const [editProblemDesc, setEditProblemDesc] = useState(task.problem_desc);
  const [editSiteContactName, setEditSiteContactName] = useState(
    task.site_contact_name || ''
  );
  const [editSiteContactPhone, setEditSiteContactPhone] = useState(
    task.site_contact_phone || ''
  );
  const [editSiteAddress, setEditSiteAddress] = useState(task.site_address || '');
  const [editSiteCity, setEditSiteCity] = useState(task.site_city || '');
  const [editDueDate, setEditDueDate] = useState(toDatetimeLocalValue(task.due_date));

  // Cargar clientes bajo demanda únicamente al abrir el modal de edición
  useEffect(() => {
    let active = true;
    void listCustomers()
      .then((list) => {
        if (active) setCustomers(list.filter((c) => c.is_active));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  const customerOptions =
    customers.length > 0
      ? customers
      : task.customer
      ? [task.customer]
      : [];

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editCustomerId || !editProblemDesc.trim()) {
      setEditError('El cliente y la descripción son obligatorios.');
      return;
    }
    if (taskType === 'cxc_incident' && task.status === 'completed' && !editEquipmentSn.trim()) {
      setEditError('El nº de serie es obligatorio cuando la Incidencia CXC está cerrada.');
      return;
    }

    const patch: Parameters<typeof updateTaskFields>[1] = {};
    if (editCustomerId !== task.customer_id) patch.customer_id = editCustomerId;
    if (editPriority !== task.priority) patch.priority = editPriority;
    if (editEquipmentRef.trim() !== (task.equipment_ref || '')) {
      patch.equipment_ref = editEquipmentRef.trim() || null;
    }
    if (editEquipmentSn.trim() !== (task.equipment_sn || '')) {
      patch.equipment_sn = editEquipmentSn.trim() || null;
    }
    if (editProblemDesc.trim() !== task.problem_desc) {
      patch.problem_desc = editProblemDesc.trim();
    }
    if (editSiteContactName.trim() !== (task.site_contact_name || '')) {
      patch.site_contact_name = editSiteContactName.trim() || null;
    }
    if (editSiteContactPhone.trim() !== (task.site_contact_phone || '')) {
      patch.site_contact_phone = editSiteContactPhone.trim() || null;
    }
    if (editSiteAddress.trim() !== (task.site_address || '')) {
      patch.site_address = editSiteAddress.trim() || null;
    }
    if (editSiteCity.trim() !== (task.site_city || '')) {
      patch.site_city = editSiteCity.trim() || null;
    }
    if (isCoord) {
      const nextDueIso = editDueDate.trim() ? new Date(editDueDate).toISOString() : null;
      const prevDueIso = task.due_date ? new Date(task.due_date).toISOString() : null;
      if (nextDueIso !== prevDueIso) {
        patch.due_date = nextDueIso;
      }
    }

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    setSavingEdit(true);
    setEditError(null);
    try {
      await updateTaskFields(task.id, patch, profile);
      await onSaved('Datos del parte actualizados y auditados en el historial.');
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : 'No se pudieron guardar los cambios.'
      );
    } finally {
      setSavingEdit(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-charcoal/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-lg sm:rounded-lg p-5 space-y-4 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <h3 className="text-base font-bold text-charcoal flex items-center gap-2">
            <Pencil size={16} className="text-magenta" /> Modificar Parte {task.code}
          </h3>
          <button type="button" onClick={onClose} className="p-1 text-mid-grey">
            <X size={20} />
          </button>
        </div>

        {editError && (
          <div className="p-3 bg-danger/10 border-l-4 border-danger text-xs font-bold text-danger">
            {editError}
          </div>
        )}

        <form onSubmit={handleSaveEdit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                Cliente *
              </label>
              <select
                value={editCustomerId}
                onChange={(e) => setEditCustomerId(e.target.value)}
                className="w-full px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
                required
              >
                {customerOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                Prioridad
              </label>
              <select
                value={editPriority}
                onChange={(e) => setEditPriority(e.target.value as TaskPriority)}
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                Equipo / Modelo
              </label>
              <input
                type="text"
                value={editEquipmentRef}
                onChange={(e) => setEditEquipmentRef(e.target.value)}
                placeholder="Ej. Enfriadora Daikin EWYT-B"
                className="w-full px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                Nº de Serie {taskType === 'cxc_incident' ? '(obligatorio al cerrar)' : ''}
              </label>
              <input
                type="text"
                required={taskType === 'cxc_incident' && task.status === 'completed'}
                value={editEquipmentSn}
                onChange={(e) => setEditEquipmentSn(e.target.value)}
                placeholder="Ej. SN-12345"
                className="w-full px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
              Descripción de la Avería / Trabajo *
            </label>
            <textarea
              rows={3}
              value={editProblemDesc}
              onChange={(e) => setEditProblemDesc(e.target.value)}
              className="w-full px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                Contacto en sitio
              </label>
              <input
                type="text"
                value={editSiteContactName}
                onChange={(e) => setEditSiteContactName(e.target.value)}
                className="w-full px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                Teléfono contacto
              </label>
              <input
                type="text"
                value={editSiteContactPhone}
                onChange={(e) => setEditSiteContactPhone(e.target.value)}
                className="w-full px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                Dirección de intervención
              </label>
              <input
                type="text"
                value={editSiteAddress}
                onChange={(e) => setEditSiteAddress(e.target.value)}
                className="w-full px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                Localidad
              </label>
              <input
                type="text"
                value={editSiteCity}
                onChange={(e) => setEditSiteCity(e.target.value)}
                className="w-full px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
              />
            </div>
          </div>

          {isCoord && (
            <div>
              <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                Fecha límite SLA
              </label>
              <input
                type="datetime-local"
                value={editDueDate}
                onChange={(e) => setEditDueDate(e.target.value)}
                className="w-full px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
              />
            </div>
          )}

          <p className="text-[11px] text-mid-grey">
            Todos los cambios quedarán registrados con tu nombre y fecha en el historial
            inmutable del parte.
          </p>

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" size="sm" isLoading={savingEdit}>
              Guardar Cambios
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
