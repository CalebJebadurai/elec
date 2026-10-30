import { describe, it, expect } from 'vitest';
import { findWinnableSeats, runnerUpParties } from '../winnable';
import type { ConstituencySwingRow } from '../../types';

function row(name: string, year: number, winner: string, runnerUp: string, margin: number) {
  return {
    constituency_name: name,
    constituency_no: 1,
    district_name: 'D',
    sub_region: null,
    constituency_type: 'GEN',
    year,
    winner_party: winner,
    winner: 'x',
    winner_votes: 1,
    winner_vote_share: 40,
    runner_up_party: runnerUp,
    margin_percentage: margin,
    turnout_percentage: 70,
  } as ConstituencySwingRow;
}

const rows = [
  row('X', 2016, 'A', 'B', 4),
  row('X', 2021, 'B', 'A', 6),
  row('Y', 2016, 'B', 'C', 10),
  row('Y', 2021, 'B', 'A', 2),
  row('Z', 2021, 'A', 'B', 1),
  row('W', 2016, 'B', 'A', 3),
  row('W', 2021, 'B', 'A', 6),
];

describe('findWinnableSeats', () => {
  it('lists seats the party lost in the year, closest first, ties by past wins', () => {
    const seats = findWinnableSeats(rows, 'A', 2021);
    expect(seats.map((s) => s.name)).toEqual(['Y', 'X', 'W']);
    expect(seats[1]).toMatchObject({ heldBy: 'B', gap: 6, wonBefore: [2016], changesOfHands: 1 });
    expect(seats[2].wonBefore).toEqual([]);
  });

  it('ranks runner-up parties by number of second places', () => {
    expect(runnerUpParties(rows, 2021)).toEqual(['A', 'B']);
  });
});
