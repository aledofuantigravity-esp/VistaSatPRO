import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { loadDemoState } from '@/lib/demo-store';
import { useAppCache } from '@/store/app-cache';
import { normalizeTaskStatus, type Customer, type Profile, type Task } from '@/types/database';
import { demoGet, demoPost } from './shared';

export async function listCustomers(): Promise<Customer[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    try {
      const data = await demoGet<{ customers: Customer[] }>('resource=customers');
      useAppCache.getState().setCustomers(data.customers);
      return data.customers;
    } catch {
      const fallback = loadDemoState().customers.sort((a, b) => a.name.localeCompare(b.name));
      useAppCache.getState().setCustomers(fallback);
      return fallback;
    }
  }

  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw new Error(error.message);
  const customers = (data || []) as Customer[];
  useAppCache.getState().setCustomers(customers);
  return customers;
}

/**
 * Obtiene el número de partes totales y activos por cliente mediante una consulta ligera
 * sin descargar descripciones, adjuntos ni joins.
 */
export async function listCustomerTaskCounts(): Promise<
  Record<string, { total: number; active: number }>
> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    try {
      const data = await demoGet<{
        counts: Record<string, { total: number; active: number }>;
      }>('resource=customer_task_counts');
      useAppCache.getState().setCustomerCounts(data.counts);
      return data.counts;
    } catch {
      const fallback: Record<string, { total: number; active: number }> = {};
      for (const t of loadDemoState().tasks) {
        if (t.deleted_at) continue;
        const entry = fallback[t.customer_id] || { total: 0, active: 0 };
        entry.total += 1;
        const st = normalizeTaskStatus(t.status);
        if (st !== 'completed' && st !== 'cancelled') entry.active += 1;
        fallback[t.customer_id] = entry;
      }
      useAppCache.getState().setCustomerCounts(fallback);
      return fallback;
    }
  }

  const { data, error } = await supabase
    .from('tasks')
    .select('customer_id, status')
    .is('deleted_at', null);

  if (error) throw new Error(error.message);

  const counts: Record<string, { total: number; active: number }> = {};
  for (const row of (data || []) as Array<{ customer_id: string; status: string }>) {
    const entry = counts[row.customer_id] || { total: 0, active: 0 };
    entry.total += 1;
    const st = normalizeTaskStatus(row.status);
    if (st !== 'completed' && st !== 'cancelled') {
      entry.active += 1;
    }
    counts[row.customer_id] = entry;
  }

  useAppCache.getState().setCustomerCounts(counts);
  return counts;
}

/**
 * Carga bajo demanda los partes activos de un cliente concreto al abrir su ficha.
 */
export async function listTasksByCustomer(
  customerId: string,
  viewer: Profile
): Promise<Task[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const res = await demoGet<{ tasks: Task[] }>(
      `resource=tasks&userId=${encodeURIComponent(viewer.id)}`
    );
    return res.tasks
      .filter((t) => t.customer_id === customerId && !t.deleted_at)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  const { data, error } = await supabase
    .from('tasks')
    .select(
      '*, customer:customers(*), assignee:profiles!tasks_assigned_to_fkey(*), creator:profiles!tasks_created_by_fkey(*)'
    )
    .eq('customer_id', customerId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return ((data || []) as Task[]).map((row) => ({
    ...row,
    status: normalizeTaskStatus(row.status),
  }));
}

export async function createCustomer(
  input: Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'is_active' | 'country'> & {
    country?: string;
  }
): Promise<Customer> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const data = await demoPost<{ customer: Customer }>({
      action: 'create_customer',
      payload: input,
    });
    const current = useAppCache.getState().customers;
    useAppCache.getState().setCustomers(
      [...current, data.customer].sort((a, b) => a.name.localeCompare(b.name))
    );
    return data.customer;
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({ ...input, country: input.country || 'ES' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  const created = data as Customer;
  const current = useAppCache.getState().customers;
  useAppCache.getState().setCustomers(
    [...current, created].sort((a, b) => a.name.localeCompare(b.name))
  );
  return created;
}

export async function updateCustomer(
  customerId: string,
  patch: Partial<Customer>
): Promise<Customer> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    const data = await demoPost<{ customer: Customer }>({
      action: 'update_customer',
      customerId,
      patch,
    });
    const current = useAppCache.getState().customers;
    useAppCache.getState().setCustomers(
      current.map((c) => (c.id === customerId ? data.customer : c))
    );
    return data.customer;
  }

  const { data, error } = await supabase
    .from('customers')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', customerId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  const updated = data as Customer;
  const current = useAppCache.getState().customers;
  useAppCache.getState().setCustomers(
    current.map((c) => (c.id === customerId ? updated : c))
  );
  return updated;
}
