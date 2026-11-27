'use client';

import { useState } from 'react';
import { Gauge, Save } from 'lucide-react';
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
  const [bwInput, setBwInput] = useState(
    task.meter_bw != null ? String(task.meter_bw) : ''
  );
  const [colorInput, setColorInput] = useState(
    task.meter_color != null ? String(task.meter_color) : ''
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const nextBw = bwInput.trim() === '' ? null : Math.max(0, parseInt(bwInput, 10) || 0);
      const nextColor =
        colorInput.trim() === '' ? null : Math.max(0, parseInt(colorInput, 10) || 0);
      await updateTaskFields(
        task.id,
        { meter_bw: nextBw, meter_color: nextColor },
        currentUser
      );
      onFeedback('Contadores de copias B/N y Color actualizados.');
      await onChanged();
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : 'No se pudieron guardar los contadores.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white dark:bg-surface rounded-md shadow-card p-5 border border-border/60 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-navy dark:text-sky-300 uppercase tracking-wider flex items-center gap-2">
          <Gauge size={16} className="text-magenta" /> Lectura de Copias (Incidencia CXC)
        </h2>
        <span className="text-xs font-bold px-2.5 py-1 bg-magenta/10 text-magenta rounded-xs">
          S/N: {task.equipment_sn || 'Pendiente'}
        </span>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
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
            <Save size={14} /> Guardar copias
          </Button>
        )}
      </form>
    </div>
  );
}
