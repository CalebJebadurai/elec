import { describe, it, expect } from 'vitest';
import {
  generateBaseline,
  applyNewParty,
  applyAllianceTransfers,
  aggregateResults,
} from '../predictionEngine';
import type { ConstituencyPredictionData, PredictionParams, AllianceBloc } from '../../types';

// ── Test fixtures ─────────────────────────────────────────

function makeConstituency(
  overrides: Partial<ConstituencyPredictionData> = {}
): ConstituencyPredictionData {
  return {
    constituency_name: 'Test Constituency',
    constituency_no: 1,
    constituency_type: 'GEN',
    district_name: 'Test District',
    sub_region: 'Test Region',
    electors_latest: 200000,
    valid_votes_latest: null,
    turnout_percentage_latest: null,
    enop_latest: null,
    n_cand_latest: null,
    winner_latest: null,
    winner_party_latest: 'ADMK',
    margin_latest: null,
    margin_percentage_latest: 5.0,
    candidates_latest: [
      { party: 'ADMK', vote_share_percentage: 45, position: 1, votes: null },
      { party: 'DMK', vote_share_percentage: 35, position: 2, votes: null },
      { party: 'INC', vote_share_percentage: 10, position: 3, votes: null },
      { party: 'BJP', vote_share_percentage: 5, position: 4, votes: null },
      { party: null, vote_share_percentage: 5, position: 5, votes: null },
    ],
    candidates_prev: [],
    ...overrides,
  };
}

const defaultParams: PredictionParams = {
  antiIncumbencyPct: 0,
  turnoutPct: 70,
  growthFactor: 1.0,
};

// ── generateBaseline tests ────────────────────────────────

