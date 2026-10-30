import { useSyncExternalStore } from 'react';

export type Theme = 'dark' | 'light' | 'contrast';

export const THEMES: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
  { value: 'contrast', label: 'High contrast' },
];

const KEY = 'theme';

function isTheme(v: unknown): v is Theme {
  return v === 'dark' || v === 'light' || v === 'contrast';
}

/** Stored choice, else high contrast when the OS asks for more contrast, else dark. */
export function initialTheme(): Theme {
  try {
    const stored = localStorage.getItem(KEY);
    if (isTheme(stored)) return stored;
  } catch {
    // Storage unavailable
  }
  if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-contrast: more)').matches) {
    return 'contrast';
  }
  return 'dark';
}

let current: Theme = initialTheme();
const listeners = new Set<() => void>();

function apply() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-theme', current);
  root.classList.toggle('dark', current !== 'light');
}
apply();

export function getTheme(): Theme {
  return current;
}

export function setTheme(theme: Theme): void {
  current = theme;
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Storage unavailable; lasts for this page load
  }
  apply();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useTheme(): [Theme, (t: Theme) => void] {
  return [useSyncExternalStore(subscribe, getTheme, getTheme), setTheme];
}
