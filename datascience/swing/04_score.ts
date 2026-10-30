// Score the frozen swing-model forecasts (predictions/frozen_swing_2023_26.json) against the
// 2023–26 results converted from ECI pages (../backtest/new_data_raw/eci_converted_AE.csv).
// Rules: PREREGISTRATION-2.md. Seat-level states and party mapping are exactly those of the
// first test (../backtest/AMENDMENT-1.md); nothing is re-decided here.
import { readFileSync, writeFileSync } from 'node:fs';
import { readCsv, num } from '../backtest/csv';
import { normalizeParty } from '../../frontend/src/constants';
import { generateBaseline } from '../../frontend/src/engine/predictionEngine';
import { load } from './data';
import type { ConstituencyPredictionData } from '../../frontend/src/types';

interface FrozenState {
  baseYear: number;
  targetYear: number;
  perSeat: Record<string, { likely: string; base: string; p: Record<string, number> }>;
  totals: { party: string; mean: number; low: number; high: number; pLargest: number }[];
}
const frozen = JSON.parse(readFileSync('predictions/frozen_swing_2023_26.json', 'utf8')).states as Record<string, FrozenState>;
const actualRows = readCsv(new URL('../backtest/new_data_raw/eci_converted_AE.csv', import.meta.url).pathname);
const { elections } = load();

interface S {
  state: string;
  seatLevel: boolean;
  n: number;
  sw: number;
  m0: number;
  m1: number;
  brier: number;
  brier0: number;
  largest: { sw: boolean; m1: boolean; actual: string; predicted: string; pActual: number };
  cover: number;
  coverN: number;
  newLabel: number;
}
const top = (t: Record<string, number>) => Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
const results: S[] = [];

for (const [state, f] of Object.entries(frozen)) {
  const rows = actualRows.filter((r) => r.State_Name === state && num(r.Position) === 1);
  if (!rows.length) continue;
  const seatLevel = !rows[0].DelimID.startsWith('ECI-');
  const actual = new Map(rows.map((r) => [String(num(r.Constituency_No)), normalizeParty(r.Party)]));
  const base = elections.find((e) => e.state === state && e.year === f.baseYear)!;
  const baseParties = new Set(Object.keys(base.stateShare));

  // M1 (the app's engine today) on the same base seats
  const input: ConstituencyPredictionData[] = [...base.seats.values()].map((s) => ({
    constituency_name: String(s.no), constituency_no: s.no, constituency_type: s.type, district_name: null, sub_region: null,
    electors_latest: s.electors, valid_votes_latest: null, turnout_percentage_latest: s.turnout, enop_latest: null, n_cand_latest: null,
    winner_latest: null, winner_party_latest: s.winner, margin_latest: null, margin_percentage_latest: s.margin,
    candidates_latest: Object.entries(s.shares).sort((a, b) => b[1] - a[1]).map(([party, v], i) => ({ party, votes: null, vote_share_percentage: v, position: i + 1 })),
    candidates_prev: [],
  }));
  const m1 = new Map(generateBaseline(input, { antiIncumbencyPct: 10, turnoutPct: 60, growthFactor: 1 }).map((r) => [String(r.constituency_no), r.predicted_winner ?? '']));
  const m1Totals: Record<string, number> = {};
  for (const w of m1.values()) m1Totals[w] = (m1Totals[w] || 0) + 1;

  let n = 0, sw = 0, m0 = 0, m1c = 0, brier = 0, brier0 = 0;
  if (seatLevel) {
    for (const [no, a] of actual) {
      const p = f.perSeat[no];
      if (!p) continue;
      n++;
      if (p.likely === a) sw++;
      if (p.base === a) m0++;
      if (m1.get(no) === a) m1c++;
      for (const party of new Set([...Object.keys(p.p), a])) brier += ((p.p[party] || 0) - (party === a ? 1 : 0)) ** 2;
      brier0 += p.base === a ? 0 : 2;
    }
  }
  const actualTotals: Record<string, number> = {};
  for (const a of actual.values()) actualTotals[a] = (actualTotals[a] || 0) + 1;
  const means = Object.fromEntries(f.totals.map((t) => [t.party, t.mean]));
  let cover = 0, coverN = 0;
  for (const t of f.totals) {
    if (t.mean < 1 && !actualTotals[t.party]) continue;
    coverN++;
    const a = actualTotals[t.party] || 0;
    if (a >= t.low && a <= t.high) cover++;
  }
  // Parties that won seats but were never forecast count as misses for coverage
  for (const p of Object.keys(actualTotals)) if (!f.totals.some((t) => t.party === p)) coverN++;
  const actualLargest = top(actualTotals);
  results.push({
    state, seatLevel, n, sw, m0, m1: m1c, brier, brier0,
    largest: {
      sw: top(means) === actualLargest,
      m1: top(m1Totals) === actualLargest,
      actual: actualLargest,
      predicted: top(means),
      pActual: f.totals.find((t) => t.party === actualLargest)?.pLargest ?? 0,
    },
    cover, coverN,
    newLabel: [...actual.values()].filter((a) => !baseParties.has(a)).length,
  });
}