describe('generateBaseline', () => {
  it('returns results for each constituency', () => {
    const constituencies = [
      makeConstituency(),
      makeConstituency({ constituency_name: 'C2', constituency_no: 2 }),
    ];
    const results = generateBaseline(constituencies, defaultParams);
    expect(results).toHaveLength(2);
  });

  it('computes correct electors and valid votes with growth factor', () => {
    const c = makeConstituency({ electors_latest: 100000 });
    const results = generateBaseline([c], { ...defaultParams, growthFactor: 1.1, turnoutPct: 80 });
    expect(results[0].electors_next).toBe(110000);
    expect(results[0].valid_votes_next).toBe(88000);
  });

  it('preserves winner with zero anti-incumbency', () => {
    const results = generateBaseline([makeConstituency()], {
      ...defaultParams,
      antiIncumbencyPct: 0,
    });
    expect(results[0].predicted_winner).toBe('ADMK');
    expect(results[0].flipped).toBe(false);
  });

  it('vote shares normalize to approximately 1.0', () => {
    const results = generateBaseline([makeConstituency()], defaultParams);
    const totalShare = results[0].parties.reduce((s, p) => s + p.voteShare, 0);
    expect(totalShare).toBeCloseTo(1.0, 5);
  });

  it('applies anti-incumbency correctly', () => {
    const results = generateBaseline([makeConstituency()], {
      ...defaultParams,
      antiIncumbencyPct: 50,
    });
    const r = results[0];

    // The incumbent (ADMK) should have lost share
    const admk = r.parties.find((p) => p.party === 'ADMK')!;
    const dmk = r.parties.find((p) => p.party === 'DMK')!;

    // With 50% anti-incumbency on 45% share -> loses 22.5% absolute
    // Original ADMK: 0.45, after loss: 0.45 - 0.225 = 0.225
    // DMK gains 70% of loss: 0.35 + 0.225*0.7 = 0.5075
    expect(admk.voteShare).toBeLessThan(0.45);
    expect(dmk.voteShare).toBeGreaterThan(0.35);

    // Shares still sum to 1
    const totalShare = r.parties.reduce((s, p) => s + p.voteShare, 0);
    expect(totalShare).toBeCloseTo(1.0, 5);
  });

  it('flips constituency with high anti-incumbency', () => {
    const results = generateBaseline([makeConstituency()], {
      ...defaultParams,
      antiIncumbencyPct: 80,
    });
    expect(results[0].predicted_winner).toBe('DMK');
    expect(results[0].flipped).toBe(true);
  });

  it('returns emptyResult when candidates array is empty', () => {
    const c = makeConstituency({ candidates_latest: [] });
    const results = generateBaseline([c], defaultParams);
    expect(results[0].predicted_winner).toBeNull();
    expect(results[0].parties).toHaveLength(0);
    expect(results[0].electors_next).toBe(0);
  });

  it('handles 100% anti-incumbency without negative shares', () => {
    const results = generateBaseline([makeConstituency()], {
      ...defaultParams,
      antiIncumbencyPct: 100,
    });
    const r = results[0];
    r.parties.forEach((p) => {
      expect(p.voteShare).toBeGreaterThanOrEqual(0);
      expect(p.votes).toBeGreaterThanOrEqual(0);
    });
  });

  it('normalizes party names via normalizeParty', () => {
    const c = makeConstituency({
      winner_party_latest: 'ADK',
      candidates_latest: [
        { party: 'ADK', vote_share_percentage: 50, position: 1, votes: null },
        { party: 'DMK', vote_share_percentage: 50, position: 2, votes: null },
      ],
    });
    const results = generateBaseline([c], defaultParams);
    // ADK should be normalized to ADMK
    expect(results[0].parties[0].party).toBe('ADMK');
  });

  it('handles single candidate constituency', () => {
    const c = makeConstituency({
      candidates_latest: [{ party: 'INC', vote_share_percentage: 100, position: 1, votes: null }],
    });
    const results = generateBaseline([c], defaultParams);
    expect(results[0].predicted_winner).toBe('INC');
    expect(results[0].predicted_runner_up).toBeNull();
    expect(results[0].predicted_margin).toBe(results[0].predicted_winner_votes);
  });

  it('handles zero turnout', () => {
    const results = generateBaseline([makeConstituency()], { ...defaultParams, turnoutPct: 0 });
    expect(results[0].valid_votes_next).toBe(0);
  });

  it('handles null vote_share_percentage in candidates', () => {
    const c = makeConstituency({
      candidates_latest: [
        { party: 'A', vote_share_percentage: null, position: 1, votes: null },
        { party: 'B', vote_share_percentage: 100, position: 2, votes: null },
      ],
    });
    const results = generateBaseline([c], defaultParams);
    // Should not throw
    expect(results).toHaveLength(1);
  });

  it('margin_pct is calculated correctly', () => {
    const results = generateBaseline([makeConstituency()], defaultParams);
    const r = results[0];
    if (r.valid_votes_next > 0) {
      const expectedPct =
        ((r.predicted_winner_votes - r.predicted_runner_up_votes) / r.valid_votes_next) * 100;
      expect(r.predicted_margin_pct).toBeCloseTo(expectedPct, 1);
    }
  });
});

// ── applyNewParty tests ───────────────────────────────────

