// Step 4: the swing model for Lok Sabha elections. Same design, fitted on Lok Sabha pairs, with
// the latest assembly result in each state as the mid-term signal. Rolling by general election.
// Gate set before running: beat persistence on seats; 80% ranges hold for 70–90% of parties.
import { writeFileSync } from 'node:fs';
import { load, loadLokSabhaElections, buildPairs, type Pair, type StateElection } from './data';
import { fit, toInput, type Signal } from './train';
import { forecastSwing, NEUTRAL_SLIDERS } from '../../frontend/src/engine/swingModel';
import { SIGMA_K } from './03_freeze_constants';

const { elections: assemblies } = load();
const lsElections = loadLokSabhaElections();
const after = (a: { year: number; month: number }, b: { year: number; month: number }) => a.year > b.year || (a.year === b.year && a.month > b.month);
/** Latest assembly election in the state strictly between two Lok Sabha polls. */
const assemblySignal: Signal = (base, target) => {
  const mids = assemblies.filter((e) => e.state === base.state && after(e, base) && after(target, e));
  return mids.length ? mids[mids.length - 1].stateShare : null;
};

const all = buildPairs(lsElections).filter((p) => p.sameBoundaries && p.target.year >= 1977 && p.base.seats.size >= 2);
const years = [...new Set(all.map((p) => p.target.year))].filter((y) => y >= 1996).sort((a, b) => a - b);
const top = (t: Record<string, number>) => Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
const pct = (x: number) => (100 * x).toFixed(1) + '%';

const lines = ['# Swing model for the Lok Sabha: rolling backtest', '', '| Year | States | Seats | Same party again | Swing model | Gain | 80% ranges held | BJP seats: forecast / actual | INC seats: forecast / actual | Largest party (national) |', '|---|---|---|---|---|---|---|---|---|---|'];
let [N, C0, CS, COV, COVN] = [0, 0, 0, 0, 0];
const rows: { n: number; c0: number; cs: number }[] = [];
for (const year of years) {
  const coef = fit(all.filter((q) => q.target.year < year), assemblySignal, `<${year}`);
  coef.state.sigma = [coef.state.sigma[0] * SIGMA_K, coef.state.sigma[1] * SIGMA_K];
  let [n, c0, cs, cov, covN] = [0, 0, 0, 0, 0];
  const nationalF: Record<string, number> = {}, nationalA: Record<string, number> = {};
  const ps = all.filter((p) => p.target.year === year);
  for (const p of ps) {
    const f = forecastSwing(toInput(p.base, p.prior, assemblySignal, p.target), coef, NEUTRAL_SLIDERS, 400, 7);
    const actual: Record<string, number> = {};
    for (const s of f.seats) {
      const t = p.target.seats.get(Number(s.key));
      if (!t) continue;
      n++;
      if (p.base.seats.get(Number(s.key))!.winner === t.winner) c0++;
      if (s.likelyWinner === t.winner) cs++;
      actual[t.winner] = (actual[t.winner] || 0) + 1;
    }
    for (const q of f.parties) {
      nationalF[q.party] = (nationalF[q.party] || 0) + q.mean;
      if (q.mean < 1 && !actual[q.party]) continue;
      covN++;
      const a = actual[q.party] || 0;
      if (a >= q.low && a <= q.high) cov++;
    }
    for (const [q, v] of Object.entries(actual)) nationalA[q] = (nationalA[q] || 0) + v;
  }
  rows.push({ n, c0, cs });
  N += n; C0 += c0; CS += cs; COV += cov; COVN += covN;
  lines.push(`| ${year} | ${ps.length} | ${n} | ${pct(c0 / n)} | ${pct(cs / n)} | ${(100 * (cs - c0) / n).toFixed(1)} | ${pct(cov / covN)} | ${Math.round(nationalF.BJP || 0)} / ${nationalA.BJP || 0} | ${Math.round(nationalF.INC || 0)} / ${nationalA.INC || 0} | ${top(nationalF)} / ${top(nationalA)} |`);
}
lines.push(`| **All** | | **${N}** | **${pct(C0 / N)}** | **${pct(CS / N)}** | **${(100 * (CS - C0) / N).toFixed(1)}** | **${pct(COV / COVN)}** | | | |`, '');
const gain = rows.map((r) => (r.cs - r.c0) / r.n);
lines.push(`Gain by election: ${gain.map((g) => (100 * g).toFixed(1)).join(', ')} points. Positive in ${gain.filter((g) => g > 0).length} of ${gain.length}.`);
writeFileSync(new URL('./results/09_lok_sabha.md', import.meta.url).pathname, lines.join('\n') + '\n');
console.log(lines.join('\n'));
