'use client';

import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { Profile } from '@/types/database';

interface TaskDeleteModalProps {
  taskCode: string;
  profile: Profile;
  deleting: boolean;
  onClose: () => void;
  onConfirmDelete: (reason: string) => Promise<void>;
}

export function TaskDeleteModal({
  taskCode,
  profile,
  deleting,
  onClose,
  onConfirmDelete,
}: TaskDeleteModalProps) {
  const [deleteReason, setDeleteReason] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onConfirmDelete(deleteReason);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-charcoal/60 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-lg sm:rounded-lg p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-border">
          <h3 className="text-base font-bold text-danger flex items-center gap-2">
            <Trash2 size={18} /> Eliminar Parte {taskCode}
          </h3>
          <button type="button" onClick={onClose} className="p-1 text-mid-grey">
            <X size={20} />
          </button>
        </div>

        <div className="p-3 bg-danger/10 border-l-4 border-danger text-xs text-charcoal space-y-1">
          <p className="font-bold">El parte se enviará a la Papelera</p>
          <p>
            Quedará registro inmutable de que <strong>{profile.full_name}</strong> lo eliminó,
            pero podrás recuperarlo en cualquier momento desde la pestaña Papelera.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
              Motivo de eliminación (opcional)
            </label>
            <input
              type="text"
              value={deleteReason}
              onChange={(e) => setDeleteReason(e.target.value)}
              placeholder="Ej. Parte duplicado, cancelado por cliente..."
              className="w-full px-3 py-2 bg-bg-input border border-border text-sm text-charcoal"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              {['Parte duplicado', 'Error en datos', 'Cancelado por cliente'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setDeleteReason(preset)}
                  className="text-[11px] font-semibold px-2 py-1 bg-off-white border border-border text-dark-grey hover:bg-navy/5"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="danger" size="sm" isLoading={deleting}>
              <Trash2 size={15} /> Enviar a Papelera
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
