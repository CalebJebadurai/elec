import { normalizeParty } from '../constants';
import { getCoefficients } from './factorConfig';
import type {
  ConstituencyPredictionData,
  PredictionParams,
  PredictionResult,
  PredictionParty,
  NewPartyConfig,
  AggregateResult,
  AggregateParty,
  FlippedConstituency,
  AppPredictionParams,
  AllianceBloc,
} from '../types';

// ── Multi-factor params (slider values from AppPredictionParams) ────

export interface FactorParams {
  turnoutChange: number;
  incumbencyFatigue: number;
  turncoatPenalty: number;
  recontestBonus: number;
  sameConstituencyBonus: number;
  previousMarginFactor: number;
  enopFactor: number;
  nCandFactor: number;
  constituencyTypeFactor: number;
  genderFactor: number;
  partyStrengthFactor: number;
  partyVoteShareFactor: number;
}

const ZERO_FACTORS: FactorParams = {
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

/**
 * Generate baseline predictions from latest actuals with multi-factor adjustments.
 *
 * For each constituency:
 * 1. Scale electors by growth factor (next total / latest total)
 * 2. Compute expected valid votes = scaled_electors * turnoutPct
 * 3. Apply anti-incumbency: incumbent party loses antiIncumbencyPct% of its
 *    vote_share, distributed proportionally to the runner-up.
 * 4. Apply multi-factor modifiers: each factor produces a multiplicative
 *    adjustment to each party's vote share based on regression coefficients.
 * 5. Recalculate absolute votes from adjusted shares.
 */
export function generateBaseline(
  constituencies: ConstituencyPredictionData[],
  params: PredictionParams,
  factorParams: FactorParams = ZERO_FACTORS,
  stateName: string | null = null
): PredictionResult[] {
  const { antiIncumbencyPct, turnoutPct, growthFactor } = params;
  const antiInc = antiIncumbencyPct / 100;
  const turnout = turnoutPct / 100;
  const coefficients = getCoefficients(stateName);

  return constituencies.map((c) => {
    const scaledElectors = Math.round((c.electors_latest || 0) * growthFactor);
    const expectedValidVotes = Math.round(scaledElectors * turnout);

    // Build party vote shares from latest candidates
    const parties: PredictionParty[] = (c.candidates_latest || []).map((cand) => ({
      party: normalizeParty(cand.party),
      originalParty: cand.party || '',
      voteShare: (cand.vote_share_percentage || 0) / 100,
      votes: 0,
      position: cand.position,
    }));

    if (parties.length === 0) return emptyResult(c);

    // Apply anti-incumbency: latest winner loses share, runner-up gains
    const incumbentParty = normalizeParty(c.winner_party_latest);
    if (antiInc > 0 && incumbentParty) {
      const incumbentIdx = parties.findIndex((p) => p.party === incumbentParty && p.position === 1);
      const runnerUpIdx = parties.findIndex((p) => p.position === 2);

      if (incumbentIdx >= 0) {
        const loss = parties[incumbentIdx].voteShare * antiInc;
        parties[incumbentIdx].voteShare -= loss;

        if (runnerUpIdx >= 0) {
          parties[runnerUpIdx].voteShare += loss * 0.7;
          // Remaining 30% distributed to others
          const otherIdxs = parties
            .map((_, i) => i)
            .filter((i) => i !== incumbentIdx && i !== runnerUpIdx);
          const perOther = otherIdxs.length > 0 ? (loss * 0.3) / otherIdxs.length : 0;
          otherIdxs.forEach((i) => {
            parties[i].voteShare += perOther;
          });
        }
      }
    }

    // ── Multi-factor adjustments ────────────────────────────
    // Each factor produces a multiplicative modifier per party.
    // modifier = 1 + (coefficient * sliderValue / 100)
    // Clamped to [0.5, 2.0] to prevent runaway effects.
    const hasFactors = Object.values(factorParams).some((v) => v !== 0);
    if (hasFactors) {
      applyMultiFactorModifiers(parties, c, factorParams, coefficients);
    }

    // Normalize shares to sum to 1
    const totalShare = parties.reduce((s, p) => s + p.voteShare, 0);
    if (totalShare > 0) {
      parties.forEach((p) => {
        p.voteShare = p.voteShare / totalShare;
      });
    }

    // Compute votes
    parties.forEach((p) => {
      p.votes = Math.round(p.voteShare * expectedValidVotes);
    });

    // Sort by votes desc
    parties.sort((a, b) => b.votes - a.votes);

    const winner = parties[0];
    const runnerUp = parties[1];

    // Compute error margins based on slider deviation
    const sliderDistance = computeSliderDistance(factorParams);
    const baseError = 3; // base ±3% error margin
    const adjustedError = baseError * (1 + 0.5 * sliderDistance);
    const winnerShare = winner.voteShare * 100;

    return {
      constituency_name: c.constituency_name,
      constituency_no: c.constituency_no,
      constituency_type: c.constituency_type,
      district_name: c.district_name,
      sub_region: c.sub_region,
      electors_next: scaledElectors,
      valid_votes_next: expectedValidVotes,
      winner_party_latest: normalizeParty(c.winner_party_latest),
      margin_percentage_latest: c.margin_percentage_latest,
      predicted_winner: winner.party,
      predicted_winner_votes: winner.votes,
      predicted_winner_share: winner.voteShare * 100,
      predicted_runner_up: runnerUp ? runnerUp.party : null,
      predicted_runner_up_votes: runnerUp ? runnerUp.votes : 0,
      predicted_margin: winner.votes - (runnerUp ? runnerUp.votes : 0),
      predicted_margin_pct:
        expectedValidVotes > 0
          ? ((winner.votes - (runnerUp ? runnerUp.votes : 0)) / expectedValidVotes) * 100
          : 0,
      flipped: winner.party !== normalizeParty(c.winner_party_latest),
      parties,
      errorMarginLow: Math.max(0, winnerShare - adjustedError),
      errorMarginHigh: Math.min(100, winnerShare + adjustedError),
    };
  });
}

/**
 * Apply multiplicative multi-factor modifiers to party vote shares.
 *
 * State-level factors apply uniformly to the incumbent party.
 * Constituency-level factors apply based on constituency characteristics.
 * Candidate-level factors apply to specific candidates based on their attributes.
 */
function applyMultiFactorModifiers(
  parties: PredictionParty[],
  constituency: ConstituencyPredictionData,
  factors: FactorParams,
  coefficients: Record<string, number>
): void {
  const incumbentParty = normalizeParty(constituency.winner_party_latest);

  parties.forEach((p) => {
    let modifier = 1.0;
    const isIncumbent = p.party === incumbentParty && p.position === 1;

    // ── Incumbency dynamics (candidate-level) ───────
    if (factors.incumbencyFatigue !== 0 && isIncumbent) {
      const coeff = coefficients.incumbencyFatigue || -0.08;
      modifier *= 1 + coeff * (factors.incumbencyFatigue / 100);
    }

    if (factors.turncoatPenalty !== 0) {
      // Apply to all parties proportionally — in a real implementation
      // this would check per-candidate turncoat flags from constituency data
      const coeff = coefficients.turncoatPenalty || -0.12;
      // Apply a state-level factor: all parties get a small adjustment
      modifier *= 1 + coeff * (factors.turncoatPenalty / 100) * 0.3;
    }

    if (factors.recontestBonus !== 0 && isIncumbent) {
      const coeff = coefficients.recontestBonus || 0.04;
      modifier *= 1 + coeff * (factors.recontestBonus / 100);
    }

    if (factors.sameConstituencyBonus !== 0 && isIncumbent) {
      const coeff = coefficients.sameConstituencyBonus || 0.03;
      modifier *= 1 + coeff * (factors.sameConstituencyBonus / 100);
    }

    // ── Electoral competition (constituency-level) ──
    if (factors.previousMarginFactor !== 0 && constituency.margin_percentage_latest != null) {
      const coeff = coefficients.previousMarginFactor || -0.06;
      const normalizedMargin = constituency.margin_percentage_latest / 50; // normalize to ~[-1, 1]
      if (isIncumbent) {
        modifier *= 1 + coeff * (factors.previousMarginFactor / 100) * normalizedMargin;
      } else if (p.position === 2) {
        // Runner-up gets inverse effect
        modifier *= 1 - coeff * (factors.previousMarginFactor / 100) * normalizedMargin;
      }
    }

    if (factors.enopFactor !== 0 && constituency.enop_latest != null) {
      const coeff = coefficients.enopFactor || -0.04;
      const normalizedEnop = (constituency.enop_latest - 3) / 5; // center at 3
      modifier *= 1 + coeff * (factors.enopFactor / 100) * normalizedEnop;
    }

    if (factors.nCandFactor !== 0 && constituency.n_cand_latest != null) {
      const coeff = coefficients.nCandFactor || -0.02;
      const normalizedNCand = (constituency.n_cand_latest - 10) / 20; // center at 10
      modifier *= 1 + coeff * (factors.nCandFactor / 100) * normalizedNCand;
    }

    // ── Geographic & structural (constituency-level) ─
    if (factors.constituencyTypeFactor !== 0) {
      const coeff = coefficients.constituencyTypeFactor || 0.01;
      const isReserved = constituency.constituency_type !== 'GEN' ? 1 : 0;
      if (isReserved && isIncumbent) {
        modifier *= 1 + coeff * (factors.constituencyTypeFactor / 100);
      }
    }

    if (factors.genderFactor !== 0) {
      // State-level gender effect applied uniformly
      const coeff = coefficients.genderFactor || -0.02;
      modifier *= 1 + coeff * (factors.genderFactor / 100) * 0.2;
    }

    // ── Party strength (state-level) ────────────────
    if (factors.partyStrengthFactor !== 0) {
      const coeff = coefficients.partyStrengthFactor || 0.1;
      if (isIncumbent) {
        modifier *= 1 + coeff * (factors.partyStrengthFactor / 100);
      } else {
        modifier *= 1 - coeff * (factors.partyStrengthFactor / 100) * 0.3;
      }
    }

    if (factors.partyVoteShareFactor !== 0) {
      const coeff = coefficients.partyVoteShareFactor || 0.08;
      if (isIncumbent) {
        modifier *= 1 + coeff * (factors.partyVoteShareFactor / 100);
      } else if (p.position === 2) {
        modifier *= 1 - coeff * (factors.partyVoteShareFactor / 100) * 0.5;
      }
    }

    // ── Turnout change (state-level) ────────────────
    if (factors.turnoutChange !== 0) {
      const coeff = coefficients.turnoutChange || 0.15;
      // Higher turnout generally benefits opposition (non-incumbent)
      if (isIncumbent) {
        modifier *= 1 - coeff * (factors.turnoutChange / 100) * 0.5;
      } else {
        modifier *= 1 + coeff * (factors.turnoutChange / 100) * 0.3;
      }
    }

    // Clamp total modifier to prevent runaway effects
    modifier = Math.max(0.5, Math.min(2.0, modifier));

    p.voteShare *= modifier;
  });
}

/**
 * Compute normalized Euclidean distance of slider values from defaults (all 0).
 * Returns a value in [0, 1].
 */
function computeSliderDistance(factors: FactorParams): number {
  const values = Object.values(factors);
  const ranges = [30, 100, 100, 50, 50, 50, 50, 50, 50, 50, 50, 50]; // max range for each
  let sumSq = 0;
  let maxSumSq = 0;
  for (let i = 0; i < values.length; i++) {
    const range = ranges[i] || 100;
    sumSq += (values[i] / range) ** 2;
    maxSumSq += 1;
  }
  return Math.sqrt(sumSq / maxSumSq);
}

/**
 * Apply a new party to baseline predictions using affinity-weighted redistribution.
 *
 * For each constituency:
 *   new_votes = valid_votes * (statewide_pct or constituency_override)
 *   loss_i = new_votes * (alpha_i * V_i) / sum(alpha_j * V_j)
 *
 * This ensures vote conservation: total subtracted = new party votes.
 */
export function applyNewParty(
  baselineResults: PredictionResult[],
  config: NewPartyConfig
): PredictionResult[] {
  const { name, statewideVoteShare, affinityWeights, constituencyOverrides } = config;

  if (!name || statewideVoteShare <= 0) return baselineResults;

  return baselineResults.map((r) => {
    const overridePct = constituencyOverrides[r.constituency_name] ?? statewideVoteShare;
    const newPartyShare = overridePct / 100;

    if (newPartyShare <= 0) return r;

    const validVotes = r.valid_votes_next;
    const newPartyVotes = Math.round(validVotes * newPartyShare);

    // Clone parties
    const parties: PredictionParty[] = r.parties.map((p) => ({ ...p }));

    // Compute weighted denominator
    const getWeight = (party: string): number => {
      if (affinityWeights[party] !== undefined) return affinityWeights[party];
      return affinityWeights['Others'] || 0.1;
    };

    let weightedSum = 0;
    parties.forEach((p) => {
      weightedSum += getWeight(p.party) * p.votes;
    });

    // Subtract from existing parties
    if (weightedSum > 0) {
      parties.forEach((p) => {
        const loss = (newPartyVotes * getWeight(p.party) * p.votes) / weightedSum;
        p.votes = Math.max(0, Math.round(p.votes - loss));
      });
    }

    // Recompute vote shares
    const totalVotesAfter = parties.reduce((s, p) => s + p.votes, 0) + newPartyVotes;
    parties.forEach((p) => {
      p.voteShare = totalVotesAfter > 0 ? p.votes / totalVotesAfter : 0;
    });

    // Add new party
    parties.push({
      party: name,
      originalParty: name,
      voteShare: totalVotesAfter > 0 ? newPartyVotes / totalVotesAfter : 0,
      votes: newPartyVotes,
      position: null,
      isNewParty: true,
    });

    // Sort by votes desc
    parties.sort((a, b) => b.votes - a.votes);

    const winner = parties[0];
    const runnerUp = parties[1];

    return {
      ...r,
      predicted_winner: winner.party,
      predicted_winner_votes: winner.votes,
      predicted_winner_share: winner.voteShare * 100,
      predicted_runner_up: runnerUp ? runnerUp.party : null,
      predicted_runner_up_votes: runnerUp ? runnerUp.votes : 0,
      predicted_margin: winner.votes - (runnerUp ? runnerUp.votes : 0),
      predicted_margin_pct:
        totalVotesAfter > 0
          ? ((winner.votes - (runnerUp ? runnerUp.votes : 0)) / totalVotesAfter) * 100
          : 0,
      flipped: winner.party !== r.winner_party_latest,
      parties,
      new_party_votes: newPartyVotes,
      new_party_share: newPartyVotes > 0 ? (newPartyVotes / totalVotesAfter) * 100 : 0,
    };
  });
}

/**
 * Apply alliance vote transfers.
 *
 * Within each constituency, for each alliance bloc, transfer the weaker allied
 * party's votes to the stronger party at the specified transfer efficiency.
 */
export function applyAllianceTransfers(
  results: PredictionResult[],
  allianceConfig: AllianceBloc[]
): PredictionResult[] {
  if (!allianceConfig || allianceConfig.length === 0) return results;

  return results.map((r) => {
    const parties: PredictionParty[] = r.parties.map((p) => ({ ...p }));

    for (const bloc of allianceConfig) {
      const efficiency = Math.max(0.5, Math.min(1.0, bloc.transferEfficiency));
      const allyIndices = parties
        .map((p, i) => (bloc.parties.includes(p.party) ? i : -1))
        .filter((i) => i >= 0);

      if (allyIndices.length < 2) continue;

      // Find the strongest ally in this constituency
      let leadIdx = allyIndices[0];
      for (const idx of allyIndices) {
        if (parties[idx].votes > parties[leadIdx].votes) leadIdx = idx;
      }

      // Transfer votes from non-lead allies to lead
      for (const idx of allyIndices) {
        if (idx === leadIdx) continue;
        const transfer = Math.round(parties[idx].votes * efficiency);
        parties[leadIdx].votes += transfer;
        parties[idx].votes -= transfer;
      }
    }

    // Recompute vote shares
    const totalVotes = parties.reduce((s, p) => s + p.votes, 0);
    parties.forEach((p) => {
      p.voteShare = totalVotes > 0 ? p.votes / totalVotes : 0;
    });

    // Sort by votes desc
    parties.sort((a, b) => b.votes - a.votes);

    const winner = parties[0];
    const runnerUp = parties[1];

    return {
      ...r,
      predicted_winner: winner.party,
      predicted_winner_votes: winner.votes,
      predicted_winner_share: winner.voteShare * 100,
      predicted_runner_up: runnerUp ? runnerUp.party : null,
      predicted_runner_up_votes: runnerUp ? runnerUp.votes : 0,
      predicted_margin: winner.votes - (runnerUp ? runnerUp.votes : 0),
      predicted_margin_pct:
        totalVotes > 0 ? ((winner.votes - (runnerUp ? runnerUp.votes : 0)) / totalVotes) * 100 : 0,
      flipped: winner.party !== r.winner_party_latest,
      parties,
    };
  });
}

/**
 * Aggregate per-constituency results into summary stats.
 */
export function aggregateResults(predictions: PredictionResult[]): AggregateResult {
  const partySeats: Record<string, number> = {};
  const partySeatRangeLow: Record<string, number> = {};
  const partySeatRangeHigh: Record<string, number> = {};
  const partyVoteShares: Record<string, { sum: number; count: number; totalVotes: number }> = {};
  const flipped: FlippedConstituency[] = [];
  let totalSeats = 0;

  predictions.forEach((r) => {
    const w = r.predicted_winner;
    if (!w) return;
    totalSeats++;

    partySeats[w] = (partySeats[w] || 0) + 1;

    // Compute seat ranges based on error margins
    // A seat is "safe" for the winner if their low bound > runner-up share
    const winnerShare = r.predicted_winner_share ?? 0;
    const runnerUpShare =
      r.predicted_runner_up_votes && r.valid_votes_next
        ? (r.predicted_runner_up_votes / r.valid_votes_next) * 100
        : 0;
    const errorLow = r.errorMarginLow ?? winnerShare;
    const isMarginal = errorLow < runnerUpShare + 1; // within error margin

    if (isMarginal && r.predicted_runner_up) {
      // Winner keeps seat in best case, may lose in worst case
      partySeatRangeHigh[w] = (partySeatRangeHigh[w] || 0) + 1;
      partySeatRangeLow[w] = partySeatRangeLow[w] || 0; // +0, might lose
      // Runner-up might gain this seat
      partySeatRangeHigh[r.predicted_runner_up] =
        (partySeatRangeHigh[r.predicted_runner_up] || 0) + 1;
      partySeatRangeLow[r.predicted_runner_up] = partySeatRangeLow[r.predicted_runner_up] || 0;
    } else {
      // Safe seat for winner
      partySeatRangeLow[w] = (partySeatRangeLow[w] || 0) + 1;
      partySeatRangeHigh[w] = (partySeatRangeHigh[w] || 0) + 1;
    }

    // Track vote share sums for averaging
    (r.parties || []).forEach((p) => {
      if (!partyVoteShares[p.party]) {
        partyVoteShares[p.party] = { sum: 0, count: 0, totalVotes: 0 };
      }
      partyVoteShares[p.party].sum += p.voteShare * 100;
      partyVoteShares[p.party].count += 1;
      partyVoteShares[p.party].totalVotes += p.votes;
    });

    if (r.flipped && r.predicted_winner) {
      flipped.push({
        constituency: r.constituency_name,
        from: r.winner_party_latest,
        to: r.predicted_winner,
        margin_latest: r.margin_percentage_latest,
        margin_next: r.predicted_margin_pct,
      });
    }
  });

  // Build party summary sorted by seats
  const parties = Object.keys({ ...partySeats, ...partyVoteShares })
    .map((party) => ({
      party,
      seats: partySeats[party] || 0,
      seatRangeLow: partySeatRangeLow[party] || 0,
      seatRangeHigh: partySeatRangeHigh[party] || 0,
      avgVoteShare: partyVoteShares[party]
        ? partyVoteShares[party].sum / partyVoteShares[party].count
        : 0,
      totalVotes: partyVoteShares[party]?.totalVotes || 0,
    }))
    .sort((a, b) => b.seats - a.seats || b.avgVoteShare - a.avgVoteShare);

  return {
    totalSeats,
    parties,
    flipped,
    flippedCount: flipped.length,
  };
}

function emptyResult(c: ConstituencyPredictionData): PredictionResult {
  return {
    constituency_name: c.constituency_name,
    constituency_no: c.constituency_no,
    constituency_type: c.constituency_type,
    district_name: c.district_name,
    sub_region: c.sub_region,
    electors_next: 0,
    valid_votes_next: 0,
    winner_party_latest: null,
    margin_percentage_latest: null,
    predicted_winner: null,
    predicted_winner_votes: 0,
    predicted_winner_share: 0,
    predicted_runner_up: null,
    predicted_runner_up_votes: 0,
    predicted_margin: 0,
    predicted_margin_pct: 0,
    flipped: false,
    parties: [],
  };
}
