const prefersReducedMotion =
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function withReducedMotion<T extends Record<string, unknown>>(preset: T): T {
  if (prefersReducedMotion) {
    return { ...preset, transition: { duration: 0 } } as T;
  }
  return preset;
}

export const pageTransition = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 1, y: 0 },
  transition: { duration: 0.2, ease: 'easeOut' },
};

export const modalEntrance = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
  transition: { duration: 0.2, ease: 'easeOut' },
};

export const interactiveFeedback = {
  whileTap: prefersReducedMotion ? undefined : { scale: 0.97 },
};

export const sliderThumbFeedback = {
  whileTap: prefersReducedMotion ? undefined : { scale: 1.2 },
};

export const collapsibleExpand = {
  transition: { duration: prefersReducedMotion ? 0 : 0.2 },
};

export const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: prefersReducedMotion ? 0 : 0.05,
    },
  },
};

export const staggerItem = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: prefersReducedMotion ? 0 : 0.2 },
};

export { prefersReducedMotion, withReducedMotion };
