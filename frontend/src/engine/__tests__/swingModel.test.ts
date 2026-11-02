import { describe, it, expect } from 'vitest';
import {
  forecastSwing,
  expectedStateSwing,
  stateFeatures,
  gaussian,
  NEUTRAL_SLIDERS,
  type SwingInput,
} from '../swingModel';
import {
  SWING_COEFFICIENTS,
  STATE_GENDER,
  buildSwingInput,
  groupShare,
  runSwingModel,
} from '../swingAdapter';
import { DEFAULT_PREDICTION_PARAMS, normalizeParty } from '../../constants';
import type { PredictionDataResponse } from '../../types';

// Two-party state: A holds 6 of 10 seats with 50% vs B 45%
function makeInput(): SwingInput {
  const seats = Array.from({ length: 10 }, (_, i) => {
    const a = 44 + i * 1.5;
    return {
      key: String(i + 1),
      name: `Seat ${i + 1}`,
      shares: { A: a, B: 95 - a, IND: 5 },
      winner: a > 95 - a ? 'A' : 'B',
      winnerTerms: 1,
      margin: Math.abs(2 * a - 95),
    };
  });
  return {
    seats,
    stateShare: { A: 50.75, B: 44.25, IND: 5 },
    priorShare: { A: 48, B: 46, IND: 6 },
    lsShare: null,
    largest: 'A',
  };
}

describe('swing model', () => {
  it('is deterministic for a seed', () => {
    const a = forecastSwing(makeInput(), SWING_COEFFICIENTS, NEUTRAL_SLIDERS, 200, 3);
    const b = forecastSwing(makeInput(), SWING_COEFFICIENTS, NEUTRAL_SLIDERS, 200, 3);
    expect(a.parties).toEqual(b.parties);
  });

  it('gives win probabilities that sum to 1 per seat', () => {
    const f = forecastSwing(makeInput(), SWING_COEFFICIENTS, NEUTRAL_SLIDERS, 200, 3);
    for (const s of f.seats) {
      const sum = Object.values(s.winProb).reduce((x, y) => x + y, 0);
      expect(sum).toBeCloseTo(1, 6);
    }
  });

  it('keeps seat ranges ordered around the mean', () => {
    const f = forecastSwing(makeInput(), SWING_COEFFICIENTS, NEUTRAL_SLIDERS, 300, 3);
    for (const p of f.parties) {
      expect(p.low).toBeLessThanOrEqual(p.median);
      expect(p.median).toBeLessThanOrEqual(p.high);
    }
  });

  it('learned an anti-incumbency penalty for a large ruling party', () => {
    const d = expectedStateSwing(makeInput(), SWING_COEFFICIENTS, NEUTRAL_SLIDERS);
    expect(d.A).toBeLessThan(0);
  });

  it('moves seats when the ruling-party slider moves', () => {
    const input = makeInput();
    const down = forecastSwing(
      input,
      SWING_COEFFICIENTS,
      { ...NEUTRAL_SLIDERS, rulingSwing: -10 },
      300,
      3
    );
    const up = forecastSwing(
      input,
      SWING_COEFFICIENTS,
      { ...NEUTRAL_SLIDERS, rulingSwing: 10 },
      300,
      3
    );
    const seatsA = (f: typeof up) => f.parties.find((p) => p.party === 'A')?.mean ?? 0;
    expect(seatsA(up)).toBeGreaterThan(seatsA(down) + 2);
  });

  it('turns a voter-group lean into a state swing of share × lean / 100', () => {
    const input = makeInput();
    const base = expectedStateSwing(input, SWING_COEFFICIENTS, NEUTRAL_SLIDERS);
    const withGroup = expectedStateSwing(input, SWING_COEFFICIENTS, {
      ...NEUTRAL_SLIDERS,
      groups: [{ label: 'Women', share: 50, lean: 10, party: 'B' }],
    });
    expect(withGroup.B - base.B).toBeCloseTo(5, 6);
  });

  it('treats a named ruling party as the incumbent instead of the largest', () => {
    const input = { ...makeInput(), ruling: 'B' };
    expect(stateFeatures('B', input)[2]).toBe(1);
    expect(stateFeatures('A', input)[2]).toBe(0);
  });

  it('marks missing trend and Lok Sabha signals instead of inventing them', () => {
    const x = stateFeatures('A', { ...makeInput(), priorShare: null, lsShare: null });
    expect(x[4]).toBe(1); // trend missing
    expect(x[6]).toBe(1); // Lok Sabha missing
  });

  it('draws standard normal noise', () => {
    const g = gaussian(5);
    const xs = Array.from({ length: 20000 }, g);
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
    expect(Math.abs(m)).toBeLessThan(0.03);
    expect(v).toBeGreaterThan(0.95);
    expect(v).toBeLessThan(1.05);
  });
});

