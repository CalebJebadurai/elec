// Step 2: exploratory analysis and an out-of-sample backtest on data we already have.
// For every pair of consecutive general elections in a state with the same
// delimitation, predict election t from election t-1 only, then score against t.
// Nothing here reads data newer than the local 2026-04-30 TCPD dump.
import { writeFileSync } from 'node:fs';
import { readCsv, num, type Row } from './csv';
import {
  generalYears,
  engineInput,
  engineForecast,
  rulingPartyOutForecast,
  actualWinners,
  score,
  normalizeParty,
  type Forecast,
  type Score,
} from './model';

const ae = readCsv('../../data/TCPD_AE_All_States_2026-4-30.csv.gz');
const byStateYear: Record<string, Record<number, Row[]>> = {};
for (const r of ae) ((byStateYear[r.State_Name] ??= {})[num(r.Year)] ??= []).push(r);

const mode = (xs: string[]) =>
  Object.entries(xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] || 0) + 1), m), {})).sort(
    (a, b) => b[1] - a[1]
  )[0]?.[0];

// ── EDA ─────────────────────────────────────────────────────────────
interface ElectionStats {
  state: string;
  year: number;
  delim: string;
  seats: number;
  largest: string;
  largestSeats: number;
  closeSeatShare: number; // margin < 5% of votes
  medianMargin: number;
  meanEnop: number;
  turnout: number;
}
const elections: ElectionStats[] = [];
for (const state of Object.keys(byStateYear)) {
  for (const y of generalYears(ae, state)) {
    const rows = byStateYear[state][y].filter((r) => r.Poll_No === '0');
    const winners = rows.filter((r) => num(r.Position) === 1);
    if (!winners.length) continue;
    const tally: Record<string, number> = {};
    for (const w of winners) tally[normalizeParty(w.Party)] = (tally[normalizeParty(w.Party)] || 0) + 1;
    const [largest, largestSeats] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    const margins = winners.map((w) => num(w.Margin_Percentage)).filter(Number.isFinite).sort((a, b) => a - b);
    const enops = winners.map((w) => num(w.ENOP)).filter(Number.isFinite);
    const turnouts = winners.map((w) => num(w.Turnout_Percentage)).filter(Number.isFinite);
    elections.push({
      state,
      year: y,
      delim: mode(rows.map((r) => r.DelimID)) ?? '',
      seats: winners.length,
      largest,
      largestSeats,
      closeSeatShare: margins.filter((m) => m < 5).length / margins.length,
      medianMargin: margins[Math.floor(margins.length / 2)],
      meanEnop: enops.reduce((a, b) => a + b, 0) / enops.length,
      turnout: turnouts.reduce((a, b) => a + b, 0) / turnouts.length,
    });
  }
}

// ── Backtest ────────────────────────────────────────────────────────
const SWEEP = [0, 5, 10, 15, 20, 25, 30, 35, 40];
interface PairResult {
  state: string;
  from: number;
  to: number;
  seatRetention: number; // share of seats the same party won again
  govChanged: boolean; // largest party changed
  m0: Score; // persistence (engine at 0%)
  m1: Score; // engine shipped default (10%)
  m2: Score; // largest party loses all its seats
  sweep: Record<number, Score>;
  perSeat: { m0: boolean; m1: boolean }[];
}
const pairs: PairResult[] = [];
for (const state of Object.keys(byStateYear)) {
  const years = generalYears(ae, state);
  for (let i = 1; i < years.length; i++) {
    const [y0, y1] = [years[i - 1], years[i]];
    const e0 = elections.find((e) => e.state === state && e.year === y0);
    const e1 = elections.find((e) => e.state === state && e.year === y1);
    if (!e0 || !e1 || e0.delim !== e1.delim || y1 < 1977) continue;
    const input = engineInput(byStateYear[state][y0]);
    const actual = actualWinners(byStateYear[state][y1]);
    const f0 = engineForecast(input, state, 0);
    const f1 = engineForecast(input, state, 10);
    const sweep: Record<number, Score> = {};
    for (const a of SWEEP) sweep[a] = score(a === 0 ? f0 : a === 10 ? f1 : engineForecast(input, state, a), actual);
    const perSeat = f0.seats
      .filter((s) => actual[s.seat])
      .map((s) => ({
        m0: s.predicted === actual[s.seat],
        m1: f1.seats.find((x) => x.seat === s.seat)?.predicted === actual[s.seat],
      }));
    const m0 = sweep[0];
    pairs.push({
      state,
      from: y0,
      to: y1,
      seatRetention: m0.accuracy,
      govChanged: e0.largest !== e1.largest,
      m0,
      m1: sweep[10],
      m2: score(rulingPartyOutForecast(input), actual),
      sweep,
      perSeat,
    });
  }
}

