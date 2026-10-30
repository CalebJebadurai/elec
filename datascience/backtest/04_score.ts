// Step 4: score the frozen predictions against newly downloaded TCPD data.
// Written and hashed BEFORE the new data was downloaded; rules are in PREREGISTRATION.md.
// Usage: bun 04_score.ts <path to new TCPD AE all-states csv(.gz)>
import { readFileSync, writeFileSync } from 'node:fs';
import { readCsv, num, type Row } from './csv';
import { normalizeParty } from './model';

const MODELS = ['M0', 'M1', 'M2', 'M3'] as const;
type M = (typeof MODELS)[number];
interface Frozen {
  baseYear: number;
  baseDelimID: string;
  seats: number;
  partiesInBase: string[];
  totals: Record<M, Record<string, number>>;
  M1range: { low: Record<string, number>; high: Record<string, number> };
  perSeat: Record<string, Record<M, string>>;
}
const frozen = JSON.parse(readFileSync('predictions/frozen_predictions.json', 'utf8')).states as Record<string, Frozen>;
const path = process.argv[2];
if (!path) throw new Error('Pass the new TCPD AE file');
const ae = readCsv(path);

interface StateResult {
  state: string;
  status: 'scored' | 'totals-only (boundaries changed)' | 'not in new data';
  targetYear?: number;
  matched: number;
  correct: Record<M, number>;
  perSeat: { m0: boolean; m1: boolean }[];
  largestRight: Record<M, boolean>;
  seatMAE: Record<M, number>;
  actualTotals: Record<string, number>;
  actualLargest?: string;
  newLabelWins: number;
  rangeHits: number;
  rangeN: number;
}
const results: StateResult[] = [];
const top = (t: Record<string, number>) => Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';

for (const [state, f] of Object.entries(frozen)) {
  const later = ae.filter((r: Row) => r.State_Name === state && r.Poll_No === '0' && num(r.Year) > f.baseYear);
  const empty = { M0: 0, M1: 0, M2: 0, M3: 0 };
  const res: StateResult = {
    state, status: 'not in new data', matched: 0, correct: { ...empty }, perSeat: [],
    largestRight: { M0: false, M1: false, M2: false, M3: false }, seatMAE: { ...empty },
    actualTotals: {}, newLabelWins: 0, rangeHits: 0, rangeN: 0,
  };
  if (!later.length) {
    results.push(res);
    continue;
  }
  // The next general election after the base year; it must cover >= 40% of seats
  const years = [...new Set(later.map((r) => num(r.Year)))].sort((a, b) => a - b);
  const target = years.find((y) => new Set(later.filter((r) => num(r.Year) === y).map((r) => r.Constituency_Name)).size >= f.seats * 0.4);
  if (target === undefined) {
    results.push(res);
    continue;
  }
  const rows = later.filter((r) => num(r.Year) === target);
  const winners = rows.filter((r) => num(r.Position) === 1);
  const actual: Record<string, string> = {};
  for (const w of winners) actual[w.Constituency_Name] = normalizeParty(w.Party);
  const delim = rows[0].DelimID;
  res.targetYear = target;
  res.status = delim === f.baseDelimID ? 'scored' : 'totals-only (boundaries changed)';
  for (const p of Object.values(actual)) res.actualTotals[p] = (res.actualTotals[p] || 0) + 1;
  res.actualLargest = top(res.actualTotals);
  res.newLabelWins = Object.values(actual).filter((p) => !f.partiesInBase.includes(p)).length;
  for (const m of MODELS) {
    res.largestRight[m] = top(f.totals[m]) === res.actualLargest;
    const parties = new Set([...Object.keys(res.actualTotals), ...Object.keys(f.totals[m]).filter((p) => f.totals[m][p] > 0)]);
    let err = 0;
    for (const p of parties) err += Math.abs((f.totals[m][p] || 0) - (res.actualTotals[p] || 0));
    res.seatMAE[m] = err / parties.size;
  }
  const rangeParties = new Set([...Object.keys(res.actualTotals), ...Object.keys(f.M1range.high).filter((p) => f.M1range.high[p] > 0)]);
  for (const p of rangeParties) {
    res.rangeN++;
    const a = res.actualTotals[p] || 0;
    if (a >= (f.M1range.low[p] || 0) && a <= (f.M1range.high[p] || 0)) res.rangeHits++;
  }
  if (res.status === 'scored') {
    for (const [seat, pred] of Object.entries(f.perSeat)) {
      const a = actual[seat];
      if (!a) continue;
      res.matched++;
      for (const m of MODELS) if (pred[m] === a) res.correct[m]++;
      res.perSeat.push({ m0: pred.M0 === a, m1: pred.M1 === a });
    }
  }
  results.push(res);
}