describe('applyNewParty', () => {
  const baselineResults = generateBaseline([makeConstituency()], defaultParams);

  it('returns unchanged results when no party name given', () => {
    const result = applyNewParty(baselineResults, {
      name: '',
      color: '#ff0000',
      statewideVoteShare: 10,
      affinityWeights: {},
      constituencyOverrides: {},
    });
    expect(result).toEqual(baselineResults);
  });

  it('returns unchanged results when vote share is 0', () => {
    const result = applyNewParty(baselineResults, {
      name: 'NewParty',
      color: '#ff0000',
      statewideVoteShare: 0,
      affinityWeights: {},
      constituencyOverrides: {},
    });
    expect(result).toEqual(baselineResults);
  });

  it('adds new party to results', () => {
    const result = applyNewParty(baselineResults, {
      name: 'NTK',
      color: '#ff0000',
      statewideVoteShare: 10,
      affinityWeights: { ADMK: 0.5, DMK: 0.3, Others: 0.1 },
      constituencyOverrides: {},
    });
    const newParty = result[0].parties.find((p) => p.party === 'NTK');
    expect(newParty).toBeDefined();
    expect(newParty!.isNewParty).toBe(true);
  });

  it('conserves total votes', () => {
    const before = baselineResults[0];
    const result = applyNewParty(baselineResults, {
      name: 'NTK',
      color: '#ff0000',
      statewideVoteShare: 15,
      affinityWeights: { ADMK: 0.5, DMK: 0.3, Others: 0.1 },
      constituencyOverrides: {},
    });
    const after = result[0];
    const totalBefore = before.parties.reduce((s, p) => s + p.votes, 0);
    const totalAfter = after.parties.reduce((s, p) => s + p.votes, 0);
    // Vote conservation: total should be approximately equal
    // (rounding may cause small differences)
    expect(Math.abs(totalAfter - totalBefore)).toBeLessThan(before.parties.length + 2);
  });

  it('respects constituency overrides', () => {
    const c = makeConstituency({ constituency_name: 'Override Const' });
    const baseline = generateBaseline([c], defaultParams);
    const result = applyNewParty(baseline, {
      name: 'NTK',
      color: '#ff0000',
      statewideVoteShare: 10,
      affinityWeights: {},
      constituencyOverrides: { 'Override Const': 30 },
    });
    // With 30% override, new party should have about 30% of votes
    const newP = result[0].parties.find((p) => p.party === 'NTK')!;
    expect(newP.voteShare * 100).toBeCloseTo(30, -1);
  });

  it('uses affinity weights to distribute losses', () => {
    const result = applyNewParty(baselineResults, {
      name: 'NTK',
      color: '#ff0000',
      statewideVoteShare: 20,
      affinityWeights: { ADMK: 1.0, DMK: 0.0, INC: 0.0, BJP: 0.0, IND: 0.0 },
      constituencyOverrides: {},
    });
    // With affinity 1.0 for ADMK and 0.0 for others,
    // ADMK should lose the most votes
    const admk = result[0].parties.find((p) => p.party === 'ADMK')!;
    // DMK should retain most of its votes since weight is 0
    // (but Others fallback is 0.1 so it may lose a small amount)
    expect(admk.votes).toBeLessThan(
      baselineResults[0].parties.find((p) => p.party === 'ADMK')!.votes
    );
  });

  it('does not produce negative votes', () => {
    const result = applyNewParty(baselineResults, {
      name: 'NTK',
      color: '#ff0000',
      statewideVoteShare: 50,
      affinityWeights: { ADMK: 1.0, DMK: 0.5, Others: 0.1 },
      constituencyOverrides: {},
    });
    result[0].parties.forEach((p) => {
      expect(p.votes).toBeGreaterThanOrEqual(0);
    });
  });

  it('can flip a constituency with a strong new party', () => {
    const result = applyNewParty(baselineResults, {
      name: 'NTK',
      color: '#ff0000',
      statewideVoteShare: 50,
      affinityWeights: { ADMK: 0.5, DMK: 0.5, Others: 0.1 },
      constituencyOverrides: {},
    });
    expect(result[0].predicted_winner).toBe('NTK');
    expect(result[0].flipped).toBe(true);
  });
});

// ── aggregateResults tests ────────────────────────────────

