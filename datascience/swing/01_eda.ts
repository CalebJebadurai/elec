// EDA on local TCPD data (assembly elections up to 2023, Lok Sabha up to 2019):
// what moves a party's vote between two assembly elections, and how much of a seat's
// result the state-wide swing explains.
import { writeFileSync, mkdirSync } from 'node:fs';
import { load, buildPairs, lokSabhaBetween, type Pair } from './data';

const { elections, ls } = load();
const pairs = buildPairs(elections).filter((p) => p.sameBoundaries && p.target.year >= 1977);

const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};
const corr = (x: number[], y: number[]) => {
  const [mx, my] = [mean(x), mean(y)];
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) {
    sxy += (x[i] - mx) * (y[i] - my);
    sxx += (x[i] - mx) ** 2;
    syy += (y[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
};
const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
const out: string[] = ['# Swing model EDA', '', `Pairs of consecutive general assembly elections with unchanged boundaries, targets 1977–2023: **${pairs.length}**.`, ''];

// 1. Anti-incumbency at state level: the largest party's change in state vote share
out.push('## 1. Does the largest party lose votes next time?', '');
out.push('| Target years | Elections | Largest party mean swing (pts) | SD | Share losing votes | Share losing seat lead |', '|---|---|---|---|---|---|');
const eras: [number, number][] = [[1977, 1989], [1990, 1999], [2000, 2009], [2010, 2023], [1977, 2023]];
for (const [a, b] of eras) {
  const ps = pairs.filter((p) => p.target.year >= a && p.target.year <= b);
  const sw = ps.map((p) => (p.target.stateShare[p.base.largest] || 0) - (p.base.stateShare[p.base.largest] || 0));
  const lostLead = ps.filter((p) => p.target.largest !== p.base.largest).length;
  out.push(`| ${a}–${b} | ${ps.length} | ${f1(mean(sw))} | ${f1(sd(sw))} | ${Math.round((100 * sw.filter((x) => x < 0).length) / sw.length)}% | ${Math.round((100 * lostLead) / ps.length)}% |`);
}

// 2. State-level swing vs party size, trend, Lok Sabha signal
interface PR { pair: Pair; party: string; S: number; dS: number; trend: number | null; isLargest: boolean; ge: number | null; dT: number; growth: number }
const prs: PR[] = [];
for (const p of pairs) {
  const g = latestGE(p);
  for (const [party, S] of Object.entries(p.base.stateShare)) {
    if (S < 3 || party === 'IND') continue;
    prs.push({
      pair: p,
      party,
      S,
      dS: (p.target.stateShare[party] || 0) - S,
      trend: p.prior ? S - (p.prior.stateShare[party] || 0) : null,
      isLargest: party === p.base.largest,
      ge: g ? (g[party] || 0) - S : null,
      dT: p.target.turnout - p.base.turnout,
      growth: p.base.electors ? (100 * (p.target.electors - p.base.electors)) / p.base.electors : 0,
    });
  }
}
function latestGE(p: Pair) {
  return lokSabhaBetween(ls, p.base.state, p.base, p.target);
}
out.push('', '## 2. State-wide swing of parties with ≥3% (party-election rows)', '');
out.push(`Rows: ${prs.length}. Mean swing ${f2(mean(prs.map((r) => r.dS)))} pts, SD ${f1(sd(prs.map((r) => r.dS)))}.`, '');
out.push('| Signal known before the election | Rows | Correlation with swing |', '|---|---|---|');
const rowsWith = (f: (r: PR) => number | null) => prs.filter((r) => f(r) !== null);
const c = (name: string, f: (r: PR) => number | null) => {
  const rs = rowsWith(f);
  out.push(`| ${name} | ${rs.length} | ${f2(corr(rs.map((r) => f(r)!), rs.map((r) => r.dS)))} |`);
};
c('Base vote share (size)', (r) => r.S);
c('Is the largest party (0/1)', (r) => (r.isLargest ? 1 : 0));
c('Trend: base share minus the share one election earlier', (r) => r.trend);
c('Lok Sabha signal: latest LS share in between minus base share', (r) => r.ge);
out.push('', 'Known only after the election (used for slider effects, not for default forecasts):', '');
out.push('| Signal | Rows | Correlation with the largest party\'s swing |', '|---|---|---|');
const lg = prs.filter((r) => r.isLargest);
out.push(`| Turnout change (pts) | ${lg.length} | ${f2(corr(lg.map((r) => r.dT), lg.map((r) => r.dS)))} |`);
out.push(`| Electorate growth (%) — new-voter proxy | ${lg.length} | ${f2(corr(lg.map((r) => r.growth), lg.map((r) => r.dS)))} |`);

// 3. Seat level: how much does the state swing explain?
let n = 0, uniformHit = 0, propHit = 0, persistHit = 0;
const resid: number[] = [], seatSw: number[] = [];
for (const p of pairs) {
  for (const [no, s] of p.base.seats) {
    const t = p.target.seats.get(no);
    if (!t) continue;
    n++;
    const uni: Record<string, number> = {};
    const prop: Record<string, number> = {};
    for (const [party, v] of Object.entries(s.shares)) {
      const S = p.base.stateShare[party] || 0;
      const dS = (p.target.stateShare[party] || 0) - S;
      uni[party] = v + dS;
      prop[party] = S > 0 ? v * (1 + dS / S) : v;
      if (party !== 'IND' && t.shares[party] !== undefined) {
        seatSw.push(t.shares[party] - v);
        resid.push(t.shares[party] - v - dS);
      }
    }
    const top = (o: Record<string, number>) => Object.entries(o).sort((a, b) => b[1] - a[1])[0][0];
    if (top(uni) === t.winner) uniformHit++;
    if (top(prop) === t.winner) propHit++;
    if (s.winner === t.winner) persistHit++;
  }
}
out.push('', '## 3. Seat level: the ceiling if the state swing were known exactly', '');
out.push(`Seats in matched pairs: ${n}.`, '');
out.push('| Rule | Seat winners right |', '|---|---|');
out.push(`| Same party wins again | ${f1((100 * persistHit) / n)}% |`);
out.push(`| Base result + exact state swing, uniform (pts) | ${f1((100 * uniformHit) / n)}% |`);
out.push(`| Base result + exact state swing, proportional | ${f1((100 * propHit) / n)}% |`);
out.push('', `A party's seat swing has SD ${f1(sd(seatSw))} pts; after removing its exact state swing, SD ${f1(sd(resid))} pts. So ${Math.round(100 * (1 - sd(resid) ** 2 / sd(seatSw) ** 2))}% of seat-level variance is the state-wide swing.`);
out.push('', '**Reading:** the state-wide swing is the one big shared driver: knowing it exactly lifts seat accuracy by about 12 points over persistence, and no seat-level formula can see it. The rest is seat-level noise (candidates, local alliances), which can only be expressed as uncertainty. The model should forecast the state swing with honest error bars and let sliders move it.');

mkdirSync(new URL('./results', import.meta.url).pathname, { recursive: true });
writeFileSync(new URL('./results/01_eda.md', import.meta.url).pathname, out.join('\n') + '\n');
console.log(out.join('\n'));