describe('party labels', () => {
  it('merges the spellings TCPD and ECI use for one party', () => {
    expect(normalizeParty('AAP')).toBe('AAAP');
    expect(normalizeParty('CPIM')).toBe('CPM');
    expect(normalizeParty('Communist Party of India(Marxist)')).toBe('CPM');
    expect(normalizeParty('None of the Above')).toBe('NOTA');
  });
});

describe('voter group shares', () => {
  const women = { id: 'women', label: 'Women', share: 48.6, lean: 0, party: '' };

  it("uses the state's real figure for women until the user edits it", () => {
    expect(groupShare(women, 'Bihar')).toBe(STATE_GENDER.Bihar.voters);
    expect(groupShare({ ...women, share: 40, shareEdited: true }, 'Bihar')).toBe(40);
  });

  it('keeps the national default for states without data', () => {
    expect(groupShare(women, 'Nowhere')).toBe(48.6);
  });
});

describe('swing adapter', () => {
  const data: PredictionDataResponse = {
    total_electors_next: 2000,
    total_electors_latest: 2000,
    latest_year: 2021,
    prev_year: 2016,
    constituency_count: 2,
    ls_year: null,
    ls_share: null,
    constituencies: [1, 2].map((no) => ({
      constituency_name: 'Same Name', // two seats sharing a name must stay separate
      constituency_no: no,
      constituency_type: 'GEN',
      district_name: null,
      sub_region: null,
      electors_latest: 1000,
      valid_votes_latest: 800,
      turnout_percentage_latest: 80,
      enop_latest: null,
      n_cand_latest: null,
      winner_latest: null,
      winner_party_latest: no === 1 ? 'A' : 'B',
      margin_latest: null,
      margin_percentage_latest: 10,
      winner_terms_latest: 1,
      candidates_latest: [
        {
          party: 'A',
          votes: no === 1 ? 440 : 360,
          vote_share_percentage: no === 1 ? 55 : 45,
          position: no === 1 ? 1 : 2,
        },
        {
          party: 'B',
          votes: no === 1 ? 360 : 440,
          vote_share_percentage: no === 1 ? 45 : 55,
          position: no === 1 ? 2 : 1,
        },
      ],
      candidates_prev: [
        { party: 'A', votes: 500, vote_share_percentage: 50, position: 1 },
        { party: 'B', votes: 500, vote_share_percentage: 50, position: 2 },
      ],
    })),
  };

  it('keys seats by number and computes state shares from votes', () => {
    const input = buildSwingInput(data);
    expect(input.seats.map((s) => s.key)).toEqual(['1', '2']);
    expect(input.stateShare.A).toBeCloseTo(50, 6);
    expect(input.priorShare?.A).toBeCloseTo(50, 6);
  });

  it('returns one result per seat with win probabilities', () => {
    const run = runSwingModel(data, buildSwingInput(data), DEFAULT_PREDICTION_PARAMS, 1, 100);
    expect(run.results).toHaveLength(2);
    for (const r of run.results) {
      expect(r.win_probs).toBeDefined();
      expect(r.predicted_winner).toBeTruthy();
    }
  });
});