// ── Summaries ───────────────────────────────────────────────────────
const pooled = (ps: PairResult[], pick: (p: PairResult) => Score) => {
  const c = ps.reduce((s, p) => s + pick(p).correct, 0);
  const n = ps.reduce((s, p) => s + pick(p).matched, 0);
  return c / n;
};
// Cluster bootstrap over elections (seats inside one election are not independent)
function bootstrapCI(ps: PairResult[], pick: (p: PairResult) => Score, reps = 4000) {
  let seed = 20261030;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
  const vals: number[] = [];
  for (let r = 0; r < reps; r++) {
    const sample = ps.map(() => ps[Math.floor(rand() * ps.length)]);
    vals.push(pooled(sample, pick));
  }
  vals.sort((a, b) => a - b);
  return [vals[Math.floor(reps * 0.025)], vals[Math.floor(reps * 0.975)]];
}
// McNemar on discordant seats (exact two-sided binomial via normal approx for large n)
function mcnemar(ps: PairResult[]) {
  let b = 0;
  let c = 0;
  for (const p of ps)
    for (const s of p.perSeat) {
      if (s.m1 && !s.m0) b++;
      if (s.m0 && !s.m1) c++;
    }
  const z = (Math.abs(b - c) - 1) / Math.sqrt(b + c || 1);
  return { engineOnlyRight: b, persistenceOnlyRight: c, z };
}

const recent = pairs.filter((p) => p.to >= 2000);
const pct = (x: number) => (100 * x).toFixed(1) + '%';
const lines: string[] = [];
const log = (s = '') => (console.log(s), lines.push(s));

log('# EDA and backtest on local data (TCPD AE dump 2026-04-30)');
log();
log(`Elections analysed: ${elections.length} general assembly elections in ${new Set(elections.map((e) => e.state)).size} states/UTs`);
log(`Backtest pairs (same delimitation, target year >= 1977): ${pairs.length}; with target year >= 2000: ${recent.length}`);
log();
log('## How often does the past repeat? (target year >= 2000)');
const govChange = recent.filter((p) => p.govChanged).length / recent.length;
log(`- Largest party changed in ${pct(govChange)} of state elections`);
log(`- Same party re-won a seat in ${pct(pooled(recent, (p) => p.m0))} of seats (pooled)`);
const decades = [1977, 1990, 2000, 2010, 2020];
for (let i = 0; i < decades.length; i++) {
  const ps = pairs.filter((p) => p.to >= decades[i] && p.to < (decades[i + 1] ?? 3000));
  if (ps.length)
    log(`  - ${decades[i]}–${(decades[i + 1] ?? 2024) - 1}: seat retention ${pct(pooled(ps, (p) => p.m0))}, largest party changed ${pct(ps.filter((p) => p.govChanged).length / ps.length)} (${ps.length} elections)`);
}
const recentEl = elections.filter((e) => e.year >= 2000);
log(`- Close seats (margin < 5% of votes): ${pct(recentEl.reduce((s, e) => s + e.closeSeatShare, 0) / recentEl.length)} of seats on average`);
log(`- Mean effective number of parties (winner rows): ${(recentEl.reduce((s, e) => s + e.meanEnop, 0) / recentEl.length).toFixed(2)}`);
log();
log('## Backtest: predict election t from t-1 (target year >= 2000)');
log('| Model | Seat accuracy | 95% CI (cluster bootstrap) | Largest party right | Mean seat error per party |');
log('|---|---|---|---|---|');
const row = (name: string, pick: (p: PairResult) => Score) => {
  const [lo, hi] = bootstrapCI(recent, pick);
  log(`| ${name} | ${pct(pooled(recent, pick))} | ${pct(lo)}–${pct(hi)} | ${pct(recent.filter((p) => pick(p).largestPartyCorrect).length / recent.length)} | ${(recent.reduce((s, p) => s + pick(p).seatMAE, 0) / recent.length).toFixed(2)} |`);
};
row('M0 Persistence (same party wins again)', (p) => p.m0);
row('M1 App engine, shipped default (10% anti-incumbency)', (p) => p.m1);
row('M2 Largest party loses all its seats', (p) => p.m2);
const mc = mcnemar(recent);
log();
log(`McNemar, M1 vs M0 on matched seats: engine-only correct ${mc.engineOnlyRight}, persistence-only correct ${mc.persistenceOnlyRight}, z = ${mc.z.toFixed(2)}`);
log();
log('## Sensitivity: engine accuracy by anti-incumbency setting (target year >= 2000)');
log('| Anti-incumbency % | Seat accuracy | Largest party right |');
log('|---|---|---|');
let best = 0;
let bestAcc = -1;
for (const a of SWEEP) {
  const acc = pooled(recent, (p) => p.sweep[a]);
  if (acc > bestAcc) [best, bestAcc] = [a, acc];
  log(`| ${a} | ${pct(acc)} | ${pct(recent.filter((p) => p.sweep[a].largestPartyCorrect).length / recent.length)} |`);
}
log();
log(`Best setting on this historical data: ${best}% (seat accuracy ${pct(bestAcc)}). This is frozen as model M3 before any new data is seen.`);
log();
log('## Per election (target year >= 2010)');
log('| State | From → to | Seats matched | M0 | M1 | M2 | Largest party: actual / M1 |');
log('|---|---|---|---|---|---|---|');
for (const p of recent.filter((p) => p.to >= 2010).sort((a, b) => a.to - b.to || a.state.localeCompare(b.state)))
  log(`| ${p.state} | ${p.from} → ${p.to} | ${p.m0.matched} | ${pct(p.m0.accuracy)} | ${pct(p.m1.accuracy)} | ${pct(p.m2.accuracy)} | ${p.m1.actualLargest} / ${p.m1.predictedLargest} |`);

writeFileSync('results/02_eda_backtest.md', lines.join('\n') + '\n');
writeFileSync('results/m3_setting.json', JSON.stringify({ antiIncumbencyPct: best, selectedOn: 'pairs with target year >= 2000, local data only', pooledAccuracy: bestAcc }, null, 2) + '\n');
export type { Forecast };
