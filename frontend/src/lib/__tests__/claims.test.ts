import { describe, it, expect } from 'vitest';
import {
  checkSeatCount,
  checkMarginRecord,
  checkWinningStreak,
  checkTurnoutRecord,
} from '../claims';
import type { ConstituencySwingRow, StateSwingSummary } from '../../types';

const summary = [
  {
    year: 2021,
    party: 'A',
    seats_won: 120,
    total_seats: 200,
    avg_vote_share: 40,
    avg_margin: 5,
    swing_from_prev: 1,
  },
  {
    year: 2021,
    party: 'B',
    seats_won: 80,
    total_seats: 200,
    avg_vote_share: 35,
    avg_margin: 5,
    swing_from_prev: -1,
  },
] as StateSwingSummary[];

function row(name: string, year: number, party: string, margin: number, turnout: number) {
  return {
    constituency_name: name,
    constituency_no: 1,
    district_name: null,
    sub_region: null,
    constituency_type: 'GEN',
    year,
    winner_party: party,
    winner: `${name}-${year}`,
    winner_votes: 1,
    winner_vote_share: 50,
    runner_up_party: 'Z',
    margin_percentage: margin,
    turnout_percentage: turnout,
  } as ConstituencySwingRow;
}

const rows = [
  row('X', 2016, 'A', 10, 70),
  row('X', 2021, 'A', 20, 72),
  row('Y', 2016, 'B', 3, 60),
  row('Y', 2021, 'A', 0.5, 76),
];

describe('claims', () => {
  it('checks seat counts', () => {
    expect(checkSeatCount(summary, 'A', 2021, 120).verdict).toBe('true');
    const r = checkSeatCount(summary, 'B', 2021, 90);
    expect(r.verdict).toBe('false');
    expect(r.finding).toContain('80 of 200');
    expect(checkSeatCount(summary, 'A', 1999, 1).verdict).toBe('unverifiable');
  });

  it('checks margin records', () => {
    expect(checkMarginRecord(rows, 'X', 2021, 'largest').verdict).toBe('true');
    expect(checkMarginRecord(rows, 'Y', 2021, 'smallest').verdict).toBe('true');
    const r = checkMarginRecord(rows, 'Y', 2021, 'largest');
    expect(r.verdict).toBe('false');
    expect(r.finding).toContain('#2');
  });

  it('checks winning streaks', () => {
    expect(checkWinningStreak(rows, 'X', 'A', 2016).verdict).toBe('true');
    const r = checkWinningStreak(rows, 'Y', 'A', 2016);
    expect(r.verdict).toBe('false');
    expect(r.finding).toContain('2016');
  });

  it('checks turnout records', () => {
    expect(checkTurnoutRecord(rows, 2021).verdict).toBe('true');
    expect(checkTurnoutRecord(rows, 2016).verdict).toBe('false');
  });
});
