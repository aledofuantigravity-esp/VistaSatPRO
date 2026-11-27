'use client';

import { useState } from 'react';
import { AlertTriangle, Gauge, Save } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { updateTaskFields } from '@/lib/data-service';
import type { Profile, Task } from '@/types/database';

interface CxcMetersSectionProps {
  task: Task;
  currentUser: Profile;
  isDeleted: boolean;
  onChanged: () => Promise<void>;
  onFeedback: (msg: string) => void;
}

export function CxcMetersSection({
  task,
  currentUser,
  isDeleted,
  onChanged,
  onFeedback,
}: CxcMetersSectionProps) {
  const [serialInput, setSerialInput] = useState(task.equipment_sn || '');
  const [bwInput, setBwInput] = useState(
    task.meter_bw != null ? String(task.meter_bw) : ''
  );
  const [colorInput, setColorInput] = useState(
    task.meter_color != null ? String(task.meter_color) : ''
  );
  const [saving, setSaving] = useState(false);

  const missingSerial = !task.equipment_sn?.trim();

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const nextSn = serialInput.trim() || null;
      const nextBw = bwInput.trim() === '' ? null : Math.max(0, parseInt(bwInput, 10) || 0);
      const nextColor =
        colorInput.trim() === '' ? null : Math.max(0, parseInt(colorInput, 10) || 0);
      const res = await updateTaskFields(
        task.id,
        { equipment_sn: nextSn, meter_bw: nextBw, meter_color: nextColor },
        currentUser
      );
      if (res.offlineQueued) {
        onFeedback('Sin conexión: contadores y nº de serie guardados en cola offline.');
      } else {
        onFeedback('Nº de serie y contadores de copias actualizados.');
        await onChanged();
      }
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : 'No se pudieron guardar los datos CXC.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2">
          <Gauge size={16} className="text-magenta" /> Nº de Serie y Lectura de Copias (CXC)
        </h2>
        <span
          className={`text-xs font-bold px-2.5 py-1 rounded-xs ${
            missingSerial
              ? 'bg-danger/15 text-danger'
              : 'bg-magenta/10 text-magenta'
          }`}
        >
          S/N: {task.equipment_sn || 'Pendiente (obligatorio al cerrar)'}
        </span>
      </div>

      {missingSerial && task.status !== 'completed' && !isDeleted && (
        <div className="p-2.5 bg-amber-50 border-l-4 border-amber-500 text-xs text-charcoal flex items-center gap-2">
          <AlertTriangle size={15} className="text-amber-600 flex-shrink-0" />
          <span>
            Introduce y guarda el <strong>Nº de Serie</strong> del equipo para poder cerrar esta
            incidencia CXC.
          </span>
        </div>
      )}

      <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <div>
          <label className="block text-xs font-bold uppercase text-danger mb-1">
            Nº de Serie * (para cerrar)
          </label>
          <input
            type="text"
            disabled={isDeleted}
            value={serialInput}
            onChange={(e) => setSerialInput(e.target.value)}
            placeholder="Ej. SN-CXC-90412"
            className="w-full px-3 py-2.5 bg-bg-input border border-border text-sm font-bold text-charcoal disabled:opacity-60"
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
            Copias B/N actuales
          </label>
          <input
            type="number"
            min={0}
            disabled={isDeleted}
            value={bwInput}
            onChange={(e) => setBwInput(e.target.value)}
            placeholder="0"
            className="w-full px-3 py-2.5 bg-bg-input border border-border text-sm font-bold text-charcoal disabled:opacity-60"
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
            Copias Color actuales
          </label>
          <input
            type="number"
            min={0}
            disabled={isDeleted}
            value={colorInput}
            onChange={(e) => setColorInput(e.target.value)}
            placeholder="0"
            className="w-full px-3 py-2.5 bg-bg-input border border-border text-sm font-bold text-charcoal disabled:opacity-60"
          />
        </div>
        {!isDeleted && (
          <Button type="submit" size="sm" variant="primary" isLoading={saving}>
            <Save size={14} /> Guardar datos CXC
          </Button>
        )}
      </form>
    </div>
  );
}