const sl = results.filter((r) => r.seatLevel);
const N = sl.reduce((s, r) => s + r.n, 0);
const pct = (x: number) => (100 * x).toFixed(1) + '%';
function boot(f: (r: S) => number): [number, number] {
  let seed = 23;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const xs: number[] = [];
  for (let b = 0; b < 4000; b++) {
    let a = 0, d = 0;
    for (let i = 0; i < sl.length; i++) {
      const r = sl[Math.floor(rnd() * sl.length)];
      a += f(r);
      d += r.n;
    }
    xs.push(a / d);
  }
  xs.sort((a, b) => a - b);
  return [xs[100], xs[3899]];
}
const acc = (f: (r: S) => number) => {
  const [lo, hi] = boot(f);
  return `${pct(sl.reduce((s, r) => s + f(r), 0) / N)} (${pct(lo)}–${pct(hi)})`;
};
const coverage = results.reduce((s, r) => s + r.cover, 0) / results.reduce((s, r) => s + r.coverN, 0);
const dM0 = boot((r) => r.sw - r.m0);
const dM1 = boot((r) => r.sw - r.m1);
const out = [
  '# Swing model on the 20 elections of Nov 2023 – May 2026',
  '',
  `Scored ${new Date().toISOString()} under PREREGISTRATION-2.md. Seat level: ${sl.length} states, ${N} declared seats. Totals: all ${results.length} states.`,
  '',
  '| Model | Seat winners right (95% CI, bootstrap over states) | Largest party right | Brier per seat |',
  '|---|---|---|---|',
  `| M0: same party wins again | ${acc((r) => r.m0)} | – | ${(sl.reduce((s, r) => s + r.brier0, 0) / N).toFixed(3)} |`,
  `| M1: app engine today | ${acc((r) => r.m1)} | ${results.filter((r) => r.largest.m1).length} / ${results.length} | – |`,
  `| **Swing model (frozen)** | **${acc((r) => r.sw)}** | **${results.filter((r) => r.largest.sw).length} / ${results.length}** | **${(sl.reduce((s, r) => s + r.brier, 0) / N).toFixed(3)}** |`,
  '',
  `- **H1** swing − M0 seat accuracy: ${pct(sl.reduce((s, r) => s + r.sw - r.m0, 0) / N)} (95% CI ${pct(dM0[0])} to ${pct(dM0[1])}) → ${dM0[0] > 0 ? 'supported' : 'not supported'}.`,
  `- Swing − M1: ${pct(sl.reduce((s, r) => s + r.sw - r.m1, 0) / N)} (95% CI ${pct(dM1[0])} to ${pct(dM1[1])}).`,
  `- **H2** largest party right: swing ${results.filter((r) => r.largest.sw).length} vs M1 ${results.filter((r) => r.largest.m1).length} of ${results.length}.`,
  `- **H3** 80% seat ranges covered ${pct(coverage)} of parties (pre-registered acceptable band 70–90%) → ${coverage >= 0.7 && coverage <= 0.9 ? 'supported' : 'not supported'}.`,
  `- Seats won by labels absent from the base election (unforecastable new parties/factions): ${results.reduce((s, r) => s + r.newLabel, 0)}.`,
  '',
  '| State | Level | Seats | M0 | M1 | Swing | Actual largest | Forecast largest | P(actual largest) | New-label seats |',
  '|---|---|---|---|---|---|---|---|---|---|',
  ...results.map((r) => `| ${r.state} | ${r.seatLevel ? 'seat' : 'totals'} | ${r.n || '–'} | ${r.n ? pct(r.m0 / r.n) : '–'} | ${r.n ? pct(r.m1 / r.n) : '–'} | ${r.n ? pct(r.sw / r.n) : '–'} | ${r.largest.actual} | ${r.largest.predicted} | ${Math.round(100 * r.largest.pActual)}% | ${r.newLabel} |`),
];
writeFileSync('results/04_scores_2023_26.md', out.join('\n') + '\n');
console.log(out.join('\n'));
