// Rolling-origin backtest: each assembly election 2000–2023 is forecast by a model fitted
// only on elections that finished before it. Compared with persistence (M0) and the
// app's current engine (M1, anti-incumbency 10%), scored on the same seats.
import { writeFileSync, mkdirSync } from 'node:fs';
import { load, buildPairs, type Pair, type SeatResult } from './data';
import { fit, toInput } from './train';
import { forecastSwing, NEUTRAL_SLIDERS, type SwingCoefficients } from '../../frontend/src/engine/swingModel';
import { generateBaseline } from '../../frontend/src/engine/predictionEngine';
import type { ConstituencyPredictionData } from '../../frontend/src/types';

const { elections, ls } = load();
const all = buildPairs(elections).filter((p) => p.sameBoundaries && p.target.year >= 1977);
const tests = all.filter((p) => p.target.year >= 2000);
const ORACLE = process.argv.includes('--oracle');
// Error inflation applied to the fitted state-level sigma (calibration; see 03_calibrate.ts)
const K = Number(process.env.SIGMA_K || 1.5);

function engineInput(seats: SeatResult[]): ConstituencyPredictionData[] {
  return seats.map((s) => {
    const sorted = Object.entries(s.shares).sort((a, b) => b[1] - a[1]);
    return {
      constituency_name: String(s.no),
      constituency_no: s.no,
      constituency_type: s.type,
      district_name: null,
      sub_region: null,
      electors_latest: s.electors,
      valid_votes_latest: null,
      turnout_percentage_latest: s.turnout,
      enop_latest: null,
      n_cand_latest: null,
      winner_latest: null,
      winner_party_latest: s.winner,
      margin_latest: null,
      margin_percentage_latest: s.margin,
      candidates_latest: sorted.map(([party, v], i) => ({ party, votes: null, vote_share_percentage: v, position: i + 1 })),
      candidates_prev: [],
    };
  });
}

interface Row {
  label: string;
  year: number;
  seats: number;
  m0: number;
  m1: number;
  sw: number;
  brier: number;
  brierM0: number;
  largestM0: boolean;
  largestM1: boolean;
  largestSw: boolean;
  pLargestActual: number;
  maeM1: number;
  maeSw: number;
  covered: number;
  coverN: number;
}
const rows: Row[] = [];
const top = (t: Record<string, number>) => Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
const fitCache = new Map<number, SwingCoefficients>();

for (const p of tests) {
  // Train strictly on elections that finished before this one
  const key = p.target.year;
  let coef = fitCache.get(key);
  if (!coef) {
    coef = fit(all.filter((q) => q.target.year < key), ls, `<${key}`);
    coef.state.sigma = [coef.state.sigma[0] * K, coef.state.sigma[1] * K];
    fitCache.set(key, coef);
  }
  const input = toInput(p.base, p.prior, ls, p.target);
  let sliders = NEUTRAL_SLIDERS;
  if (ORACLE) {
    // What the sliders could do with perfect knowledge of each party's state-wide swing
    const learned = forecastSwing(input, coef, NEUTRAL_SLIDERS, 1).stateSwing;
    const partySwing: Record<string, number> = {};
    for (const [party, d] of Object.entries(learned)) partySwing[party] = (p.target.stateShare[party] || 0) - (p.base.stateShare[party] || 0) - d;
    sliders = { ...NEUTRAL_SLIDERS, partySwing };
  }
  const f = forecastSwing(input, coef, sliders, 400, 7);
  const m1 = generateBaseline(engineInput([...p.base.seats.values()]), { antiIncumbencyPct: 10, turnoutPct: 60, growthFactor: 1 });
  const m1Win = new Map(m1.map((r) => [r.constituency_no, r.predicted_winner]));

  let n = 0, c0 = 0, c1 = 0, cs = 0, brier = 0, brier0 = 0;
  const actual: Record<string, number> = {}, t0: Record<string, number> = {}, t1: Record<string, number> = {};
  for (const s of f.seats) {
    const no = Number(s.key);
    const t = p.target.seats.get(no);
    const b = p.base.seats.get(no)!;
    if (!t) continue;
    n++;
    actual[t.winner] = (actual[t.winner] || 0) + 1;
    t0[b.winner] = (t0[b.winner] || 0) + 1;
    const w1 = m1Win.get(no) ?? b.winner;
    t1[w1] = (t1[w1] || 0) + 1;
    if (b.winner === t.winner) c0++;
    if (w1 === t.winner) c1++;
    if (s.likelyWinner === t.winner) cs++;
    for (const party of new Set([...Object.keys(s.winProb), t.winner])) brier += ((s.winProb[party] || 0) - (party === t.winner ? 1 : 0)) ** 2;
    brier0 += b.winner === t.winner ? 0 : 2;
  }
  const meanTotals = Object.fromEntries(f.parties.map((q) => [q.party, q.mean]));
  const mae = (pred: Record<string, number>) => {
    const ps = new Set([...Object.keys(actual), ...Object.keys(pred).filter((q) => pred[q] >= 0.5)]);
    let e = 0;
    for (const q of ps) e += Math.abs((pred[q] || 0) - (actual[q] || 0));
    return e / ps.size;
  };
  let covered = 0, coverN = 0;
  for (const q of f.parties) {
    if (q.mean < 1 && !actual[q.party]) continue;
    coverN++;
    const a = actual[q.party] || 0;
    if (a >= q.low && a <= q.high) covered++;
  }
  rows.push({
    label: `${p.target.state} ${p.target.year}`,
    year: p.target.year,
    seats: n,
    m0: c0 / n,
    m1: c1 / n,
    sw: cs / n,
    brier: brier / n,
    brierM0: brier0 / n,
    largestM0: top(t0) === top(actual),
    largestM1: top(t1) === top(actual),
    largestSw: top(meanTotals) === top(actual),
    pLargestActual: f.parties.find((q) => q.party === top(actual))?.pLargest ?? 0,
    maeM1: mae(t1),
    maeSw: mae(meanTotals),
    covered,
    coverN,
  });
}