// ── Pooled statistics ───────────────────────────────────────────────
const scored = results.filter((r) => r.status === 'scored' && r.matched > 0);
const withTotals = results.filter((r) => r.status !== 'not in new data');
const pooled = (rs: StateResult[], m: M) => rs.reduce((s, r) => s + r.correct[m], 0) / rs.reduce((s, r) => s + r.matched, 0);
function bootstrap(rs: StateResult[], m: M, reps = 4000) {
  let seed = 20261030;
  const rand = () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
  const v: number[] = [];
  for (let i = 0; i < reps; i++) v.push(pooled(rs.map(() => rs[Math.floor(rand() * rs.length)]), m));
  v.sort((a, b) => a - b);
  return [v[Math.floor(reps * 0.025)], v[Math.floor(reps * 0.975)]];
}
let b = 0;
let c = 0;
for (const r of scored) for (const s of r.perSeat) {
  if (s.m1 && !s.m0) b++;
  if (s.m0 && !s.m1) c++;
}
const mcZ = (Math.abs(b - c) - 1) / Math.sqrt(b + c || 1);
// Exact one-sided binomial P(X >= k) for k of n at p
function binomUpper(k: number, n: number, p: number) {
  let s = 0;
  for (let i = k; i <= n; i++) {
    let lc = 0;
    for (let j = 1; j <= i; j++) lc += Math.log(n - i + j) - Math.log(j);
    s += Math.exp(lc + i * Math.log(p) + (n - i) * Math.log(1 - p));
  }
  return s;
}

const pct = (x: number) => (Number.isFinite(x) ? (100 * x).toFixed(1) + '%' : '—');
const L: string[] = [];
const log = (s = '') => (console.log(s), L.push(s));
log('# Results: frozen predictions vs new TCPD data');
log();
log(`New data file: ${path}`);
log(`States due: ${results.length}; in new data: ${withTotals.length}; seat-level scored: ${scored.length}; boundaries changed: ${withTotals.length - scored.length}`);
log();
log('| State | Base → target | Status | Seats matched | M0 | M1 (app) | M2 | M3 | Largest: actual / M1 | M1 seat error per party | Winners with a party label absent last time |');
log('|---|---|---|---|---|---|---|---|---|---|---|');
for (const r of results) {
  const acc = (m: M) => (r.matched ? pct(r.correct[m] / r.matched) : '—');
  const f = frozen[r.state];
  log(`| ${r.state} | ${f.baseYear} → ${r.targetYear ?? '—'} | ${r.status} | ${r.matched || '—'} | ${acc('M0')} | ${acc('M1')} | ${acc('M2')} | ${acc('M3')} | ${r.actualLargest ?? '—'} / ${r.targetYear ? top(f.totals.M1) : '—'} | ${r.targetYear ? r.seatMAE.M1.toFixed(1) : '—'} | ${r.targetYear ? r.newLabelWins : '—'} |`);
}
log();
log('## Pooled (pre-registered tests)');
for (const m of MODELS) {
  const [lo, hi] = scored.length ? bootstrap(scored, m) : [NaN, NaN];
  const lr = withTotals.filter((r) => r.largestRight[m]).length;
  log(`- ${m}: seat accuracy ${pct(pooled(scored, m))} (95% CI ${pct(lo)}–${pct(hi)}); largest party right in ${lr}/${withTotals.length}; mean seat error per party ${(withTotals.reduce((s, r) => s + r.seatMAE[m], 0) / withTotals.length).toFixed(2)}`);
}
const [lo1, hi1] = scored.length ? bootstrap(scored, 'M1') : [NaN, NaN];
log();
log(`- H1 (model card claims >= 65% winner accuracy): M1 = ${pct(pooled(scored, 'M1'))}, CI upper ${pct(hi1)} → ${hi1 < 0.65 ? 'REJECTED: below 65%' : 'not rejected'}`);
log(`- H2 (engine beats persistence): McNemar engine-only ${b}, persistence-only ${c}, z = ${mcZ.toFixed(2)} → ${Math.abs(mcZ) >= 1.96 ? (b > c ? 'engine better (p < 0.05)' : 'engine WORSE (p < 0.05)') : 'no significant difference'}`);
const k = withTotals.filter((r) => r.largestRight.M1).length;
log(`- H3 (largest party better than a coin flip): ${k}/${withTotals.length}, one-sided binomial p = ${binomUpper(k, withTotals.length, 0.5).toFixed(3)}`);
const rh = withTotals.reduce((s, r) => s + r.rangeHits, 0);
const rn = withTotals.reduce((s, r) => s + r.rangeN, 0);
log(`- H4 (stated seat ranges contain the actual count): ${rh}/${rn} = ${pct(rh / rn)} of party ranges`);
log(`- Lower bound on label effects: ${withTotals.reduce((s, r) => s + r.newLabelWins, 0)} seats were won under a party label that did not contest the base election; every model scores these as misses`);
writeFileSync('results/04_scores.md', L.join('\n') + '\n');