describe('aggregateResults', () => {
  it('returns correct total seats', () => {
    const constituencies = [
      makeConstituency({ constituency_name: 'C1', constituency_no: 1 }),
      makeConstituency({ constituency_name: 'C2', constituency_no: 2 }),
      makeConstituency({ constituency_name: 'C3', constituency_no: 3 }),
    ];
    const baseline = generateBaseline(constituencies, defaultParams);
    const summary = aggregateResults(baseline);
    expect(summary.totalSeats).toBe(3);
  });

  it('returns party seat counts sorted descending', () => {
    const constituencies = [
      makeConstituency({ constituency_name: 'C1', constituency_no: 1 }),
      makeConstituency({ constituency_name: 'C2', constituency_no: 2 }),
    ];
    const baseline = generateBaseline(constituencies, defaultParams);
    const summary = aggregateResults(baseline);
    expect(summary.parties.length).toBeGreaterThan(0);
    // Sorted by seats desc
    for (let i = 1; i < summary.parties.length; i++) {
      expect(summary.parties[i - 1].seats).toBeGreaterThanOrEqual(summary.parties[i].seats);
    }
  });

  it('correctly counts flipped constituencies', () => {
    const constituencies = [makeConstituency({ constituency_name: 'C1', constituency_no: 1 })];
    // High anti-incumbency should flip
    const baseline = generateBaseline(constituencies, { ...defaultParams, antiIncumbencyPct: 80 });
    const summary = aggregateResults(baseline);
    expect(summary.flippedCount).toBe(1);
    expect(summary.flipped).toHaveLength(1);
    expect(summary.flipped[0].from).toBe('ADMK');
    expect(summary.flipped[0].to).toBe('DMK');
  });

  it('handles empty predictions array', () => {
    const summary = aggregateResults([]);
    expect(summary.totalSeats).toBe(0);
    expect(summary.parties).toHaveLength(0);
    expect(summary.flipped).toHaveLength(0);
  });

  it('includes vote share averages per party', () => {
    const baseline = generateBaseline([makeConstituency()], defaultParams);
    const summary = aggregateResults(baseline);
    summary.parties.forEach((p) => {
      expect(p.avgVoteShare).toBeGreaterThanOrEqual(0);
      expect(p.avgVoteShare).toBeLessThanOrEqual(100);
    });
  });

  it('tracks total votes per party', () => {
    const baseline = generateBaseline([makeConstituency()], defaultParams);
    const summary = aggregateResults(baseline);
    summary.parties.forEach((p) => {
      expect(p.totalVotes).toBeGreaterThanOrEqual(0);
    });
  });
});

// ── Golden-value numerical tests ──────────────────────────

describe('generateBaseline golden values', () => {
  it('produces exact expected output for known input', () => {
    const c = makeConstituency({
      electors_latest: 200000,
      candidates_latest: [
        { party: 'ADMK', vote_share_percentage: 45, position: 1, votes: null },
        { party: 'DMK', vote_share_percentage: 35, position: 2, votes: null },
        { party: 'INC', vote_share_percentage: 10, position: 3, votes: null },
        { party: 'BJP', vote_share_percentage: 10, position: 4, votes: null },
      ],
    });
    const params: PredictionParams = {
      antiIncumbencyPct: 20,
      turnoutPct: 75,
      growthFactor: 1.05,
    };
    const results = generateBaseline([c], params);
    const r = results[0];

    // Scaled electors: round(200000 * 1.05) = 210000
    expect(r.electors_next).toBe(210000);
    // Valid votes: round(210000 * 0.75) = 157500
    expect(r.valid_votes_next).toBe(157500);

    // Anti-incumbency: ADMK (0.45) loses 0.45*0.20 = 0.09
    // ADMK: 0.45 - 0.09 = 0.36
    // DMK gains 0.09*0.7 = 0.063 → 0.35+0.063 = 0.413
    // INC gains (0.09*0.3)/2 = 0.0135 → 0.1135
    // BJP gains same → 0.1135
    // Total = 1.0 (already normalized)
    const admk = r.parties.find((p) => p.party === 'ADMK')!;
    const dmk = r.parties.find((p) => p.party === 'DMK')!;
    const inc = r.parties.find((p) => p.party === 'INC')!;
    const bjp = r.parties.find((p) => p.party === 'BJP')!;

    expect(admk.voteShare).toBeCloseTo(0.36, 4);
    expect(dmk.voteShare).toBeCloseTo(0.413, 4);
    expect(inc.voteShare).toBeCloseTo(0.1135, 4);
    expect(bjp.voteShare).toBeCloseTo(0.1135, 4);

    // DMK should be predicted winner
    expect(r.predicted_winner).toBe('DMK');
    expect(r.flipped).toBe(true);

    // Verify votes match shares
    expect(admk.votes).toBe(Math.round(0.36 * 157500));
    expect(dmk.votes).toBe(Math.round(0.413 * 157500));
  });
});

