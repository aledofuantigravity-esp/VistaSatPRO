'use client';

import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (next: ThemePreference) => void;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = 'vistasat_theme';
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    try {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } catch {
      // Silencioso si no hay acceso a almacenamiento
    }
  }, []);

  const setTheme = useCallback(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  const toggleTheme = useCallback(() => {
    document.documentElement.classList.remove('dark');
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme: 'light', resolvedTheme: 'light', setTheme, toggleTheme }),
    [setTheme, toggleTheme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme debe usarse dentro de ThemeProvider');
  }
  return ctx;
}
