'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  BarChart3,
  Bell,
  Building2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CloudOff,
  Home,
  LogOut,
  Moon,
  PlusCircle,
  Search,
  Sun,
  User,
  Users,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useNotifications } from '@/hooks/useNotifications';
import { useTheme } from '@/hooks/useTheme';
import { getPendingOfflineActions } from '@/lib/offline-queue';
import { OfflineBanner } from '@/components/pwa/OfflineBanner';
import { SWUpdateBanner } from '@/components/pwa/SWUpdateBanner';
import { InstallBanner } from '@/components/pwa/InstallBanner';
import { InstallGuideSheet } from '@/components/pwa/InstallGuideSheet';
import { GlobalSearch } from '@/components/layout/GlobalSearch';
import { NotificationToast } from '@/components/ui/NotificationToast';
import { ROLE_LABELS } from '@/types/database';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { profile, isLoading, isDemoMode, signOut } = useAuth();
  const { unreadCount, latestToast, dismissToast } = useNotifications();
  const { resolvedTheme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);

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
    { href: '/tasks/new', label: 'Nueva Tarea', icon: PlusCircle, show: true },
    { href: '/customers', label: 'Clientes', icon: Building2, show: true },
    { href: '/users', label: 'Equipo y Roles', icon: Users, show: isAdmin },
    { href: '/reports', label: 'Informes', icon: BarChart3, show: isCoord },
    { href: '/notifications', label: 'Notificaciones', icon: Bell, badge: unreadCount, show: true },
    { href: '/profile', label: 'Mi Perfil', icon: User, show: true },
  ].filter((l) => l.show);

  const mobileTabs = [
    { href: '/dashboard', label: 'Inicio', icon: Home },
    { href: '/tasks', label: 'Tareas', icon: ClipboardList },
    { href: '/tasks/new', label: 'Nueva', icon: PlusCircle },
    { href: '/notifications', label: 'Avisos', icon: Bell, badge: unreadCount },
    { href: '/profile', label: 'Perfil', icon: User },
  ];

  const isActive = (href: string) =>
    href === '/tasks'
      ? pathname === '/tasks' || (pathname.startsWith('/tasks/') && pathname !== '/tasks/new')
      : pathname === href || pathname.startsWith(`${href}/`);

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
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-3 text-sm font-semibold transition-colors relative ${
                  active
                    ? 'bg-white/15 text-white border-l-4 border-magenta'
                    : 'text-white/75 hover:bg-white/10 hover:text-white'
                }`}
              >
                <Icon size={20} className="flex-shrink-0" />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                {item.badge && item.badge > 0 ? (
                  <span
                    className={`${
                      sidebarCollapsed ? 'absolute top-1.5 right-1.5' : 'ml-auto'
                    } bg-magenta text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center`}
                  >
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
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
            type="button"
            onClick={toggleTheme}
            className="w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            aria-label={resolvedTheme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {resolvedTheme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            {!sidebarCollapsed && (
              <span>{resolvedTheme === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>
            )}
          </button>
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

            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 text-white hover:bg-white/10 rounded-full"
              aria-label={resolvedTheme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            >
              {resolvedTheme === 'dark' ? <Sun size={19} /> : <Moon size={19} />}
            </button>

            <Link
              href="/notifications"
              className="relative p-2 text-white hover:bg-white/10 rounded-full"
              aria-label="Notificaciones"
            >
              <Bell size={20} />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 bg-magenta text-white text-[10px] font-bold px-1.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
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
        className="lg:hidden fixed bottom-0 left-0 right-0 z-30 bg-white dark:bg-surface border-t border-border shadow-nav grid"
        style={{
          gridTemplateColumns: `repeat(${mobileTabs.length}, minmax(0, 1fr))`,
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
              className={`flex flex-col items-center justify-center py-2 min-h-[60px] relative transition-colors ${
                active ? 'text-navy dark:text-white font-bold' : 'text-mid-grey font-medium'
              }`}
            >
              {active && (
                <span className="absolute top-0 left-3 right-3 h-0.5 bg-magenta" />
              )}
              <div className="relative">
                <Icon size={21} strokeWidth={active ? 2.4 : 1.9} />
                {tab.badge && tab.badge > 0 ? (
                  <span className="absolute -top-1.5 -right-2.5 bg-magenta text-white text-[10px] font-bold px-1 min-w-[16px] h-4 rounded-full flex items-center justify-center">
                    {tab.badge > 9 ? '9+' : tab.badge}
                  </span>
                ) : null}
              </div>
              <span className="text-[11px] mt-1 leading-none">{tab.label}</span>
            </Link>
          );
        })}
      </nav>

      <GlobalSearch isOpen={searchOpen} onClose={() => setSearchOpen(false)} />
      <NotificationToast notification={latestToast} onDismiss={dismissToast} />
      <InstallBanner />
      <InstallGuideSheet />
    </div>
  );
}