// ── Edge case tests ───────────────────────────────────────

describe('prediction engine edge cases', () => {
  it('handles all-zero vote shares without NaN', () => {
    const c = makeConstituency({
      candidates_latest: [
        { party: 'A', vote_share_percentage: 0, position: 1, votes: null },
        { party: 'B', vote_share_percentage: 0, position: 2, votes: null },
      ],
    });
    const results = generateBaseline([c], defaultParams);
    results[0].parties.forEach((p) => {
      expect(Number.isNaN(p.voteShare)).toBe(false);
      expect(Number.isNaN(p.votes)).toBe(false);
    });
  });

  it('handles undefined vote_share_percentage without NaN', () => {
    const c = makeConstituency({
      candidates_latest: [
        {
          party: 'A',
          vote_share_percentage: undefined as unknown as null,
          position: 1,
          votes: null,
        },
        { party: 'B', vote_share_percentage: 100, position: 2, votes: null },
      ],
    });
    const results = generateBaseline([c], defaultParams);
    results[0].parties.forEach((p) => {
      expect(Number.isNaN(p.voteShare)).toBe(false);
      expect(Number.isNaN(p.votes)).toBe(false);
    });
  });

  it('handles large constituency count (403 constituencies)', () => {
    const constituencies = Array.from({ length: 403 }, (_, i) =>
      makeConstituency({ constituency_name: `C${i}`, constituency_no: i })
    );
    const results = generateBaseline(constituencies, defaultParams);
    expect(results).toHaveLength(403);
    results.forEach((r) => {
      expect(Number.isNaN(r.predicted_margin)).toBe(false);
    });
  });

  it('applyNewParty does not mutate input', () => {
    const baseline = generateBaseline([makeConstituency()], defaultParams);
    const originalParties = baseline[0].parties.map((p) => ({ ...p }));
    const originalVotes = baseline[0].predicted_winner_votes;

    applyNewParty(baseline, {
      name: 'NTK',
      color: '#ff0000',
      statewideVoteShare: 20,
      affinityWeights: { ADMK: 0.5, Others: 0.1 },
      constituencyOverrides: {},
    });

    // Original baseline should be unchanged
    expect(baseline[0].predicted_winner_votes).toBe(originalVotes);
    baseline[0].parties.forEach((p, i) => {
      expect(p.votes).toBe(originalParties[i].votes);
    });
  });
});

// ── Full-chain integration test ───────────────────────────

describe('full prediction chain', () => {
  it('produces consistent results through baseline → newParty → aggregate', () => {
    const constituencies = [
      makeConstituency({ constituency_name: 'C1', constituency_no: 1 }),
      makeConstituency({
        constituency_name: 'C2',
        constituency_no: 2,
        winner_party_latest: 'DMK',
        candidates_latest: [
          { party: 'DMK', vote_share_percentage: 50, position: 1, votes: null },
          { party: 'ADMK', vote_share_percentage: 30, position: 2, votes: null },
          { party: 'INC', vote_share_percentage: 20, position: 3, votes: null },
        ],
        candidates_prev: [],
      }),
      makeConstituency({
        constituency_name: 'C3',
        constituency_no: 3,
        winner_party_latest: 'INC',
        candidates_latest: [
          { party: 'INC', vote_share_percentage: 40, position: 1, votes: null },
          { party: 'BJP', vote_share_percentage: 35, position: 2, votes: null },
          { party: 'ADMK', vote_share_percentage: 25, position: 3, votes: null },
        ],
        candidates_prev: [],
      }),
    ];

    const baseline = generateBaseline(constituencies, {
      antiIncumbencyPct: 10,
      turnoutPct: 70,
      growthFactor: 1.0,
    });
    expect(baseline).toHaveLength(3);

    const withNewParty = applyNewParty(baseline, {
      name: 'NTK',
      color: '#ffa500',
      statewideVoteShare: 15,
      affinityWeights: { ADMK: 0.4, DMK: 0.3, INC: 0.2, BJP: 0.1, Others: 0.1 },
      constituencyOverrides: {},
    });
    expect(withNewParty).toHaveLength(3);

    // Verify new party exists in all results
    withNewParty.forEach((r) => {
      const ntk = r.parties.find((p) => p.party === 'NTK');
      expect(ntk).toBeDefined();
      expect(ntk!.votes).toBeGreaterThan(0);
    });

    const summary = aggregateResults(withNewParty);
    expect(summary.totalSeats).toBe(3);
    expect(summary.parties.length).toBeGreaterThan(0);

    // Total seats across all parties should equal total constituencies
    const totalSeatsByParty = summary.parties.reduce((s, p) => s + p.seats, 0);
    expect(totalSeatsByParty).toBe(3);
  });
});