// ── Summary with a cluster bootstrap over elections ──
const seatsTotal = rows.reduce((s, r) => s + r.seats, 0);
const pooled = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r) * r.seats, 0) / seatsTotal;
function bootCI(f: (r: Row) => number, B = 2000): [number, number] {
  let seed = 11;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const xs: number[] = [];
  for (let b = 0; b < B; b++) {
    let num = 0, den = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[Math.floor(rnd() * rows.length)];
      num += f(r) * r.seats;
      den += r.seats;
    }
    xs.push(num / den);
  }
  xs.sort((a, b) => a - b);
  return [xs[Math.floor(0.025 * B)], xs[Math.floor(0.975 * B)]];
}
const pct = (x: number) => (100 * x).toFixed(1) + '%';
const ci = (f: (r: Row) => number) => {
  const [a, b] = bootCI(f);
  return `${pct(pooled(f))} (${pct(a)}–${pct(b)})`;
};
const diff = bootCI((r) => r.sw - r.m0);
const count = (f: (r: Row) => boolean) => `${rows.filter(f).length} / ${rows.length}`;
const coverage = rows.reduce((s, r) => s + r.covered, 0) / rows.reduce((s, r) => s + r.coverN, 0);
const cov = (rs: Row[]) => rs.reduce((s, r) => s + r.covered, 0) / rs.reduce((s, r) => s + r.coverN, 0);
console.log(`K=${K} coverage 2000-09 ${pct(cov(rows.filter((r) => r.year < 2010)))} 2010-23 ${pct(cov(rows.filter((r) => r.year >= 2010)))}`);
const meanBy = (f: (r: Row) => number) => rows.reduce((s, r) => s + f(r), 0) / rows.length;

// Calibration of P(largest party) — bins of the probability given to the eventual largest party
const out = [
  `# Swing model backtest${ORACLE ? ' — ORACLE (actual state swings fed in through the party sliders)' : ''}`,
  '',
  `Rolling origin: ${rows.length} assembly elections 2000–2023 with unchanged boundaries, ${seatsTotal} seats. Each is forecast by a model fitted only on elections before its year.`,
  '',
  '| Model | Seat winners right (95% CI) | Largest party right | Mean seat error per party | Brier score per seat |',
  '|---|---|---|---|---|',
  `| M0: same party wins again | ${ci((r) => r.m0)} | ${count((r) => r.largestM0)} | – | ${pooled((r) => r.brierM0).toFixed(3)} |`,
  `| M1: app engine today (10% anti-incumbency) | ${ci((r) => r.m1)} | ${count((r) => r.largestM1)} | ${meanBy((r) => r.maeM1).toFixed(1)} | – |`,
  `| **Swing model** | **${ci((r) => r.sw)}** | **${count((r) => r.largestSw)}** | **${meanBy((r) => r.maeSw).toFixed(1)}** | **${pooled((r) => r.brier).toFixed(3)}** |`,
  '',
  `- Swing model minus persistence, seat accuracy: ${pct(pooled((r) => r.sw - r.m0))} (95% CI ${pct(diff[0])} to ${pct(diff[1])}).`,
  `- 80% seat ranges contained the actual count for **${pct(coverage)}** of parties (target 80%).`,
  `- Mean probability the model gave to the party that actually came first: ${pct(meanBy((r) => r.pLargestActual))}.`,
  '',
  '## Per election',
  '',
  '| Election | Seats | M0 | M1 | Swing | Largest right (M1 / Swing) |',
  '|---|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.label} | ${r.seats} | ${pct(r.m0)} | ${pct(r.m1)} | ${pct(r.sw)} | ${r.largestM1 ? 'yes' : 'no'} / ${r.largestSw ? 'yes' : 'no'} |`),
];
mkdirSync(new URL('./results', import.meta.url).pathname, { recursive: true });
writeFileSync(new URL(`./results/02_backtest${ORACLE ? '_oracle' : ''}.md`, import.meta.url).pathname, out.join('\n') + '\n');
console.log(out.slice(0, 14).join('\n'));
