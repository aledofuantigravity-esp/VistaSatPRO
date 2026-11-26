'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, Shield } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';
import { downloadCsv } from '@/lib/csv';
import { listCustomers, listProfiles, listTasks } from '@/lib/data-service';
import type { Customer, Profile, Task } from '@/types/database';

export default function ReportsPage() {
  return (
    <AppShell>
      <ReportsContent />
    </AppShell>
  );
}

function ReportsContent() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);

  const profileId = profile?.id;
  const profileRole = profile?.role;

  const load = useCallback(async () => {
    if (!profileId || !profileRole) return;
    await Promise.resolve();
    setLoading(true);
    try {
      const viewer = { id: profileId, role: profileRole } as Profile;
      const [t, p, c] = await Promise.all([
        listTasks(viewer),
        listProfiles(),
        listCustomers(),
      ]);
      setTasks(t);
      setProfiles(p);
      setCustomers(c);
    } finally {
      setLoading(false);
    }
  }, [profileId, profileRole]);

  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);

  const techStats = useMemo(() => {
    return profiles
      .filter((p) => p.role === 'technician')
      .map((tech) => {
        const assigned = tasks.filter((t) => t.assigned_to === tech.id);
        const completed = assigned.filter((t) => t.status === 'completed');
        const avgHours =
          completed.length > 0
            ? (
                completed.reduce((acc, t) => {
                  const end = t.completed_at ? new Date(t.completed_at).getTime() : Date.now();
                  return acc + Math.max(0.1, (end - new Date(t.created_at).getTime()) / 3600000);
                }, 0) / completed.length
              ).toFixed(1)
            : '—';
        const rate =
          assigned.length > 0 ? Math.round((completed.length / assigned.length) * 100) : 0;
        return { tech, total: assigned.length, completed: completed.length, avgHours, rate };
      });
  }, [profiles, tasks]);

  const topCustomers = useMemo(() => {
    return customers
      .map((c) => {
        const cTasks = tasks.filter((t) => t.customer_id === c.id);
        const open = cTasks.filter(
          (t) => t.status !== 'completed' && t.status !== 'cancelled'
        ).length;
        return { customer: c, total: cTasks.length, open };
      })
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [customers, tasks]);

  if (!profile) return null;
  if (profile.role === 'technician') {
    return (
      <div className="p-6 text-center">
        <Shield size={40} className="text-danger mx-auto mb-2" />
        <h1 className="text-lg font-bold text-charcoal">Acceso restringido</h1>
      </div>
    );
  }

  const exportSummaryCSV = () => {
    const headers = [
      'Técnico',
      'Partes Totales',
      'Completados',
      'Tasa Cierre %',
      'Tiempo Medio (h)',
    ];
    const rows = techStats.map((r) => [
      r.tech.full_name,
      String(r.total),
      String(r.completed),
      `${r.rate}%`,
      String(r.avgHours),
    ]);
    downloadCsv(
      `VistaSatPRO_informe_tecnicos_${new Date().toISOString().slice(0, 10)}.csv`,
      headers,
      rows
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-charcoal flex items-center gap-2">
            <BarChart3 size={22} className="text-navy" /> Informes Operativos SAT
          </h1>
          <p className="text-xs text-mid-grey mt-0.5">
            Rendimiento por técnico, tiempos de resolución y volumen por cliente
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={exportSummaryCSV}>
          <Download size={15} /> Exportar CSV Técnicos
        </Button>
      </div>

      {loading ? (
        <div className="h-48 bg-white rounded-md animate-pulse shadow-card" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Rendimiento por técnico */}
          <div className="bg-white rounded-md shadow-card p-5 border border-border/60 overflow-x-auto">
            <h2 className="text-base font-bold text-charcoal mb-4">
              Rendimiento por Técnico
            </h2>
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-mid-grey">
                  <th className="py-2 pr-3">Técnico</th>
                  <th className="py-2 px-2 text-center">Totales</th>
                  <th className="py-2 px-2 text-center">Cerrados</th>
                  <th className="py-2 px-2 text-center">Tasa</th>
                  <th className="py-2 pl-2 text-right">Ø Resol.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {techStats.map((row) => (
                  <tr key={row.tech.id}>
                    <td className="py-3 pr-3 font-semibold text-charcoal">
                      {row.tech.full_name}
                    </td>
                    <td className="py-3 px-2 text-center">{row.total}</td>
                    <td className="py-3 px-2 text-center font-bold text-success">
                      {row.completed}
                    </td>
                    <td className="py-3 px-2 text-center">{row.rate}%</td>
                    <td className="py-3 pl-2 text-right text-navy font-bold">
                      {row.avgHours === '—' ? '—' : `${row.avgHours}h`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Top Clientes */}
          <div className="bg-white rounded-md shadow-card p-5 border border-border/60 overflow-x-auto">
            <h2 className="text-base font-bold text-charcoal mb-4">
              Partes por Cliente (Top 10)
            </h2>
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-xs uppercase text-mid-grey">
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 px-2 text-center">Total Partes</th>
                  <th className="py-2 pl-2 text-right">Abiertos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {topCustomers.map((row) => (
                  <tr key={row.customer.id}>
                    <td className="py-3 pr-3 font-semibold text-charcoal">
                      {row.customer.name}
                    </td>
                    <td className="py-3 px-2 text-center font-bold">{row.total}</td>
                    <td className="py-3 pl-2 text-right text-magenta font-bold">
                      {row.open}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