// ── Multi-factor prediction tests ─────────────────────────

describe('generateBaseline with multi-factor params', () => {
  it('default factor params produce identical results to no factors', () => {
    const constituencies = [makeConstituency()];
    const params: PredictionParams = { antiIncumbencyPct: 10, turnoutPct: 70, growthFactor: 1.0 };
    const zeroFactors = {
      turnoutChange: 0,
      incumbencyFatigue: 0,
      turncoatPenalty: 0,
      recontestBonus: 0,
      sameConstituencyBonus: 0,
      previousMarginFactor: 0,
      enopFactor: 0,
      nCandFactor: 0,
      constituencyTypeFactor: 0,
      genderFactor: 0,
      partyStrengthFactor: 0,
      partyVoteShareFactor: 0,
    };
    const withoutFactors = generateBaseline(constituencies, params);
    const withFactors = generateBaseline(constituencies, params, zeroFactors);

    expect(withFactors[0].predicted_winner).toBe(withoutFactors[0].predicted_winner);
    expect(withFactors[0].predicted_winner_votes).toBe(withoutFactors[0].predicted_winner_votes);
  });

  it('incumbency fatigue penalizes the incumbent', () => {
    const constituencies = [makeConstituency()];
    const params: PredictionParams = { antiIncumbencyPct: 0, turnoutPct: 70, growthFactor: 1.0 };
    const baseline = generateBaseline(constituencies, params);
    const withFatigue = generateBaseline(constituencies, params, {
      turnoutChange: 0,
      incumbencyFatigue: 80,
      turncoatPenalty: 0,
      recontestBonus: 0,
      sameConstituencyBonus: 0,
      previousMarginFactor: 0,
      enopFactor: 0,
      nCandFactor: 0,
      constituencyTypeFactor: 0,
      genderFactor: 0,
      partyStrengthFactor: 0,
      partyVoteShareFactor: 0,
    });

    const admkBefore = baseline[0].parties.find((p) => p.party === 'ADMK')!;
    const admkAfter = withFatigue[0].parties.find((p) => p.party === 'ADMK')!;
    expect(admkAfter.voteShare).toBeLessThan(admkBefore.voteShare);
  });

  it('vote shares still sum to 1.0 with multiple factors active', () => {
    const constituencies = [makeConstituency()];
    const params: PredictionParams = { antiIncumbencyPct: 20, turnoutPct: 70, growthFactor: 1.0 };
    const factors = {
      turnoutChange: 15,
      incumbencyFatigue: 30,
      turncoatPenalty: 20,
      recontestBonus: 10,
      sameConstituencyBonus: 5,
      previousMarginFactor: -10,
      enopFactor: 15,
      nCandFactor: -5,
      constituencyTypeFactor: 10,
      genderFactor: -5,
      partyStrengthFactor: 20,
      partyVoteShareFactor: 10,
    };
    const results = generateBaseline(constituencies, params, factors);
    const totalShare = results[0].parties.reduce((s, p) => s + p.voteShare, 0);
    expect(totalShare).toBeCloseTo(1.0, 5);
  });

  it('produces error margin fields', () => {
    const constituencies = [makeConstituency()];
    const params: PredictionParams = { antiIncumbencyPct: 10, turnoutPct: 70, growthFactor: 1.0 };
    const results = generateBaseline(constituencies, params);
    expect(results[0].errorMarginLow).toBeDefined();
    expect(results[0].errorMarginHigh).toBeDefined();
    expect(results[0].errorMarginLow!).toBeLessThanOrEqual(results[0].errorMarginHigh!);
  });

  it('error margins widen with slider deviation', () => {
    const constituencies = [makeConstituency()];
    const params: PredictionParams = { antiIncumbencyPct: 10, turnoutPct: 70, growthFactor: 1.0 };
    const defaultResults = generateBaseline(constituencies, params);
    const extremeResults = generateBaseline(constituencies, params, {
      turnoutChange: 30,
      incumbencyFatigue: 100,
      turncoatPenalty: 100,
      recontestBonus: 50,
      sameConstituencyBonus: 50,
      previousMarginFactor: 50,
      enopFactor: 50,
      nCandFactor: 50,
      constituencyTypeFactor: 50,
      genderFactor: 50,
      partyStrengthFactor: 50,
      partyVoteShareFactor: 50,
    });

    const defaultRange = defaultResults[0].errorMarginHigh! - defaultResults[0].errorMarginLow!;
    const extremeRange = extremeResults[0].errorMarginHigh! - extremeResults[0].errorMarginLow!;
    expect(extremeRange).toBeGreaterThan(defaultRange);
  });

  it('party strength factor boosts incumbent', () => {
    const constituencies = [makeConstituency()];
    const params: PredictionParams = { antiIncumbencyPct: 0, turnoutPct: 70, growthFactor: 1.0 };
    const baseline = generateBaseline(constituencies, params);
    const boosted = generateBaseline(constituencies, params, {
      turnoutChange: 0,
      incumbencyFatigue: 0,
      turncoatPenalty: 0,
      recontestBonus: 0,
      sameConstituencyBonus: 0,
      previousMarginFactor: 0,
      enopFactor: 0,
      nCandFactor: 0,
      constituencyTypeFactor: 0,
      genderFactor: 0,
      partyStrengthFactor: 50,
      partyVoteShareFactor: 0,
    });

    const admkBefore = baseline[0].parties.find((p) => p.party === 'ADMK')!;
    const admkAfter = boosted[0].parties.find((p) => p.party === 'ADMK')!;
    expect(admkAfter.voteShare).toBeGreaterThan(admkBefore.voteShare);
  });
});

