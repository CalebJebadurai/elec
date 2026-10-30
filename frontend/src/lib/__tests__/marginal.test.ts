import { describe, it, expect } from 'vitest';
import { seatsForYear, marginHistogram, marginalByParty } from '../marginal';
import type { ConstituencySwingRow } from '../../types';

function row(name: string, year: number, margin: number | null, w = 'A', ru = 'B') {
  return {
    constituency_name: name,
    constituency_no: 1,
    district_name: 'D',
    sub_region: null,
    constituency_type: 'GEN',
    year,
    winner_party: w,
    winner: `${name}-winner`,
    winner_votes: 1,
    winner_vote_share: 40,
    runner_up_party: ru,
    margin_percentage: margin,
    turnout_percentage: 70,
  } as ConstituencySwingRow;
}

const rows = [
  row('X', 2021, 1.5),
  row('Y', 2021, 12, 'B', 'A'),
  row('Z', 2021, 4, 'A', 'C'),
  row('W', 2021, null),
  row('X', 2016, 30),
];

describe('marginal seats', () => {
  it('filters to the year, drops missing margins and sorts tightest first', () => {
    expect(seatsForYear(rows, 2021).map((s) => s.name)).toEqual(['X', 'Z', 'Y']);
  });

  it('bins margins', () => {
    const h = marginHistogram(seatsForYear(rows, 2021));
    expect(h.find((b) => b.label === '<2%')?.seats).toBe(1);
    expect(h.find((b) => b.label === '2–5%')?.seats).toBe(1);
    expect(h.find((b) => b.label === '10–15%')?.seats).toBe(1);
  });

  it('counts marginal seats held and lost narrowly by party', () => {
    const byParty = marginalByParty(seatsForYear(rows, 2021), 5);
    expect(byParty.find((p) => p.party === 'A')).toEqual({ party: 'A', held: 2, secondIn: 0 });
    expect(byParty.find((p) => p.party === 'B')).toEqual({ party: 'B', held: 0, secondIn: 1 });
  });
});
