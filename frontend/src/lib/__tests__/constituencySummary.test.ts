import { describe, it, expect } from 'vitest';
import { summarizeConstituency, describeLatestResult, marginLabel } from '../constituencySummary';
import type { ConstituencyResult } from '../../types';

function result(
  year: number,
  winner: string,
  party: string,
  extra: Partial<ConstituencyResult> = {}
) {
  return {
    year,
    constituency_name: 'X',
    constituency_no: 1,
    winner,
    winner_party: party,
    winner_votes: 1000,
    runner_up: 'R',
    runner_up_party: 'RP',
    runner_up_votes: 900,
    margin: 100,
    margin_percentage: 5,
    turnout_percentage: 70,
    enop: 2.5,
    valid_votes: 2000,
    electors: 3000,
    n_cand: 5,
    ...extra,
  } as ConstituencyResult;
}

describe('summarizeConstituency', () => {
  it('merges consecutive terms and lists most recent first', () => {
    const s = summarizeConstituency([
      result(2011, 'A', 'P1'),
      result(2021, 'B', 'P2'),
      result(2016, 'A', 'P1'),
    ]);
    expect(s.latest?.year).toBe(2021);
    expect(s.previous?.year).toBe(2016);
    expect(s.partyRetained).toBe(false);
    expect(s.memberReelected).toBe(false);
    expect(s.representatives).toEqual([
      { name: 'B', party: 'P2', years: [2021] },
      { name: 'A', party: 'P1', years: [2011, 2016] },
    ]);
  });

  it('handles empty and single results', () => {
    expect(summarizeConstituency([]).latest).toBeNull();
    const one = summarizeConstituency([result(2021, 'A', 'P1')]);
    expect(one.partyRetained).toBeNull();
    expect(one.representatives).toHaveLength(1);
  });
});

describe('describeLatestResult', () => {
  it('builds a plain sentence', () => {
    expect(
      describeLatestResult(result(2021, 'A', 'P1', { margin: 12345, margin_percentage: 7.25 }))
    ).toBe('A (P1) won in 2021 by 12,345 votes (7.3% of votes cast) over R (RP).');
  });
  it('falls back when there is no result', () => {
    expect(describeLatestResult(null)).toMatch(/No result/);
  });
});

describe('marginLabel', () => {
  it('labels margins', () => {
    expect(marginLabel(1)).toBe('Very close contest');
    expect(marginLabel('3.5')).toBe('Close contest');
    expect(marginLabel(10)).toBe('Comfortable win');
    expect(marginLabel(20)).toBe('Landslide');
    expect(marginLabel(null)).toBeNull();
  });
});