// ── Alliance transfer tests ───────────────────────────────

describe('applyAllianceTransfers', () => {
  const multiPartyConstituency = makeConstituency({
    candidates_latest: [
      { party: 'ADMK', vote_share_percentage: 35, position: 1, votes: null },
      { party: 'DMK', vote_share_percentage: 25, position: 2, votes: null },
      { party: 'INC', vote_share_percentage: 20, position: 3, votes: null },
      { party: 'BJP', vote_share_percentage: 10, position: 4, votes: null },
      { party: 'PMK', vote_share_percentage: 10, position: 5, votes: null },
    ],
  });

  it('returns unchanged results with empty alliance config', () => {
    const baseline = generateBaseline([multiPartyConstituency], defaultParams);
    const result = applyAllianceTransfers(baseline, []);
    expect(result[0].predicted_winner_votes).toBe(baseline[0].predicted_winner_votes);
  });

  it('transfers votes to lead party in alliance', () => {
    const baseline = generateBaseline([multiPartyConstituency], defaultParams);
    const alliances: AllianceBloc[] = [
      { name: 'UPA', parties: ['DMK', 'INC'], transferEfficiency: 0.85 },
    ];
    const result = applyAllianceTransfers(baseline, alliances);
    const dmkAfter = result[0].parties.find((p) => p.party === 'DMK')!;
    const dmkBefore = baseline[0].parties.find((p) => p.party === 'DMK')!;
    expect(dmkAfter.votes).toBeGreaterThan(dmkBefore.votes);
  });

  it('alliance can flip a constituency', () => {
    const baseline = generateBaseline([multiPartyConstituency], defaultParams);
    const alliances: AllianceBloc[] = [
      { name: 'UPA', parties: ['DMK', 'INC'], transferEfficiency: 0.9 },
    ];
    const result = applyAllianceTransfers(baseline, alliances);
    // DMK+INC combined should beat ADMK
    expect(result[0].predicted_winner).toBe('DMK');
  });

  it('maintains vote conservation', () => {
    const baseline = generateBaseline([multiPartyConstituency], defaultParams);
    const totalBefore = baseline[0].parties.reduce((s, p) => s + p.votes, 0);
    const alliances: AllianceBloc[] = [
      { name: 'NDA', parties: ['ADMK', 'BJP', 'PMK'], transferEfficiency: 0.85 },
    ];
    const result = applyAllianceTransfers(baseline, alliances);
    const totalAfter = result[0].parties.reduce((s, p) => s + p.votes, 0);
    expect(totalAfter).toBe(totalBefore);
  });

  it('clamps transfer efficiency to [0.5, 1.0]', () => {
    const baseline = generateBaseline([multiPartyConstituency], defaultParams);
    const alliances: AllianceBloc[] = [
      { name: 'UPA', parties: ['DMK', 'INC'], transferEfficiency: 1.5 },
    ];
    const result = applyAllianceTransfers(baseline, alliances);
    // Should not crash, efficiency clamped to 1.0
    expect(result[0].parties.every((p) => p.votes >= 0)).toBe(true);
  });
});

