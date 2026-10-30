/**
 * Connects the learned swing model (swingModel.ts) to the app: builds its input from the
 * /v1/predict/data response and turns its forecast into the PredictionResult rows that the
 * map, tables, new-party and alliance tools already use.
 */
import { normalizeParty } from '../constants';
import coefficients from './data/swing_model.json';
import {
  forecastSwing,
  expectedStateSwing,
  NEUTRAL_SLIDERS,
  type SwingCoefficients,
  type SwingForecast,
  type SwingInput,
  type SwingSliders,
} from './swingModel';
import type {
  AppPredictionParams,
  CandidateResult,
  PredictionDataResponse,
  PredictionResult,
  PredictionParty,
} from '../types';

export const SWING_COEFFICIENTS = coefficients as SwingCoefficients;

function stateShares(cands: CandidateResult[][]): Record<string, number> | null {
  const votes: Record<string, number> = {};
  let total = 0;
  for (const cs of cands)
    for (const c of cs) {
      const v = c.votes || 0;
      const p = normalizeParty(c.party);
      votes[p] = (votes[p] || 0) + v;
      total += v;
    }
  if (!total) return null;
  return Object.fromEntries(Object.entries(votes).map(([p, v]) => [p, (100 * v) / total]));
}

export function buildSwingInput(data: PredictionDataResponse): SwingInput {
  const seats = data.constituencies
    .filter((c) => c.candidates_latest.length > 0)
    .map((c) => {
      const shares: Record<string, number> = {};
      for (const cand of c.candidates_latest) {
        const p = normalizeParty(cand.party);
        shares[p] = (shares[p] || 0) + (cand.vote_share_percentage || 0);
      }
      return {
        key: c.constituency_no != null ? String(c.constituency_no) : c.constituency_name,
        name: c.constituency_name,
        shares,
        winner: normalizeParty(c.winner_party_latest),
        winnerTerms: c.winner_terms_latest || 1,
        margin: c.margin_percentage_latest || 0,
      };
    });
  const seatsWon: Record<string, number> = {};
  for (const s of seats) seatsWon[s.winner] = (seatsWon[s.winner] || 0) + 1;
  const largest = Object.entries(seatsWon).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const hasPrior = data.prev_year !== data.latest_year;
  let lsShare: Record<string, number> | null = null;
  if (data.ls_share) {
    lsShare = {};
    for (const [p, v] of Object.entries(data.ls_share)) {
      const n = normalizeParty(p);
      lsShare[n] = (lsShare[n] || 0) + v;
    }
  }
  return {
    seats,
    stateShare: stateShares(data.constituencies.map((c) => c.candidates_latest)) ?? {},
    priorShare: hasPrior ? stateShares(data.constituencies.map((c) => c.candidates_prev)) : null,
    lsShare,
    largest,
  };
}

export function slidersFromParams(p: AppPredictionParams): SwingSliders {
  return {
    rulingSwing: p.swingRuling,
    partySwing: p.swingParty,
    sittingMla: p.swingSittingMla,
    turnoutChange: p.swingTurnout,
    electorateGrowth: p.swingElectorateGrowth,
    groups: p.voterGroups.filter((g) => g.party && g.lean !== 0),
  };
}

/** The model's own expected state-wide swing per party, before any slider. */
export function learnedSwing(input: SwingInput): Record<string, number> {
  return expectedStateSwing(input, SWING_COEFFICIENTS, NEUTRAL_SLIDERS);
}

export interface SwingRun {
  forecast: SwingForecast;
  results: PredictionResult[];
}

/** Run the model and express it as PredictionResult rows (expected votes, likeliest winner). */
export function runSwingModel(
  data: PredictionDataResponse,
  input: SwingInput,
  params: AppPredictionParams,
  growthFactor: number,
  draws = 400
): SwingRun {
  const forecast = forecastSwing(input, SWING_COEFFICIENTS, slidersFromParams(params), draws, 7);
  const byKey = new Map(forecast.seats.map((s) => [s.key, s]));
  const turnout = params.turnoutPct / 100;
  const results: PredictionResult[] = [];
  for (const c of data.constituencies) {
    const key = c.constituency_no != null ? String(c.constituency_no) : c.constituency_name;
    const f = byKey.get(key);
    if (!f) continue;
    const electors = Math.round((c.electors_latest || 0) * growthFactor);
    const valid = Math.round(electors * turnout);
    const winnerLatest = normalizeParty(c.winner_party_latest);
    // Rank parties by win chance, then by expected share, so the shown winner is the likeliest one
    const parties: PredictionParty[] = Object.entries(f.expected)
      .map(([party, share]) => ({
        party,
        originalParty: party,
        voteShare: share / 100,
        votes: Math.round((share / 100) * valid),
        position: null,
      }))
      .sort(
        (a, b) => (f.winProb[b.party] || 0) - (f.winProb[a.party] || 0) || b.voteShare - a.voteShare
      );
    const [w, r] = parties;
    results.push({
      constituency_name: c.constituency_name,
      constituency_no: c.constituency_no,
      constituency_type: c.constituency_type,
      district_name: c.district_name,
      sub_region: c.sub_region,
      electors_next: electors,
      valid_votes_next: valid,
      winner_party_latest: winnerLatest,
      margin_percentage_latest: c.margin_percentage_latest,
      predicted_winner: w?.party ?? null,
      predicted_winner_votes: w?.votes ?? 0,
      predicted_winner_share: (w?.voteShare ?? 0) * 100,
      predicted_runner_up: r?.party ?? null,
      predicted_runner_up_votes: r?.votes ?? 0,
      predicted_margin: (w?.votes ?? 0) - (r?.votes ?? 0),
      predicted_margin_pct: valid ? (((w?.votes ?? 0) - (r?.votes ?? 0)) / valid) * 100 : 0,
      flipped: !!w && w.party !== winnerLatest,
      parties,
      win_probs: f.winProb,
    });
  }
  return { forecast, results };
}
