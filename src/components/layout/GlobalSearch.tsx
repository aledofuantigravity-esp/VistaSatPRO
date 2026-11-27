'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2,
  ClipboardList,
  Loader2,
  Search,
  User,
  X,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { globalSearch, type GlobalSearchResults } from '@/lib/data-service';
import { ROLE_LABELS, TASK_STATUS_META } from '@/types/database';

interface SearchEntry {
  key: string;
  href: string;
  group: 'Partes' | 'Clientes' | 'Equipo';
  title: string;
  subtitle: string;
  badge?: string;
}

export function GlobalSearch({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { profile } = useAuth();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GlobalSearchResults>({
    tasks: [],
    customers: [],
    profiles: [],
  });
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => {
        inputRef.current?.focus();
      }, 20);
      return () => clearTimeout(t);
    }
    const resetT = setTimeout(() => {
      setQuery('');
      setResults({ tasks: [], customers: [], profiles: [] });
      setActiveIndex(0);
    }, 0);
    return () => clearTimeout(resetT);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !profile) return;
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      const t = setTimeout(() => {
        setResults({ tasks: [], customers: [], profiles: [] });
        setLoading(false);
      }, 0);
      return () => clearTimeout(t);
    }

    let cancelled = false;
    const startT = setTimeout(() => {
      setLoading(true);
      void globalSearch(trimmed, profile)
        .then((res) => {
          if (!cancelled) {
            setResults(res);
            setActiveIndex(0);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setResults({ tasks: [], customers: [], profiles: [] });
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(startT);
    };
  }, [query, isOpen, profile]);

  const entries = useMemo<SearchEntry[]>(() => {
    const list: SearchEntry[] = [];
    for (const t of results.tasks) {
      list.push({
        key: `task-${t.id}`,
        href: `/tasks/${t.id}`,
        group: 'Partes',
        title: `${t.code} · ${t.customer?.name || 'Cliente'}`,
        subtitle: [t.equipment_ref, t.site_city, t.problem_desc].filter(Boolean).join(' · '),
        badge: TASK_STATUS_META[t.status]?.label,
      });
    }
    for (const c of results.customers) {
      list.push({
        key: `cust-${c.id}`,
        href: `/customers?selected=${encodeURIComponent(c.id)}`,
        group: 'Clientes',
        title: c.name,
        subtitle: [c.tax_id, c.city, c.contact_name].filter(Boolean).join(' · ') || 'Sin detalles',
        badge: c.is_active ? 'Activo' : 'Inactivo',
      });
    }
    for (const p of results.profiles) {
      list.push({
        key: `prof-${p.id}`,
        href: `/users`,
        group: 'Equipo',
        title: p.full_name,
        subtitle: [p.email, p.phone].filter(Boolean).join(' · '),
        badge: ROLE_LABELS[p.role],
      });
    }
    return list;
  }, [results]);

  if (!isOpen) return null;

  const navigateTo = (href: string) => {
    onClose();
    router.push(href);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (entries.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev + 1) % entries.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev - 1 + entries.length) % entries.length);
    } else if (e.key === 'Enter' && entries[activeIndex]) {
      e.preventDefault();
      navigateTo(entries[activeIndex].href);
    }
  };

  const groups: Array<'Partes' | 'Clientes' | 'Equipo'> = ['Partes', 'Clientes', 'Equipo'];

  return (
    <div
      className="fixed inset-0 z-50 bg-charcoal/70 dark:bg-black/75 backdrop-blur-xs flex items-start justify-center p-3 sm:pt-16"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Búsqueda global"
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-surface border border-border rounded-lg shadow-elevated overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-off-white/60 dark:bg-bg-input">
          {loading ? (
            <Loader2 size={19} className="text-magenta animate-spin flex-shrink-0" />
          ) : (
            <Search size={19} className="text-navy dark:text-slate-300 flex-shrink-0" />
          )}
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar partes, clientes, nº de serie, dirección o usuarios..."
            className="w-full bg-transparent text-sm text-charcoal placeholder:text-mid-grey focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-mid-grey hover:text-charcoal"
            aria-label="Cerrar búsqueda"
          >
            <X size={18} />
          </button>
        </div>

        {/* Resultados */}
        <div className="max-h-[65dvh] overflow-y-auto divide-y divide-border/60">
          {query.trim().length < 2 ? (
            <div className="p-6 text-center text-xs text-mid-grey space-y-1">
              <p className="font-bold text-charcoal">Búsqueda rápida en VistaSatPRO</p>
              <p>Escribe al menos 2 caracteres para buscar en partes, clientes y equipo.</p>
            </div>
          ) : !loading && entries.length === 0 ? (
            <div className="p-8 text-center text-sm text-mid-grey">
              No hay resultados para &ldquo;{query.trim()}&rdquo;.
            </div>
          ) : (
            groups.map((group) => {
              const groupItems = entries.filter((e) => e.group === group);
              if (groupItems.length === 0) return null;
              const Icon =
                group === 'Partes' ? ClipboardList : group === 'Clientes' ? Building2 : User;
              return (
                <div key={group} className="p-2">
                  <div className="px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-mid-grey flex items-center gap-1.5">
                    <Icon size={13} className="text-magenta" /> {group} ({groupItems.length})
                  </div>
                  <div className="space-y-1">
                    {groupItems.map((item) => {
                      const idx = entries.findIndex((e) => e.key === item.key);
                      const isSelected = idx === activeIndex;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onMouseEnter={() => setActiveIndex(idx)}
                          onClick={() => navigateTo(item.href)}
                          className={`w-full text-left px-3 py-2.5 rounded-sm flex items-center justify-between gap-3 transition-colors ${
                            isSelected
                              ? 'bg-navy text-white'
                              : 'hover:bg-off-white dark:hover:bg-white/5 text-charcoal'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold truncate">{item.title}</p>
                            <p
                              className={`text-xs truncate mt-0.5 ${
                                isSelected ? 'text-white/80' : 'text-mid-grey'
                              }`}
                            >
                              {item.subtitle}
                            </p>
                          </div>
                          {item.badge && (
                            <span
                              className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-sm flex-shrink-0 ${
                                isSelected
                                  ? 'bg-white/20 text-white'
                                  : 'bg-off-white dark:bg-bg-input text-dark-grey border border-border'
                              }`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer atajos */}
        <div className="px-4 py-2 bg-off-white/80 dark:bg-bg-input border-t border-border text-[11px] text-mid-grey flex items-center justify-between">
          <span>↑↓ Navegar · Enter Abrir · Esc Cerrar</span>
          <span className="hidden sm:inline font-semibold">Atajo: Ctrl+K</span>
        </div>
      </div>
    </div>
  );
}
