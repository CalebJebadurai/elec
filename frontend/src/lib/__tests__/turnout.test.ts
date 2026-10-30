import { describe, it, expect } from 'vitest';
import { stateTurnoutByYear, compareTurnout, describeTurnout } from '../turnout';
import type { ConstituencyResult, ConstituencySwingRow } from '../../types';

const rows = [
  { year: 2016, turnout_percentage: 70 },
  { year: 2016, turnout_percentage: 80 },
  { year: 2021, turnout_percentage: 72 },
  { year: 2021, turnout_percentage: null },
] as ConstituencySwingRow[];

const results = [
  { year: 2021, turnout_percentage: 75.25 },
  { year: 2016, turnout_percentage: 71 },
] as ConstituencyResult[];

describe('turnout comparison', () => {
  it('averages constituency turnouts per year, skipping missing values', () => {
    expect(stateTurnoutByYear(rows)).toEqual({ 2016: 75, 2021: 72 });
  });

  it('pairs each year with the state average and describes the latest', () => {
    const pts = compareTurnout(results, stateTurnoutByYear(rows));
    expect(pts).toEqual([
      { year: 2016, here: 71, stateAvg: 75 },
      { year: 2021, here: 75.25, stateAvg: 72 },
    ]);
    expect(describeTurnout(pts)).toBe(
      'In 2021, 75.3% of electors here voted, 3.3 points above the state average of 72.0%. Since 2016 it has risen from 71.0%.'
    );
  });

  it('returns null without data', () => {
    expect(describeTurnout([])).toBeNull();
  });
});
