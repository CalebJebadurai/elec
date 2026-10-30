import { useSyncExternalStore } from 'react';

/**
 * Full-screen mode. Hides the header, footer and nav so content owns the
 * screen, and asks the browser for real full screen where the Fullscreen API
 * exists. iPhone Safari has no element full screen, so there it is a layout
 * mode only; adding the site to the home screen launches it full screen via
 * the web manifest.
 */

let current = false;
const listeners = new Set<() => void>();

function emit() {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('immersive', current);
  }
  listeners.forEach((l) => l());
}

export function isImmersive(): boolean {
  return current;
}

/** True when the browser can put the page itself into full screen. */
export function canUseFullscreenApi(): boolean {
  return typeof document !== 'undefined' && !!document.documentElement.requestFullscreen;
}

export function setImmersive(on: boolean): void {
  if (on === current) return;
  current = on;
  emit();
  if (!canUseFullscreenApi()) return;
  if (on && !document.fullscreenElement) {
    document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {
      // Refused (e.g. not from a user gesture); the layout mode still applies
    });
  } else if (!on && document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  }
}

// Leaving full screen with Esc or the system back gesture also leaves the mode
if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && current) {
      current = false;
      emit();
    }
  });
  // Esc also leaves the layout-only mode, where the browser does not handle it
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && current && !document.fullscreenElement) setImmersive(false);
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useImmersive(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, isImmersive, isImmersive);
  return [on, setImmersive];
}
