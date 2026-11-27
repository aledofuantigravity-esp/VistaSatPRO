import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { useAppCache } from '@/store/app-cache';
import type { PartCatalogItem } from '@/types/database';
import { demoGet, demoPost } from './shared';

export async function listPartsCatalog(): Promise<{
  parts: PartCatalogItem[];
  migrationPending?: boolean;
}> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const res = await demoGet<{ parts: PartCatalogItem[] }>('resource=parts_catalog');
    useAppCache.getState().setPartsCatalog(res.parts);
    return { parts: res.parts };
  }

  const { data, error } = await supabase
    .from('parts_catalog')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return { parts: [], migrationPending: true };
    }
    throw new Error(error.message);
  }

  const parts = (data || []) as PartCatalogItem[];
  useAppCache.getState().setPartsCatalog(parts);
  return { parts };
}

export async function createPartCatalogItem(input: {
  name: string;
  ref?: string | null;
  category?: string | null;
  unit_cost?: number | null;
  notes?: string | null;
  created_by?: string | null;
}): Promise<PartCatalogItem> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const res = await demoPost<{ part: PartCatalogItem }>({
      action: 'create_part_catalog',
      payload: input,
    });
    const current = useAppCache.getState().partsCatalog;
    useAppCache.getState().setPartsCatalog(
      [...current, res.part].sort((a, b) => a.name.localeCompare(b.name))
    );
    return res.part;
  }

  const { data, error } = await supabase
    .from('parts_catalog')
    .insert({
      name: input.name.trim(),
      ref: input.ref?.trim() || null,
      category: input.category?.trim() || null,
      unit_cost: input.unit_cost ?? null,
      notes: input.notes?.trim() || null,
      created_by: input.created_by || null,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      throw new Error(
        'Falta aplicar la migración 0013 en Supabase para activar el Catálogo de Repuestos.'
      );
    }
    throw new Error(error.message);
  }

  const created = data as PartCatalogItem;
  const current = useAppCache.getState().partsCatalog;
  useAppCache.getState().setPartsCatalog(
    [...current, created].sort((a, b) => a.name.localeCompare(b.name))
  );
  return created;
}

export async function updatePartCatalogItem(
  partId: string,
  patch: Partial<
    Pick<PartCatalogItem, 'name' | 'ref' | 'category' | 'unit_cost' | 'notes' | 'is_active'>
  >
): Promise<PartCatalogItem> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const res = await demoPost<{ part: PartCatalogItem }>({
      action: 'update_part_catalog',
      partId,
      patch,
    });
    const current = useAppCache.getState().partsCatalog;
    useAppCache.getState().setPartsCatalog(
      current.map((p) => (p.id === partId ? res.part : p))
    );
    return res.part;
  }

  const { data, error } = await supabase
    .from('parts_catalog')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', partId)
    .select()
    .single();

  if (error) throw new Error(error.message);
  const updated = data as PartCatalogItem;
  const current = useAppCache.getState().partsCatalog;
  useAppCache.getState().setPartsCatalog(
    current.map((p) => (p.id === partId ? updated : p))
  );
  return updated;
}

export async function deletePartCatalogItem(partId: string): Promise<void> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    await demoPost({ action: 'delete_part_catalog', partId });
    const current = useAppCache.getState().partsCatalog;
    useAppCache.getState().setPartsCatalog(current.filter((p) => p.id !== partId));
    return;
  }

  const { error } = await supabase.from('parts_catalog').delete().eq('id', partId);
  if (error) throw new Error(error.message);
  const current = useAppCache.getState().partsCatalog;
  useAppCache.getState().setPartsCatalog(current.filter((p) => p.id !== partId));
}
