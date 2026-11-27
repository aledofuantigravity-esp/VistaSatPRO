'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Clock,
  PlusCircle,
  Users,
  Wrench,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { listProfiles, listTasks } from '@/lib/data-service';
import { getSlaStatus } from '@/lib/sla';
import { DashboardCharts } from '@/components/dashboard/DashboardCharts';
import { TaskCard } from '@/components/ui/TaskCard';
import { Button } from '@/components/ui/Button';
import {
  type Profile,
  type Task,
} from '@/types/database';

export default function DashboardPage() {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const profileId = profile?.id;
  const profileRole = profile?.role;

  const loadData = useCallback(async () => {
    if (!profileId || !profileRole) return;
    await Promise.resolve();
    setLoading(true);
    try {
      const viewer = { id: profileId, role: profileRole } as Profile;
      const [t, p] = await Promise.all([
        listTasks(viewer),
        profileRole === 'technician' ? Promise.resolve([]) : listProfiles(),
      ]);
      setTasks(t);
      setProfiles(p);
    } finally {
      setLoading(false);
    }
  }, [profileId, profileRole]);

  useEffect(() => {
    const t = setTimeout(() => void loadData(), 0);
    const handler = () => void loadData();
    window.addEventListener('vistasat:demo-updated', handler);
    return () => {
      clearTimeout(t);
      window.removeEventListener('vistasat:demo-updated', handler);
    };
  }, [loadData]);

  const isCoord = profile?.role === 'admin' || profile?.role === 'coordinator';

  const metrics = useMemo(() => {
    const active = tasks.filter(
      (t) => t.status !== 'completed' && t.status !== 'cancelled'
    );
    const pendingOrAssigned = tasks.filter(
      (t) => t.status === 'pending' || t.status === 'assigned'
    );
    const inProgress = tasks.filter(
      (t) => t.status === 'in_progress' || t.status === 'en_route'
    );
    const completed = tasks.filter((t) => t.status === 'completed');
    const urgent = active.filter(
      (t) => t.priority === 'urgent' || t.priority === 'high'
    );
    const overdueCount = active.filter((t) => getSlaStatus(t)?.state === 'overdue').length;

    const resolvedDurations = completed
      .filter((t) => t.completed_at)
      .map((t) => {
        const diff =
          new Date(t.completed_at!).getTime() - new Date(t.created_at).getTime();
        return Math.max(0.1, diff / 3600000);
      });
    const avgHours =
      resolvedDurations.length > 0
        ? (
            resolvedDurations.reduce((a, b) => a + b, 0) / resolvedDurations.length
          ).toFixed(1)
        : '—';
    const closeRate =
      tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0;

    return {
      total: tasks.length,
      activeCount: active.length,
      pendingCount: pendingOrAssigned.length,
      inProgressCount: inProgress.length,
      completedCount: completed.length,
      urgentCount: urgent.length,
      overdueCount,
      closeRate,
      avgHours,
    };
  }, [tasks]);

  const urgentSpotlight = useMemo(() => {
    const active = tasks.filter(
      (t) => t.status !== 'completed' && t.status !== 'cancelled'
    );
    const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
    return [...active].sort((a, b) => {
      const aOver = getSlaStatus(a)?.state === 'overdue' ? 0 : 1;
      const bOver = getSlaStatus(b)?.state === 'overdue' ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }, [tasks]);

  if (!profile) return null;

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Cabecera de bienvenida */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-magenta">
            {isCoord ? 'Centro de Control SAT' : 'Mi Jornada en Campo'}
          </p>
          <h1 className="text-xl sm:text-2xl font-bold text-charcoal mt-0.5">
            Hola, {profile.full_name}
          </h1>
        </div>

        {isCoord ? (
          <div className="flex flex-wrap gap-2">
            {profile.role === 'admin' && (
              <Link href="/users">
                <Button variant="secondary" size="sm">
                  <Users size={16} /> Usuarios
                </Button>
              </Link>
            )}
            <Link href="/reports">
              <Button variant="secondary" size="sm">
                <BarChart3 size={16} /> Informes
              </Button>
            </Link>
            <Link href="/tasks/new">
              <Button variant="accent" size="sm">
                <PlusCircle size={16} /> Nuevo Parte
              </Button>
            </Link>
          </div>
        ) : (
          <div className="flex gap-2">
            <Link href="/tasks">
              <Button variant="primary" size="sm">
                Ver mis tareas <ArrowRight size={15} />
              </Button>
            </Link>
            <Link href="/tasks/new">
              <Button variant="accent" size="sm">
                <PlusCircle size={16} /> Nuevo Parte
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KPICard
          label="Pendientes / Asignados"
          value={loading ? '…' : String(metrics.pendingCount)}
          icon={<Clock size={20} />}
          colorClass="bg-petrol"
        />
        <KPICard
          label="En Curso / Camino"
          value={loading ? '…' : String(metrics.inProgressCount)}
          icon={<Wrench size={20} />}
          colorClass="bg-navy"
        />
        <KPICard
          label={metrics.overdueCount > 0 ? `Urgentes (${metrics.overdueCount} SLA venc.)` : 'Urgentes / Alta'}
          value={loading ? '…' : String(metrics.urgentCount)}
          icon={<AlertTriangle size={20} />}
          colorClass={metrics.overdueCount > 0 ? 'bg-danger' : 'bg-magenta'}
        />
        <KPICard
          label={`Cierre ${metrics.closeRate}% · Ø ${metrics.avgHours}h`}
          value={loading ? '…' : String(metrics.completedCount)}
          icon={<CheckCircle2 size={20} />}
          colorClass="bg-success"
        />
      </div>

      {/* Gráficos interactivos reales (Recharts) */}
      {!loading && (
        <DashboardCharts tasks={tasks} profiles={profiles} isCoord={isCoord} />
      )}

      {/* Listado prioritario de partes */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base sm:text-lg font-bold text-charcoal">
            {isCoord ? 'Partes Activos Prioritarios' : 'Tus Próximos Partes'}
          </h2>
          <Link
            href="/tasks"
            className="text-xs font-bold text-magenta uppercase tracking-wider hover:underline"
          >
            Ver todos ({tasks.length}) →
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2].map((i) => (
              <div key={i} className="h-40 bg-white dark:bg-surface rounded-md animate-pulse shadow-card" />
            ))}
          </div>
        ) : urgentSpotlight.length === 0 ? (
          <div className="bg-white dark:bg-surface rounded-md p-8 text-center shadow-card">
            <CheckCircle2 size={32} className="text-success mx-auto mb-2" />
            <p className="font-bold text-charcoal">Todo al día</p>
            <p className="text-sm text-mid-grey mt-1">
              No hay partes pendientes en este momento.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {urgentSpotlight.slice(0, 4).map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KPICard({
  label,
  value,
  icon,
  colorClass,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  colorClass: string;
}) {
  return (
    <div className="bg-white dark:bg-surface rounded-md shadow-card p-4 border border-border/50">
      <div className={`inline-flex p-2.5 rounded-sm ${colorClass} text-white mb-2.5`}>
        {icon}
      </div>
      <div className="text-xl sm:text-2xl font-bold text-charcoal leading-none">{value}</div>
      <div className="text-xs text-mid-grey font-semibold mt-1.5">{label}</div>
    </div>
  );
}
