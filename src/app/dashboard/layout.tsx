import type { Metadata } from 'next';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import { SWUpdateBanner } from '@/components/pwa/SWUpdateBanner';
import { InstallBanner } from '@/components/pwa/InstallBanner';
import { InstallGuideSheet } from '@/components/pwa/InstallGuideSheet';

export const metadata: Metadata = {
  title: 'Panel de control',
};

/**
 * Layout del dashboard — shell principal de la app una vez autenticado.
 * Incluye los banners de PWA, offline y actualización de SW.
 * En Fase 1 se añadirá el Tab Bar y la Sidebar.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-off-white flex flex-col">
      {/* Banners de sistema (posición fija) */}
      <OfflineBanner />
      <SWUpdateBanner />

      {/* Contenido principal — con padding para tab bar en móvil (Fase 1) */}
      <main
        className="flex-1 flex flex-col"
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        {children}
      </main>

      {/* Banners de instalación */}
      <InstallBanner />
      <InstallGuideSheet />
    </div>
  );
}
