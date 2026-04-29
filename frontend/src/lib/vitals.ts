import { onLCP, onINP, onCLS } from 'web-vitals';

function reportMetric(metric: { name: string; value: number; id: string }) {
  try {
    if (import.meta.env.DEV) {
      console.log(`[web-vitals] ${metric.name}: ${metric.value.toFixed(2)} (${metric.id})`);
    }
  } catch {
    // Analytics failures must never affect the user experience
  }
}

export function initVitals() {
  try {
    onLCP(reportMetric);
    onINP(reportMetric);
    onCLS(reportMetric);
  } catch {
    // Silently fail if web-vitals cannot initialize
  }
}
