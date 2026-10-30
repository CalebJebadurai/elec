import { describe, it, expect } from 'vitest';
import { TOY_SEATS, applySwing, tally, winner } from '../learn';

describe('learn toy model', () => {
  it('shares sum to 100 in every toy seat', () => {
    TOY_SEATS.forEach((s) => expect(s.shares.A + s.shares.B + s.shares.C).toBe(100));
  });

  it('picks the plurality winner', () => {
    expect(winner({ A: 40, B: 35, C: 25 })).toBe('A');
  });

  it('shows seats and votes can disagree with no swing', () => {
    const r = tally(TOY_SEATS);
    expect(r.voteShare.B).toBeGreaterThan(r.voteShare.A);
    expect(r.seats.A).toBeGreaterThan(r.seats.B);
  });

  it('applies and clamps a uniform swing', () => {
    const s = applySwing(TOY_SEATS[0], 5);
    expect(s.shares).toEqual({ A: 41, B: 29, C: 30 });
    const clamped = applySwing(TOY_SEATS[0], 99);
    expect(clamped.shares.B).toBe(0);
    expect(clamped.shares.A + clamped.shares.B + clamped.shares.C).toBe(100);
  });
});
