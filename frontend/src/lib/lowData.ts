import { useSyncExternalStore } from 'react';

const KEY = 'low_data';

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
}

/** True when the browser reports Data Saver or a 2G-class connection. */
export function networkPrefersLowData(): boolean {
  if (typeof navigator === 'undefined') return false;
  const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!conn) return false;
  return !!conn.saveData || conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g';
}

function readStored(): boolean | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === '1' ? true : v === '0' ? false : null;
  } catch {
    return null;
  }
}

let current: boolean = readStored() ?? networkPrefersLowData();
const listeners = new Set<() => void>();

function apply() {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('low-data', current);
  }
}
apply();

export function isLowData(): boolean {
  return current;
}

export function setLowData(on: boolean): void {
  current = on;
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    // Storage unavailable; the choice lasts for this page load
  }
  apply();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Low-data mode: lighter pages for cheap phones and slow networks. */
export function useLowData(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, isLowData, isLowData);
  return [on, setLowData];
}
