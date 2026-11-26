import { Wrench, CheckCircle, Clock, AlertTriangle } from 'lucide-react';

/**
 * Dashboard — Fase 0 (placeholder estructural)
 * Se implementa completamente en Fase 1 (con auth) y Fase 2 (con datos reales).
 */
export default function DashboardPage() {
  return (
    <div className="p-5">
      {/* Greeting */}
      <div className="mb-6">
        <p className="text-sm text-mid-grey font-medium">Buenos días,</p>
        <h1 className="text-xl font-bold text-charcoal">Técnico</h1>
      </div>

      {/* KPI Cards placeholder */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <KPICard
          label="Pendientes"
          value="—"
          icon={<Clock size={20} />}
          color="bg-petrol"
        />
        <KPICard
          label="En proceso"
          value="—"
          icon={<Wrench size={20} />}
          color="bg-magenta"
        />
        <KPICard
          label="Completadas hoy"
          value="—"
          icon={<CheckCircle size={20} />}
          color="bg-success"
        />
        <KPICard
          label="Urgentes"
          value="—"
          icon={<AlertTriangle size={20} />}
          color="bg-danger"
        />
      </div>

      {/* Estado de la Fase 0 */}
      <div className="bg-white rounded-md shadow-card p-4 border-l-4 border-navy">
        <div className="flex items-center gap-2 mb-2">
          <Wrench size={15} className="text-navy" />
          <span className="text-sm font-bold text-navy uppercase tracking-wider">
            Fase 0 completada
          </span>
        </div>
        <p className="text-sm text-dark-grey leading-relaxed">
          Fundamentos PWA activos: manifest, Service Worker, iconos, offline fallback,
          banners de instalación Android/iOS y sistema de diseño Vistalegre.
        </p>
        <ul className="mt-3 space-y-1 text-xs text-mid-grey">
          <li>✅ manifest.webmanifest configurado</li>
          <li>✅ Service Worker registrado (CacheFirst + NetworkFirst)</li>
          <li>✅ Iconos 192px y 512px (standard + maskable)</li>
          <li>✅ Pantalla offline.html corporativa</li>
          <li>✅ InstallBanner (Android) + InstallGuideSheet (iOS)</li>
          <li>✅ Tokens CSS paleta Vistalegre completa</li>
          <li>✅ Montserrat cargada vía next/font</li>
          <li>⏳ Autenticación Supabase → Fase 1</li>
          <li>⏳ Partes de trabajo → Fase 2</li>
          <li>⏳ Push notifications → Fase 3</li>
        </ul>
      </div>
    </div>
  );
}

function KPICard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}) {
  return (
    <div className="bg-white rounded-md shadow-card p-4">
      <div className={`inline-flex p-2 rounded-sm ${color} text-white mb-2`}>
        {icon}
      </div>
      <div className="text-xl font-bold text-charcoal">{value}</div>
      <div className="text-xs text-mid-grey font-medium mt-0.5">{label}</div>
    </div>
  );
}
