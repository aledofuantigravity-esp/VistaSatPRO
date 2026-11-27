'use client';

import { useEffect, useMemo, useState } from 'react';
import { PackagePlus, Plus, Trash2 } from 'lucide-react';
import { listPartsCatalog, updateTaskFields } from '@/lib/data-service';
import { useAppCache } from '@/store/app-cache';
import type { MaterialItem, PartCatalogItem, Profile, Task, TaskType } from '@/types/database';

interface TaskMaterialsSectionProps {
  task: Task;
  taskType: TaskType;
  currentUser: Profile;
  isDeleted: boolean;
  onChanged: () => Promise<void>;
  onFeedback: (msg: string) => void;
}

export function TaskMaterialsSection({
  task,
  taskType,
  currentUser,
  isDeleted,
  onChanged,
  onFeedback,
}: TaskMaterialsSectionProps) {
  const cachedParts = useAppCache((s) => s.partsCatalog);
  const partsLoadedAt = useAppCache((s) => s.partsLoadedAt);
  const [matName, setMatName] = useState('');
  const [matRef, setMatRef] = useState('');
  const [matQty, setMatQty] = useState('1');
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    if (isDeleted || partsLoadedAt !== null) return;
    void listPartsCatalog().catch(() => undefined);
  }, [isDeleted, partsLoadedAt]);

  const suggestions = useMemo(() => {
    const active = cachedParts.filter((p) => p.is_active);
    if (!matName.trim()) return active.slice(0, 6);
    const q = matName.trim().toLowerCase();
    return active
      .filter((p) =>
        [p.name, p.ref, p.category]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      )
      .slice(0, 6);
  }, [cachedParts, matName]);

  if (taskType === 'task' || taskType === 'installation') {
    return null;
  }

  const selectCatalogPart = (part: PartCatalogItem) => {
    setMatName(part.name);
    setMatRef(part.ref || '');
    setShowSuggestions(false);
  };

  const handleAddMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!matName.trim()) return;
    const item: MaterialItem = {
      id: `mat-${Date.now()}`,
      name: matName.trim(),
      ref: matRef.trim() || undefined,
      qty: Math.max(1, parseInt(matQty, 10) || 1),
    };
    const nextList = [...(task.materials_used || []), item];
    setShowSuggestions(false);
    try {
      const res = await updateTaskFields(task.id, { materials_used: nextList }, currentUser);
      setMatName('');
      setMatRef('');
      setMatQty('1');
      if (res.offlineQueued) {
        onFeedback('Sin conexión: material guardado en cola offline.');
      } else {
        await onChanged();
      }
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : 'No se pudo añadir el material.');
    }
  };

  const handleRemoveMaterial = async (matId: string) => {
    const nextList = (task.materials_used || []).filter((m) => m.id !== matId);
    try {
      const res = await updateTaskFields(task.id, { materials_used: nextList }, currentUser);
      if (res.offlineQueued) {
        onFeedback('Sin conexión: cambio de materiales guardado en cola offline.');
      } else {
        await onChanged();
      }
    } catch (err) {
      onFeedback(err instanceof Error ? err.message : 'No se pudo eliminar el material.');
    }
  };

  return (
    <div className="bg-white rounded-md shadow-card p-5 border border-border/60 space-y-3">
      <h2 className="text-sm font-bold text-navy uppercase tracking-wider flex items-center gap-2">
        <PackagePlus size={16} className="text-magenta" />{' '}
        {taskType === 'cxc_incident'
          ? 'Piezas a Utilizar / Repuestos CXC'
          : 'Materiales / Piezas Empleadas'}
      </h2>

      {task.materials_used && task.materials_used.length > 0 && (
        <div className="divide-y divide-border border border-border rounded-sm">
          {task.materials_used.map((m) => (
            <div key={m.id} className="flex items-center justify-between px-3 py-2.5 text-sm">
              <div>
                <span className="font-bold text-charcoal">{m.name}</span>
                {m.ref && <span className="text-xs text-mid-grey ml-2">Ref: {m.ref}</span>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold bg-off-white px-2 py-1 border border-border">
                  x{m.qty}
                </span>
                {!isDeleted && (
                  <button
                    type="button"
                    onClick={() => handleRemoveMaterial(m.id)}
                    className="p-1 text-mid-grey hover:text-danger"
                    aria-label="Eliminar material"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {!isDeleted && (
        <form onSubmit={handleAddMaterial} className="grid grid-cols-1 sm:grid-cols-6 gap-2">
          <div className="relative sm:col-span-3">
            <input
              type="text"
              value={matName}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
              onChange={(e) => {
                setMatName(e.target.value);
                setShowSuggestions(true);
              }}
              placeholder="Pieza o material *"
              className="w-full px-3 py-2 bg-bg-input border border-border text-charcoal"
              autoComplete="off"
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 bg-white border border-border rounded-sm shadow-elevated max-h-52 overflow-y-auto divide-y divide-border/60">
                <div className="px-2.5 py-1 bg-off-white text-[10px] font-extrabold uppercase tracking-wider text-mid-grey">
                  Catálogo de repuestos
                </div>
                {suggestions.map((part) => (
                  <button
                    key={part.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectCatalogPart(part);
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-navy/5 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="font-bold text-charcoal truncate">{part.name}</p>
                      {part.category && (
                        <p className="text-[10px] text-mid-grey truncate">{part.category}</p>
                      )}
                    </div>
                    {part.ref && (
                      <span className="text-[11px] font-semibold px-1.5 py-0.5 bg-off-white border border-border text-navy flex-shrink-0">
                        {part.ref}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            type="text"
            value={matRef}
            onChange={(e) => setMatRef(e.target.value)}
            placeholder="Ref. (opc.)"
            className="sm:col-span-2 px-3 py-2 bg-bg-input border border-border text-charcoal"
          />
          <div className="flex gap-2 sm:col-span-1">
            <input
              type="number"
              min={1}
              value={matQty}
              onChange={(e) => setMatQty(e.target.value)}
              className="w-16 px-2 py-2 bg-bg-input border border-border text-center text-charcoal"
            />
            <button
              type="submit"
              disabled={!matName.trim()}
              className="flex-1 bg-navy text-white px-3 py-2 flex items-center justify-center disabled:opacity-40"
              aria-label="Añadir material"
            >
              <Plus size={18} />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
