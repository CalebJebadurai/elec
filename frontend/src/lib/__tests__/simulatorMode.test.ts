import { describe, it, expect } from 'vitest';
import {
  countHiddenAdvancedSettings,
  readSimulatorMode,
  saveSimulatorMode,
} from '../simulatorMode';
import { DEFAULT_PREDICTION_PARAMS } from '../../constants';

describe('simulatorMode', () => {
  it('defaults to simple and remembers the choice', () => {
    localStorage.removeItem('simulator_mode');
    expect(readSimulatorMode()).toBe('simple');
    saveSimulatorMode('advanced');
    expect(readSimulatorMode()).toBe('advanced');
  });

  it('counts only changed advanced settings', () => {
    expect(countHiddenAdvancedSettings(DEFAULT_PREDICTION_PARAMS)).toBe(0);
    expect(
      countHiddenAdvancedSettings({
        ...DEFAULT_PREDICTION_PARAMS,
        antiIncumbencyPct: 40, // simple-mode slider, not counted
        enopFactor: 10,
        totalElectors: 1000,
        constituencyOverrides: { X: 5 },
      })
    ).toBe(3);
  });
});
