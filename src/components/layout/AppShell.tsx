'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Bell,
  Building2,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CloudOff,
  Home,
  LogOut,
  Menu,
  Package,
  PlusCircle,
  Search,
  User,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { getPendingOfflineActions } from '@/lib/offline-queue';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import { SWUpdateBanner } from '@/components/pwa/SWUpdateBanner';
import { InstallBanner } from '@/components/pwa/InstallBanner';
import { InstallGuideSheet } from '@/components/pwa/InstallGuideSheet';
import { NotificationToast } from '@/components/ui/NotificationToast';
import { ROLE_LABELS } from '@/types/database';

const GlobalSearch = dynamic(
  () => import('@/components/layout/GlobalSearch').then((m) => m.GlobalSearch),
  { ssr: false }
);

function UnreadPulseBadge({
  count,
  cap = 99,
  className = '',
  compact = false,
}: {
  count: number;
  cap?: number;
  className?: string;
  compact?: boolean;
}) {
  const text = count > cap ? `${cap}+` : String(count);
  return (
    <span className={`relative inline-flex items-center justify-center ${className}`}>
      <span
        aria-hidden="true"
        className="absolute inset-0 rounded-full bg-magenta opacity-75 animate-ping pointer-events-none"
      />
      <span
        className={`relative bg-magenta text-white font-extrabold rounded-full text-center flex items-center justify-center notif-badge-glow ${
          compact
            ? 'text-[10px] px-1 min-w-[18px] h-[18px] leading-none'
            : 'text-xs px-2 py-0.5 min-w-[22px]'
        }`}
      >
        {text}
      </span>
    </span>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, isLoading, isDemoMode, signOut } = useAuth();
  const { unreadCount, latestToast, dismissToast } = useNotifications();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const redirectedRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!isLoading && !profile && !redirectedRef.current) {
      redirectedRef.current = true;
      router.replace('/login');
    }
  }, [isLoading, profile, router]);

  useEffect(() => {
    const refreshQueue = async () => {
      const items = await getPendingOfflineActions();
      setPendingQueueCount(items.length);
    };
    refreshQueue();
    window.addEventListener('vistasat:offline-queue-changed', refreshQueue);
    window.addEventListener('online', refreshQueue);
    return () => {
      window.removeEventListener('vistasat:offline-queue-changed', refreshQueue);
      window.removeEventListener('online', refreshQueue);
    };
  }, []);

  if (isLoading || !profile) {
    return (
      <div className="min-h-dvh flex flex-col items-center justify-center bg-navy text-white p-6">
        <div className="w-12 h-12 border-4 border-white/30 border-t-magenta rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold tracking-wide">Cargando VistaSatPRO...</p>
      </div>
    );
  }

  const isCoord = profile.role === 'admin' || profile.role === 'coordinator';
  const isAdmin = profile.role === 'admin';

  const desktopLinks = [
    { href: '/dashboard', label: 'Panel General', icon: Home, show: true },
    { href: '/tasks', label: isCoord ? 'Todas las Tareas' : 'Mis Tareas', icon: ClipboardList, show: true },
    { href: '/installations', label: 'Instalaciones', icon: CalendarClock, show: true },
    { href: '/tasks/new', label: 'Nueva Tarea', icon: PlusCircle, show: true },
    { href: '/customers', label: 'Clientes', icon: Building2, show: true },
    { href: '/parts', label: 'Repuestos', icon: Package, show: true },
    { href: '/users', label: 'Equipo y Roles', icon: Users, show: isAdmin },
    { href: '/reports', label: 'Informes', icon: BarChart3, show: isCoord },
    { href: '/notifications', label: 'Notificaciones', icon: Bell, badge: unreadCount, show: true },
    { href: '/profile', label: 'Mi Perfil', icon: User, show: true },
  ].filter((l) => l.show);

  const mobileTabs = [
    { href: '/dashboard', label: 'Inicio', icon: Home },
    { href: '/tasks', label: 'Tareas', icon: ClipboardList },
    { href: '/tasks/new', label: 'Nueva', icon: PlusCircle },
    { href: '/installations', label: 'Instal.', icon: CalendarClock },
  ];

  const moreLinks = [
    { href: '/customers', label: 'Clientes', icon: Building2, show: true },
    { href: '/parts', label: 'Repuestos', icon: Package, show: true },
    { href: '/notifications', label: 'Notificaciones', icon: Bell, badge: unreadCount, show: true },
    { href: '/reports', label: 'Informes', icon: BarChart3, show: isCoord },
    { href: '/users', label: 'Equipo y Roles', icon: Users, show: isAdmin },
    { href: '/profile', label: 'Mi Perfil', icon: User, show: true },
  ].filter((l) => l.show);

  const isActive = (href: string) =>
    href === '/tasks'
      ? pathname === '/tasks' || (pathname.startsWith('/tasks/') && pathname !== '/tasks/new')
      : pathname === href || pathname.startsWith(`${href}/`);

  const isMoreActive = moreLinks.some((item) => isActive(item.href));

  return (
    <div className="min-h-dvh bg-off-white flex flex-col lg:flex-row">
      <OfflineBanner />
      <SWUpdateBanner />

      {/* ─── SIDEBAR ESCRITORIO (Colapsable) ─────────────────────────────── */}
      <aside
        className={`hidden lg:flex flex-col bg-navy text-white flex-shrink-0 sticky top-0 h-dvh transition-all duration-200 ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Cabecera logo + toggle */}
        <div className="h-16 px-4 flex items-center justify-between border-b border-white/10">
          {!sidebarCollapsed && (
            <Link href="/dashboard" className="text-lg font-bold tracking-tight">
              Vista<span className="text-magenta">Sat</span>PRO
            </Link>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 rounded-sm hover:bg-white/10 transition-colors ml-auto"
            aria-label={sidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Badge Demo si aplica */}
        {isDemoMode && !sidebarCollapsed && (
          <div className="mx-3 mt-3 px-3 py-1.5 bg-magenta/20 border border-magenta/40 text-xs font-semibold text-white">
            Modo Prueba (Servidor)
          </div>
        )}

        {/* Botón Búsqueda Global (Ctrl+K) */}
        <div className="px-2 pt-3">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white/90 transition-colors"
            aria-label="Buscar en toda la aplicación"
          >
            <Search size={16} className="flex-shrink-0 text-magenta" />
            {!sidebarCollapsed && (
              <>
                <span className="truncate">Buscar...</span>
                <kbd className="ml-auto text-[10px] px-1.5 py-0.5 bg-black/25 text-white/75 rounded-xs">
                  Ctrl+K
                </kbd>
              </>
            )}
          </button>
        </div>

        {/* Links */}
        <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
          {desktopLinks.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const isNotifLink = item.href === '/notifications';
            const hasUnread = isNotifLink && Boolean(item.badge && item.badge > 0);

            const linkClass = hasUnread
              ? active
                ? 'bg-magenta/30 text-white border-l-4 border-magenta ring-1 ring-inset ring-magenta/60 shadow-[0_0_16px_rgba(207,9,94,0.32)]'
                : 'bg-magenta/20 text-white border-l-4 border-magenta ring-1 ring-inset ring-magenta/45 shadow-[0_0_16px_rgba(207,9,94,0.28)] hover:bg-magenta/30'
              : active
              ? 'bg-white/15 text-white border-l-4 border-magenta'
              : 'text-white/75 hover:bg-white/10 hover:text-white';

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-3 text-sm font-semibold transition-all relative rounded-xs ${linkClass}`}
              >
                <Icon
                  size={20}
                  className={`flex-shrink-0 ${hasUnread ? 'notif-bell-ring text-white' : ''}`}
                />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                {item.badge && item.badge > 0 ? (
                  <UnreadPulseBadge
                    count={item.badge}
                    className={sidebarCollapsed ? 'absolute top-1.5 right-1.5' : 'ml-auto'}
                    compact={sidebarCollapsed}
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>

        {/* Footer usuario */}
        <div className="p-3 border-t border-white/10 space-y-1">
          {!sidebarCollapsed && (
            <div className="px-2 py-2 mb-1">
              <p className="text-sm font-bold truncate">{profile.full_name}</p>
              <p className="text-xs text-white/60 truncate">{ROLE_LABELS[profile.role]}</p>
            </div>
          )}
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-semibold text-white/80 hover:bg-magenta hover:text-white transition-colors"
          >
            <LogOut size={18} />
            {!sidebarCollapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      {/* ─── ÁREA PRINCIPAL ──────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header móvil */}
        <header
          className="lg:hidden sticky top-0 z-30 bg-navy text-white px-4 flex items-center justify-between shadow-nav"
          style={{
            paddingTop: 'var(--safe-top)',
            minHeight: 'calc(56px + var(--safe-top))',
          }}
        >
          <div className="flex items-center gap-2.5">
            <Link href="/dashboard" className="text-lg font-bold tracking-tight">
              Vista<span className="text-magenta">Sat</span>PRO
            </Link>
            {isDemoMode && (
              <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 bg-magenta text-white rounded-sm">
                Prueba
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {pendingQueueCount > 0 && (
              <span
                title={`${pendingQueueCount} cambios pendientes de sincronizar`}
                className="inline-flex items-center gap-1 px-2 py-1 bg-warning text-charcoal text-xs font-bold rounded-full"
              >
                <CloudOff size={13} />
                {pendingQueueCount}
              </span>
            )}

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="p-2 text-white hover:bg-white/10 rounded-full"
              aria-label="Búsqueda global"
            >
              <Search size={19} />
            </button>

            <Link
              href="/notifications"
              className={`relative p-2 text-white rounded-full transition-colors ${
                unreadCount > 0 ? 'bg-magenta/25 hover:bg-magenta/35' : 'hover:bg-white/10'
              }`}
              aria-label="Notificaciones"
            >
              <Bell size={20} className={unreadCount > 0 ? 'notif-bell-ring' : ''} />
              {unreadCount > 0 && (
                <UnreadPulseBadge
                  count={unreadCount}
                  cap={9}
                  compact
                  className="absolute top-0.5 right-0.5"
                />
              )}
            </Link>
          </div>
        </header>

        {/* Contenido */}
        <main className="flex-1 pb-24 lg:pb-8 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* ─── TAB BAR INFERIOR MÓVIL (Fija) ───────────────────────────────── */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-border shadow-nav grid"
        style={{
          gridTemplateColumns: `repeat(${mobileTabs.length + 1}, minmax(0, 1fr))`,
          paddingBottom: 'var(--safe-bottom)',
        }}
      >
        {mobileTabs.map((tab) => {
          const Icon = tab.icon;
          const active = isActive(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              onClick={() => setMoreMenuOpen(false)}
              className={`flex flex-col items-center justify-center py-2 min-h-[60px] relative transition-colors ${
                active ? 'text-navy font-bold' : 'text-mid-grey font-medium'
              }`}
            >
              {active && (
                <span className="absolute top-0 left-3 right-3 h-0.5 bg-magenta" />
              )}
              <Icon size={21} strokeWidth={active ? 2.4 : 1.9} />
              <span className="text-[11px] mt-1 leading-none">{tab.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          onClick={() => setMoreMenuOpen((prev) => !prev)}
          className={`flex flex-col items-center justify-center py-2 min-h-[60px] relative transition-colors ${
            moreMenuOpen || isMoreActive
              ? 'text-navy font-bold'
              : 'text-mid-grey font-medium'
          }`}
          aria-label="Más opciones"
        >
          {(moreMenuOpen || isMoreActive) && (
            <span className="absolute top-0 left-3 right-3 h-0.5 bg-magenta" />
          )}
          <div className="relative">
            {moreMenuOpen ? <X size={21} strokeWidth={2.4} /> : <Menu size={21} strokeWidth={1.9} />}
            {unreadCount > 0 && (
              <UnreadPulseBadge
                count={unreadCount}
                cap={9}
                compact
                className="absolute -top-1.5 -right-2.5"
              />
            )}
          </div>
          <span className="text-[11px] mt-1 leading-none">Más</span>
        </button>
      </nav>

      {/* Menú "Más" móvil con todas las tarjetas restantes */}
      {moreMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-charcoal/70 flex items-end"
          onClick={() => setMoreMenuOpen(false)}
        >
          <div
            className="w-full bg-white rounded-t-lg shadow-elevated p-5 space-y-4"
            style={{ paddingBottom: 'max(var(--safe-bottom), 20px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <p className="text-sm font-extrabold text-charcoal">Más secciones</p>
                <p className="text-xs text-mid-grey">
                  {profile.full_name} · {ROLE_LABELS[profile.role]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMoreMenuOpen(false)}
                className="p-1.5 text-mid-grey hover:text-charcoal"
                aria-label="Cerrar menú más"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {moreLinks.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                const isNotifCard = item.href === '/notifications';
                const hasUnread = isNotifCard && Boolean(item.badge && item.badge > 0);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreMenuOpen(false)}
                    className={`p-3.5 rounded-md border flex items-center gap-3 transition-all relative ${
                      active
                        ? 'bg-navy text-white border-navy'
                        : hasUnread
                        ? 'bg-magenta/10 text-charcoal border-magenta shadow-[0_0_12px_rgba(207,9,94,0.16)]'
                        : 'bg-off-white text-charcoal border-border hover:border-navy'
                    }`}
                  >
                    <Icon
                      size={19}
                      className={`${
                        hasUnread
                          ? `notif-bell-ring ${active ? 'text-white' : 'text-magenta'}`
                          : active
                          ? 'text-magenta'
                          : 'text-navy'
                      }`}
                    />
                    <span className="text-xs font-bold truncate">{item.label}</span>
                    {item.badge && item.badge > 0 ? (
                      <UnreadPulseBadge count={item.badge} compact className="ml-auto" />
                    ) : null}
                  </Link>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => {
                setMoreMenuOpen(false);
                void signOut();
              }}
              className="w-full py-3 bg-danger/10 text-danger border border-danger/30 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 rounded-sm"
            >
              <LogOut size={15} /> Cerrar sesión
            </button>
          </div>
        </div>
      )}

      {searchOpen && (
        <GlobalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      )}
      <NotificationToast notification={latestToast} onDismiss={dismissToast} />
      <InstallBanner />
      <InstallGuideSheet />
    </div>
  );
}
