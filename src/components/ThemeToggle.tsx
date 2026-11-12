'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { Sun, Moon } from 'lucide-react';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
}

const STORAGE_KEY = 'cinephile-theme';
const LEGACY_STORAGE_KEY = 'cinefuel_theme';

export default function ThemeToggle({ className = '', showLabel = false }: ThemeToggleProps) {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [mounted, setMounted] = useState(false);

  const applyThemeToDOM = useCallback((newTheme: 'dark' | 'light') => {
    const root = document.documentElement;
    const isDark = newTheme === 'dark';

    root.classList.remove('dark', 'light');
    root.classList.add(isDark ? 'dark' : 'light');
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    root.style.colorScheme = isDark ? 'dark' : 'light';

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', isDark ? '#08090c' : '#f8fafc');
    }
  }, []);

  useEffect(() => {
    setMounted(true);

    let activeTheme: 'dark' | 'light' = 'dark';
    try {
      const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') {
        activeTheme = saved;
      } else {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        activeTheme = prefersDark ? 'dark' : 'light';
      }
    } catch {
      // Fallback if localStorage is inaccessible
      activeTheme = 'dark';
    }

    setTheme(activeTheme);
    applyThemeToDOM(activeTheme);

    // Cross-tab synchronization
    const handleStorage = (e: StorageEvent) => {
      if ((e.key === STORAGE_KEY || e.key === LEGACY_STORAGE_KEY) && e.newValue) {
        const next = e.newValue === 'light' ? 'light' : 'dark';
        setTheme(next);
        applyThemeToDOM(next);
      }
    };

    // System theme change listener (active when user has no explicit override or in auto mode)
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleSystemChange = (e: MediaQueryListEvent) => {
      try {
        const explicitPreference = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
        if (!explicitPreference) {
          const sysTheme = e.matches ? 'dark' : 'light';
          setTheme(sysTheme);
          applyThemeToDOM(sysTheme);
        }
      } catch {}
    };

    // Custom internal event listener
    const handleThemeChangeCustom = (e: Event) => {
      const customEvent = e as CustomEvent<'dark' | 'light'>;
      if (customEvent.detail) {
        setTheme(customEvent.detail);
        applyThemeToDOM(customEvent.detail);
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('cinephile_theme_changed', handleThemeChangeCustom);
    window.addEventListener('cinefuel_theme_changed', handleThemeChangeCustom);

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleSystemChange);
    } else if (typeof (mediaQuery as any).addListener === 'function') {
      (mediaQuery as any).addListener(handleSystemChange);
    }

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('cinephile_theme_changed', handleThemeChangeCustom);
      window.removeEventListener('cinefuel_theme_changed', handleThemeChangeCustom);

      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleSystemChange);
      } else if (typeof (mediaQuery as any).removeListener === 'function') {
        (mediaQuery as any).removeListener(handleSystemChange);
      }
    };
  }, [applyThemeToDOM]);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    applyThemeToDOM(nextTheme);

    try {
      localStorage.setItem(STORAGE_KEY, nextTheme);
      localStorage.setItem(LEGACY_STORAGE_KEY, nextTheme);
    } catch {}

    window.dispatchEvent(new CustomEvent('cinephile_theme_changed', { detail: nextTheme }));
    window.dispatchEvent(new CustomEvent('cinefuel_theme_changed', { detail: nextTheme }));
  };

  const isLight = theme === 'light';
  const labelText = isLight ? 'Switch to Dark Mode' : 'Switch to Light Mode';

  if (!mounted) {
    return (
      <button
        type="button"
        disabled
        className={`p-2 rounded-xl bg-zinc-800/80 text-zinc-400 border border-zinc-700/60 transition-all ${className}`}
        aria-label="Toggle theme"
      >
        <span className="relative w-4 h-4 block">
          <Moon className="w-4 h-4 text-zinc-400" />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      role="button"
      onClick={toggleTheme}
      aria-label={labelText}
      aria-pressed={isLight}
      title={labelText}
      className={`relative inline-flex items-center justify-center gap-2 p-2 rounded-xl font-medium text-xs transition-all duration-300 ease-out cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 select-none ${
        isLight
          ? 'bg-amber-50 hover:bg-amber-100/90 text-amber-900 border border-amber-300/80 shadow-sm hover:border-amber-400'
          : 'bg-[#151922] hover:bg-[#1c2230] text-zinc-300 hover:text-amber-400 border border-zinc-750/90 hover:border-amber-500/40 shadow-sm'
      } ${className}`}
    >
      <span className="relative w-4 h-4 flex items-center justify-center shrink-0 overflow-hidden">
        {/* Sun Icon (Rotates & fades in when light) */}
        <Sun
          className={`w-4 h-4 absolute text-amber-600 transition-all duration-350 cubic-bezier(0.16, 1, 0.3, 1) transform motion-reduce:transition-none motion-reduce:transform-none ${
            isLight
              ? 'rotate-0 scale-100 opacity-100'
              : '-rotate-90 scale-0 opacity-0'
          }`}
          aria-hidden="true"
        />
        {/* Moon Icon (Rotates & fades in when dark) */}
        <Moon
          className={`w-4 h-4 absolute text-amber-400 transition-all duration-350 cubic-bezier(0.16, 1, 0.3, 1) transform motion-reduce:transition-none motion-reduce:transform-none ${
            !isLight
              ? 'rotate-0 scale-100 opacity-100'
              : 'rotate-90 scale-0 opacity-0'
          }`}
          aria-hidden="true"
        />
      </span>

      {showLabel && (
        <span className="font-semibold text-xs tracking-wide">
          {isLight ? 'Light Mode' : 'Dark Mode'}
        </span>
      )}
    </button>
  );
}
