'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Package,
  Pencil,
  Plus,
  Power,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import {
  createPartCatalogItem,
  deletePartCatalogItem,
  listPartsCatalog,
  updatePartCatalogItem,
} from '@/lib/data-service';
import { useAppCache } from '@/store/app-cache';
import type { PartCatalogItem } from '@/types/database';

export default function PartsCatalogPage() {
  return <PartsCatalogContent />;
}

function PartsCatalogContent() {
  const { profile } = useAuth();
  const cachedParts = useAppCache((s) => s.partsCatalog);
  const partsLoadedAt = useAppCache((s) => s.partsLoadedAt);

  const [parts, setParts] = useState<PartCatalogItem[]>(cachedParts);
  const [loading, setLoading] = useState(!partsLoadedAt);
  const [migrationPending, setMigrationPending] = useState(false);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search);
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [feedback, setFeedback] = useState<string | null>(null);

  // Modal creación / edición
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PartCatalogItem | null>(null);
  const [name, setName] = useState('');
  const [refCode, setRefCode] = useState('');
  const [category, setCategory] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async (silent = false) => {
    await Promise.resolve();
    const hasCached = useAppCache.getState().partsLoadedAt !== null;
    if (!silent && !hasCached) setLoading(true);
    try {
      const res = await listPartsCatalog({ force: silent });
      setParts(res.parts);
      setMigrationPending(Boolean(res.migrationPending));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    const handler = () => void load(true);
    window.addEventListener('vistasat:demo-updated', handler);
    return () => {
      clearTimeout(t);
      window.removeEventListener('vistasat:demo-updated', handler);
    };
  }, [load]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    parts.forEach((p) => {
      if (p.category?.trim()) set.add(p.category.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [parts]);

  const filtered = useMemo(() => {
    return parts.filter((p) => {
      if (statusFilter === 'active' && !p.is_active) return false;
      if (statusFilter === 'inactive' && p.is_active) return false;
      if (categoryFilter !== 'all' && (p.category?.trim() || '') !== categoryFilter) {
        return false;
      }
      if (deferredSearch.trim()) {
        const q = deferredSearch.toLowerCase();
        const hay = [p.name, p.ref, p.category, p.notes]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [parts, statusFilter, categoryFilter, deferredSearch]);

  if (!profile) return null;
  const isCoord = profile.role === 'admin' || profile.role === 'coordinator';

  const showTempMsg = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback(null), 3500);
  };

  const openNew = () => {
    setEditing(null);
    setName('');
    setRefCode('');
    setCategory('');
    setUnitCost('');
    setNotes('');
    setFormError(null);
    setShowModal(true);
  };

  const openEdit = (p: PartCatalogItem) => {
    setEditing(p);
    setName(p.name);
    setRefCode(p.ref || '');
    setCategory(p.category || '');
    setUnitCost(p.unit_cost != null ? String(p.unit_cost) : '');
    setNotes(p.notes || '');
    setFormError(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError('El nombre del repuesto es obligatorio.');
      return;
    }
    const parsedCost = unitCost.trim() === '' ? null : Number(unitCost.replace(',', '.'));
    if (parsedCost !== null && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
      setFormError('El coste unitario debe ser un número positivo válido.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      if (editing) {
        await updatePartCatalogItem(editing.id, {
          name: name.trim(),
          ref: refCode.trim() || null,
          category: category.trim() || null,
          unit_cost: parsedCost,
          notes: notes.trim() || null,
        });
        showTempMsg('Repuesto actualizado correctamente.');
      } else {
        await createPartCatalogItem({
          name: name.trim(),
          ref: refCode.trim() || null,
          category: category.trim() || null,
          unit_cost: parsedCost,
          notes: notes.trim() || null,
          created_by: profile.id,
        });
        showTempMsg('Repuesto añadido al catálogo.');
      }
      setShowModal(false);
      await load(true);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo guardar el repuesto.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (p: PartCatalogItem) => {
    try {
      await updatePartCatalogItem(p.id, { is_active: !p.is_active });
      showTempMsg(p.is_active ? 'Repuesto desactivado.' : 'Repuesto reactivado.');
      await load(true);
    } catch (err) {
      showTempMsg(err instanceof Error ? err.message : 'Error cambiando estado.');
    }
  };

  const handleDelete = async (p: PartCatalogItem) => {
    try {
      await deletePartCatalogItem(p.id);
      showTempMsg(`Repuesto "${p.name}" eliminado del catálogo.`);
      await load(true);
    } catch (err) {
      showTempMsg(err instanceof Error ? err.message : 'Error eliminando repuesto.');
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {feedback && (
        <div className="p-3 bg-navy text-white text-xs font-bold border-l-4 border-magenta shadow-card">
          {feedback}
        </div>
      )}

      {migrationPending && (
        <div className="p-3.5 bg-amber-50 border-l-4 border-amber-500 text-xs text-charcoal flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <strong>Migración 0013 pendiente en Supabase:</strong> Ejecuta el script{' '}
            <code>0013_storage_delete_and_parts_catalog.sql</code> en Supabase SQL Editor para
            activar la tabla de repuestos frecuentes en producción.
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-charcoal flex items-center gap-2">
            <Package size={22} className="text-navy" /> Catálogo de Repuestos
          </h1>
          <p className="text-xs text-mid-grey mt-0.5">
            {filtered.length} de {parts.length} repuestos · Disponible para autocompletado en partes RMA y CXC
          </p>
        </div>
        {isCoord && (
          <Button variant="accent" size="sm" onClick={openNew}>
            <Plus size={16} /> Nuevo Repuesto
          </Button>
        )}
      </div>

      {/* Buscador y filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <div className="relative sm:col-span-2">
          <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-mid-grey" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar repuesto por nombre, referencia o categoría..."
            className="w-full pl-10 pr-3 py-2.5 bg-white border border-border text-charcoal"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-3 py-2.5 bg-white border border-border text-sm text-charcoal"
          aria-label="Filtrar por categoría"
        >
          <option value="all">Todas las categorías</option>
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'active' | 'inactive' | 'all')}
          className="px-3 py-2.5 bg-white border border-border text-sm text-charcoal"
          aria-label="Filtrar por estado"
        >
          <option value="active">Solo activos</option>
          <option value="inactive">Inactivos</option>
          <option value="all">Todos</option>
        </select>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-32 bg-white rounded-md animate-pulse shadow-card" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-md p-8 text-center shadow-card">
          <p className="font-bold text-charcoal">No hay repuestos que coincidan</p>
          <p className="text-sm text-mid-grey mt-1">
            {isCoord
              ? 'Añade un repuesto frecuente para que los técnicos lo autocompleten rápido en los partes.'
              : 'Prueba con otro término de búsqueda o limpia los filtros.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((p) => (
            <div
              key={p.id}
              className={`bg-white rounded-md shadow-card p-4 border-l-4 flex flex-col justify-between gap-3 ${
                p.is_active ? 'border-navy' : 'border-light-grey opacity-65'
              }`}
            >
              <div className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-bold text-charcoal">{p.name}</h3>
                    {p.category && (
                      <span className="inline-block text-[11px] font-bold text-petrol mt-0.5">
                        {p.category}
                      </span>
                    )}
                  </div>
                  {p.ref && (
                    <span className="text-[11px] font-bold px-2 py-0.5 bg-off-white border border-border text-navy flex-shrink-0">
                      Ref: {p.ref}
                    </span>
                  )}
                </div>

                {p.notes && <p className="text-xs text-mid-grey">{p.notes}</p>}
              </div>

              <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
                <span className="font-bold text-dark-grey">
                  {p.unit_cost != null ? `${p.unit_cost.toFixed(2)} €` : 'Sin coste orientativo'}
                </span>

                {isCoord && (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => openEdit(p)}
                      className="font-bold text-navy hover:underline inline-flex items-center gap-1"
                    >
                      <Pencil size={12} /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleActive(p)}
                      className="font-bold text-mid-grey hover:text-charcoal inline-flex items-center gap-1"
                    >
                      <Power size={12} /> {p.is_active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(p)}
                      className="font-bold text-danger hover:underline inline-flex items-center gap-1"
                      aria-label={`Eliminar ${p.name}`}
                    >
                      <Trash2 size={12} /> Eliminar
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear / Editar Repuesto */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 bg-charcoal/70 flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white w-full sm:max-w-lg rounded-t-lg sm:rounded-lg shadow-elevated overflow-hidden max-h-[90dvh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-navy text-white px-5 py-4 flex items-center justify-between">
              <h2 className="text-base font-bold">
                {editing ? 'Editar Repuesto' : 'Nuevo Repuesto en Catálogo'}
              </h2>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1 text-white/80"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-5 space-y-3 overflow-y-auto">
              {formError && (
                <div className="p-3 bg-danger/10 border-l-4 border-danger text-xs font-bold text-danger">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                  Nombre de la pieza o repuesto *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej. Fusor Ricoh IM C3500"
                  className="w-full px-3 py-2 bg-bg-input border border-border text-charcoal"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    Referencia
                  </label>
                  <input
                    type="text"
                    value={refCode}
                    onChange={(e) => setRefCode(e.target.value)}
                    placeholder="Ej. FUS-400"
                    className="w-full px-3 py-2 bg-bg-input border border-border text-charcoal"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    Categoría
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="Ej. Consumibles CXC"
                    className="w-full px-3 py-2 bg-bg-input border border-border text-charcoal"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                    Coste orient. (€)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={unitCost}
                    onChange={(e) => setUnitCost(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-bg-input border border-border text-charcoal"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-mid-grey mb-1">
                  Notas técnicas (opc.)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Modelos compatibles, vida útil..."
                  className="w-full px-3 py-2 bg-bg-input border border-border text-charcoal"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <Button type="button" variant="secondary" onClick={() => setShowModal(false)}>
                  Cancelar
                </Button>
                <Button type="submit" variant="accent" isLoading={saving}>
                  Guardar
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
