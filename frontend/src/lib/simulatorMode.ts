import { FACTOR_CATALOG } from '../engine/factorConfig';
import type { AppPredictionParams } from '../types';

export type SimulatorMode = 'simple' | 'advanced';

const KEY = 'simulator_mode';

export function readSimulatorMode(): SimulatorMode {
  try {
    return localStorage.getItem(KEY) === 'advanced' ? 'advanced' : 'simple';
  } catch {
    return 'simple';
  }
}

export function saveSimulatorMode(mode: SimulatorMode): void {
  try {
    localStorage.setItem(KEY, mode);
  } catch {
    // Storage unavailable; mode lasts for this page load
  }
}

/**
 * Number of settings that only the advanced view shows but which are changed
 * from their defaults, so simple-mode users know hidden settings still apply.
 */
export function countHiddenAdvancedSettings(params: AppPredictionParams): number {
  let n = 0;
  for (const f of FACTOR_CATALOG) {
    const v = params[f.name as keyof AppPredictionParams];
    if (typeof v === 'number' && v !== f.defaultValue) n++;
  }
  if (params.swingSittingMla) n++;
  if (params.swingTurnout) n++;
  if (params.swingElectorateGrowth) n++;
  n += params.voterGroups.filter((g) => g.party && g.lean !== 0).length;
  if (params.totalElectors) n++;
  if (params.allianceConfig.length > 0) n++;
  if (Object.keys(params.constituencyOverrides).length > 0) n++;
  return n;
}