// ── Backward compatibility (Phase 5.5) ─────────────────────

describe('backward compatibility', () => {
  const oldStyleParams: PredictionParams = {
    antiIncumbencyPct: 30,
    turnoutPct: 72,
    growthFactor: 1.05,
  };

  it('default factor params produce identical results to no factors', () => {
    const withoutFactors = generateBaseline([makeConstituency()], oldStyleParams);
    const withZeroFactors = generateBaseline([makeConstituency()], oldStyleParams, {
      turnoutChange: 0,
      incumbencyFatigue: 0,
      turncoatPenalty: 0,
      recontestBonus: 0,
      sameConstituencyBonus: 0,
      previousMarginFactor: 0,
      enopFactor: 0,
      nCandFactor: 0,
      constituencyTypeFactor: 0,
      genderFactor: 0,
      partyStrengthFactor: 0,
      partyVoteShareFactor: 0,
    });

    expect(withZeroFactors[0].predicted_winner).toBe(withoutFactors[0].predicted_winner);
    expect(withZeroFactors[0].predicted_winner_votes).toBe(
      withoutFactors[0].predicted_winner_votes
    );
    expect(withZeroFactors[0].predicted_margin_pct).toBeCloseTo(
      withoutFactors[0].predicted_margin_pct,
      5
    );
  });

  it('old three-parameter bookmarks produce consistent predictions', () => {
    // Simulate loading an old bookmark: only three params, new fields absent
    const result = generateBaseline([makeConstituency()], oldStyleParams);
    // With 30% anti-incumbency, ADMK should lose share
    expect(result[0].predicted_winner_share).toBeLessThan(45);
    // Vote conservation holds
    const totalShare = result[0].parties.reduce((s, p) => s + p.voteShare, 0);
    expect(totalShare).toBeCloseTo(1.0, 5);
  });

  it('aggregate results include seat ranges even with zero factors', () => {
    const results = generateBaseline(
      [makeConstituency(), makeConstituency({ constituency_name: 'Second', constituency_no: 2 })],
      oldStyleParams
    );
    const agg = aggregateResults(results);
    // seatRangeLow and seatRangeHigh should be present
    agg.parties.forEach((p) => {
      expect(p.seatRangeLow).toBeDefined();
      expect(p.seatRangeHigh).toBeDefined();
      expect(p.seatRangeLow).toBeLessThanOrEqual(p.seats);
      expect(p.seatRangeHigh).toBeGreaterThanOrEqual(p.seats);
    });
  });
});
