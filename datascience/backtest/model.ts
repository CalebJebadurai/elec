// Shared pieces: build the engine's input exactly like GET /v1/predict/data,
// run the app's own engine, and the two naive baselines it is judged against.
import type { Row } from './csv';
import { num } from './csv';
import { generateBaseline, aggregateResults } from '../../frontend/src/engine/predictionEngine';
import { normalizeParty } from '../../frontend/src/constants';
import type { ConstituencyPredictionData } from '../../frontend/src/types';

export { normalizeParty };

export interface Election {
  state: string;
  year: number;
  delim: string;
  rows: Row[]; // every candidate row of that state and year, by-elections included
}

/** General-election years per state, as the API's _get_general_years picks them. */
export function generalYears(rows: Row[], state: string): number[] {
  const seats: Record<number, Set<string>> = {};
  for (const r of rows) {
    if (r.State_Name !== state || (r.Poll_No !== '0' && r.Poll_No !== '')) continue;
    (seats[num(r.Year)] ??= new Set()).add(r.Constituency_Name);
  }
  const max = Math.max(0, ...Object.values(seats).map((s) => s.size));
  return Object.keys(seats)
    .map(Number)
    .filter((y) => seats[y].size >= max * 0.4)
    .sort((a, b) => a - b);
}

/** Replicates routes.prediction_data: rows of the year, grouped by constituency name. */
export function engineInput(rows: Row[]): ConstituencyPredictionData[] {
  const by: Record<string, ConstituencyPredictionData> = {};
  const sorted = [...rows].sort(
    (a, b) =>
      a.Constituency_Name.localeCompare(b.Constituency_Name) || num(a.Position) - num(b.Position)
  );
  for (const r of sorted) {
    const c = (by[r.Constituency_Name] ??= {
      constituency_name: r.Constituency_Name,
      constituency_no: num(r.Constituency_No),
      constituency_type: r.Constituency_Type,
      district_name: r.District_Name ?? null,
      sub_region: r.Sub_Region ?? null,
      candidates_latest: [],
      candidates_prev: [],
      electors_latest: null,
      valid_votes_latest: null,
      turnout_percentage_latest: null,
      enop_latest: null,
      n_cand_latest: null,
      winner_latest: null,
      winner_party_latest: null,
      margin_latest: null,
      margin_percentage_latest: null,
    } as unknown as ConstituencyPredictionData);
    c.candidates_latest.push({
      party: r.Party,
      votes: num(r.Votes),
      vote_share_percentage: num(r.Vote_Share_Percentage),
      position: num(r.Position),
    });
    if (c.electors_latest == null) {
      c.electors_latest = num(r.Electors);
      c.valid_votes_latest = num(r.Valid_Votes);
      c.turnout_percentage_latest = num(r.Turnout_Percentage);
      c.enop_latest = num(r.ENOP);
      c.n_cand_latest = num(r.N_Cand);
    }
    if (num(r.Position) === 1) {
      c.winner_latest = r.Candidate;
      c.winner_party_latest = r.Party;
      c.margin_latest = num(r.Margin);
      c.margin_percentage_latest = num(r.Margin_Percentage);
    }
  }
  return Object.values(by);
}

export interface SeatCall {
  seat: string;
  predicted: string | null;
  runnerUp: string | null;
}
export interface Forecast {
  seats: SeatCall[];
  totals: Record<string, number>;
  rangeLow: Record<string, number>;
  rangeHigh: Record<string, number>;
}

/** The app's engine with shipped defaults: only antiIncumbencyPct varies; factor sliders 0. */
export function engineForecast(input: ConstituencyPredictionData[], state: string, antiInc: number): Forecast {
  const preds = generateBaseline(input, { antiIncumbencyPct: antiInc, turnoutPct: 75, growthFactor: 1 }, undefined, state);
  const agg = aggregateResults(preds);
  const f: Forecast = { seats: [], totals: {}, rangeLow: {}, rangeHigh: {} };
  for (const p of preds) {
    f.seats.push({ seat: p.constituency_name, predicted: p.predicted_winner, runnerUp: p.predicted_runner_up });
  }
  for (const p of agg.parties) {
    f.totals[p.party] = p.seats;
    f.rangeLow[p.party] = p.seatRangeLow;
    f.rangeHigh[p.party] = p.seatRangeHigh;
  }
  return f;
}

/** Naive baseline: the state's largest party loses every seat it holds to that seat's runner-up. */
export function rulingPartyOutForecast(input: ConstituencyPredictionData[]): Forecast {
  const held: Record<string, number> = {};
  for (const c of input) {
    const w = normalizeParty(c.winner_party_latest);
    held[w] = (held[w] || 0) + 1;
  }
  const ruling = Object.entries(held).sort((a, b) => b[1] - a[1])[0]?.[0];
  const f: Forecast = { seats: [], totals: {}, rangeLow: {}, rangeHigh: {} };
  for (const c of input) {
    const sorted = [...c.candidates_latest].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
    const w = normalizeParty(c.winner_party_latest);
    const ru = sorted[1] ? normalizeParty(sorted[1].party) : null;
    const pred = w === ruling && ru ? ru : w;
    f.seats.push({ seat: c.constituency_name, predicted: pred, runnerUp: null });
    f.totals[pred] = (f.totals[pred] || 0) + 1;
  }
  return f;
}

/** Actual winners of the general election (Poll_No 0) by constituency name. */
export function actualWinners(rows: Row[]): Record<string, string> {
  const w: Record<string, string> = {};
  for (const r of rows) {
    if (r.Poll_No === '0' && num(r.Position) === 1) w[r.Constituency_Name] = normalizeParty(r.Party);
  }
  return w;
}

export interface Score {
  matched: number;
  correct: number;
  accuracy: number;
  largestPartyCorrect: boolean;
  seatMAE: number; // mean absolute seat error over parties winning >=1 seat (predicted or actual)
  predictedLargest: string;
  actualLargest: string;
}

export function score(f: Forecast, actual: Record<string, string>): Score {
  let matched = 0;
  let correct = 0;
  for (const s of f.seats) {
    const a = actual[s.seat];
    if (!a) continue;
    matched++;
    if (s.predicted === a) correct++;
  }
  const actualTotals: Record<string, number> = {};
  for (const p of Object.values(actual)) actualTotals[p] = (actualTotals[p] || 0) + 1;
  const parties = new Set([...Object.keys(actualTotals), ...Object.keys(f.totals).filter((p) => f.totals[p] > 0)]);
  let err = 0;
  for (const p of parties) err += Math.abs((f.totals[p] || 0) - (actualTotals[p] || 0));
  const top = (t: Record<string, number>) => Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  return {
    matched,
    correct,
    accuracy: matched ? correct / matched : NaN,
    largestPartyCorrect: top(f.totals) === top(actualTotals),
    seatMAE: parties.size ? err / parties.size : NaN,
    predictedLargest: top(f.totals),
    actualLargest: top(actualTotals),
  };
}
