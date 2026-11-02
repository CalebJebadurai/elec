// Step 3: does women's turnout tell us anything about results? Aggregate data only: this can
// show whether seats with more women voting behaved differently, never how women voted.
// A: Lok Sabha 2019→2024, 500+ constituencies with gender data at both elections.
// B: assembly elections 2023–26, the model's seat errors against women's share of voters.
// Both use state fixed effects and standard errors clustered by state.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { readCsv, num } from '../backtest/csv';
import { parseCsv } from '../refresh/build_ae';
import { load, buildPairs } from './data';
import { fit, toInput } from './train';
import { forecastSwing, NEUTRAL_SLIDERS } from '../../frontend/src/engine/swingModel';
import { SIGMA_K } from './03_freeze_constants';

const RAW = new URL('../refresh/raw/', import.meta.url).pathname;

interface Obs { group: string; y: number; x: number[] }

/** OLS after removing group means, with cluster-robust standard errors by group. */
function feOls(obs: Obs[], names: string[]) {
  const k = names.length;
  const groups = new Map<string, Obs[]>();
  for (const o of obs) {
    let g = groups.get(o.group);
    if (!g) groups.set(o.group, (g = []));
    g.push(o);
  }
  const rows: { g: string; y: number; x: number[] }[] = [];
  for (const [g, os] of groups) {
    const my = os.reduce((s, o) => s + o.y, 0) / os.length;
    const mx = names.map((_, j) => os.reduce((s, o) => s + o.x[j], 0) / os.length);
    for (const o of os) rows.push({ g, y: o.y - my, x: o.x.map((v, j) => v - mx[j]) });
  }
  const XX = Array.from({ length: k }, () => new Array(k).fill(0));
  const Xy = new Array(k).fill(0);
  for (const r of rows)
    for (let a = 0; a < k; a++) {
      Xy[a] += r.x[a] * r.y;
      for (let b = 0; b < k; b++) XX[a][b] += r.x[a] * r.x[b];
    }
  const inv = invert(XX);
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * Xy[j], 0));
  const meat = Array.from({ length: k }, () => new Array(k).fill(0));
  for (const g of groups.keys()) {
    const s = new Array(k).fill(0);
    for (const r of rows.filter((q) => q.g === g)) {
      const e = r.y - r.x.reduce((t, v, j) => t + v * beta[j], 0);
      for (let a = 0; a < k; a++) s[a] += r.x[a] * e;
    }
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) meat[a][b] += s[a] * s[b];
  }
  const V = mul(mul(inv, meat), inv);
  const G = groups.size;
  const adj = G > 1 ? G / (G - 1) : 1;
  const tss = rows.reduce((s, r) => s + r.y ** 2, 0);
  const rss = rows.reduce((s, r) => s + (r.y - r.x.reduce((t, v, j) => t + v * beta[j], 0)) ** 2, 0);
  return { n: rows.length, groups: G, r2: 1 - rss / tss, terms: names.map((name, j) => ({ name, b: beta[j], se: Math.sqrt(V[j][j] * adj) })) };
}
const mul = (A: number[][], B: number[][]) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, l) => s + v * B[l][j], 0)));
function invert(M: number[][]): number[][] {
  const n = M.length;
  const A = M.map((r, i) => [...r, ...r.map((_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c];
    for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c];
      for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map((r) => r.slice(n));
}

const out: string[] = ['# Women voters and results: what aggregate data can show', '', 'Effects are in points of vote share. Standard errors are clustered by state, and |t| ≥ 2 is the bar for "reliable". These are associations between places, not statements about how women voted.', ''];
const table = (title: string, r: ReturnType<typeof feOls>) => {
  out.push(`### ${title}`, '', `${r.n} seats, ${r.groups} states, within-state R² ${r.r2.toFixed(3)}.`, '', '| Term | Effect per point | SE | t |', '|---|---|---|---|');
  for (const t of r.terms) out.push(`| ${t.name} | ${t.b.toFixed(3)} | ${t.se.toFixed(3)} | ${(t.b / t.se).toFixed(1)} |`);
  out.push('');
};

// ── A: Lok Sabha 2019 → 2024 ──
const summary = readCsv(RAW + 'ls_summary_2019_2024.csv');
const detailed = readCsv(RAW + 'ls_detailed_2019_2024.csv');
const key = (r: { state_name: string; pc_code: string }) => `${r.state_name}|${r.pc_code}`;
const gender: Record<string, Record<string, { gap: number; womenShare: number; womenRoll: number; turnout: number }>> = {};
for (const r of summary) {
  const [em, ew, vm, vw] = [num(r.total_electors_men), num(r.total_electors_women), num(r.total_voters_men), num(r.total_voters_women)];
  if (!(em > 0 && ew > 0)) continue;
  (gender[r.year] ??= {})[key(r)] = { gap: (100 * vw) / ew - (100 * vm) / em, womenShare: (100 * vw) / (vw + vm), womenRoll: (100 * ew) / (ew + em), turnout: (100 * (vw + vm)) / (ew + em) };
}
const shareOf = (party: string) => {
  const s: Record<string, Record<string, number>> = {};
  for (const r of detailed) if (r.party_name === party) ((s[r.year] ??= {})[key(r)] = (s[r.year]?.[key(r)] || 0) + num(r.pct_votes_over_valid_votes));
  return s;
};
const partyPanel = (party: string) => {
  const s = shareOf(party);
  const obs: Obs[] = [];
  for (const [k, g19] of Object.entries(gender['2019'] ?? {})) {
    const g24 = gender['2024']?.[k];
    const [a, b] = [s['2019']?.[k], s['2024']?.[k]];
    const state = k.split('|')[0];
    // Assam and J&K constituencies were redrawn between the two elections
    if (!g24 || a === undefined || b === undefined || /Assam|Jammu/i.test(state)) continue;
    obs.push({ group: state, y: b - a, x: [g24.gap - g19.gap, g19.gap, g24.turnout - g19.turnout] });
  }
  return obs;
};
out.push('## A. Lok Sabha 2019→2024: change in a party\'s vote share by constituency', '');
const names = ['Change in women-minus-men turnout gap', 'Gap in 2019 (known beforehand)', 'Change in overall turnout'];
const bjp = feOls(partyPanel('Bharatiya Janata Party'), names);
const inc = feOls(partyPanel('Indian National Congress'), names);
table('BJP', bjp);
table('INC', inc);

// ── B: assembly 2023–26, the model's seat errors ──
const gdir = RAW + 'eci/';
const acGender: Record<string, Map<number, { womenShare: number; gap: number; womenRoll: number }>> = {};
const stateTotals: Record<string, { em: number; ew: number; vm: number; vw: number }> = {};
for (const d of readdirSync(gdir).filter((x) => /^\d+_/.test(x) && !x.startsWith('1_'))) {
  const f = gdir + d + '/12_-_AC_Wise_Voters_Information.csv';
  if (!existsSync(f)) continue;
  const state = d.replace(/^\d+_/, '');
  const m = (acGender[state] = new Map());
  const t = (stateTotals[state] = { em: 0, ew: 0, vm: 0, vw: 0 });
  for (const r of parseCsv(readFileSync(f, 'utf8'))) {
    const no = Number(r[0]);
    const [em, ew, vm, vw] = [num(r[2]), num(r[3]), num(r[8]), num(r[9])];
    if (!Number.isInteger(no) || no <= 0 || !(em > 0 && ew > 0 && vm > 0)) continue;
    m.set(no, { womenShare: (100 * vw) / (vw + vm), gap: (100 * vw) / ew - (100 * vm) / em, womenRoll: (100 * ew) / (ew + em) });
    t.em += em; t.ew += ew; t.vm += vm; t.vw += vw;
  }
}
const lsTotals: typeof stateTotals = {};
const { elections, ls } = load();
const pairs = buildPairs(elections).filter((p) => p.sameBoundaries && p.target.year >= 1977);
const obsB: Obs[] = [];
for (const p of pairs.filter((q) => q.target.year >= 2023 && acGender[q.target.state])) {
  const coef = fit(pairs.filter((q) => q.target.year < p.target.year), ls, '');
  coef.state.sigma = [coef.state.sigma[0] * SIGMA_K, coef.state.sigma[1] * SIGMA_K];
  const f = forecastSwing(toInput(p.base, p.prior, ls, p.target), coef, NEUTRAL_SLIDERS, 2, 7);
  const L = p.base.largest;
  for (const s of f.seats) {
    const no = Number(s.key);
    const g = acGender[p.target.state].get(no);
    const t = p.target.seats.get(no);
    if (!g || !t || s.expected[L] === undefined) continue;
    const actual = t.shares[L];
    if (actual === undefined) continue;
    obsB.push({ group: `${p.target.state} ${p.target.year}`, y: actual - s.expected[L], x: [g.womenRoll, g.gap] });
  }
}
out.push('## B. Assembly 2023–26: where did the largest party beat the model\'s expectation?', '', 'Outcome: actual minus expected vote share of the party that was largest at the base election.', '');
const b = feOls(obsB, ["Women's share of electors (known beforehand)", 'Women-minus-men turnout gap (known only after)']);
table('Largest party, seat error', b);

// State-level figures for the app's voter-group defaults: the latest assembly report, else
// the 2024 Lok Sabha for states with no assembly report since then
for (const r of summary.filter((x) => x.year === '2024')) {
  const st = r.state_name.trim().replace(/ /g, '_');
  if (acGender[st]) continue;
  const t = (lsTotals[st] ??= { em: 0, ew: 0, vm: 0, vw: 0 });
  t.em += num(r.total_electors_men) || 0;
  t.ew += num(r.total_electors_women) || 0;
  t.vm += num(r.total_voters_men) || 0;
  t.vw += num(r.total_voters_women) || 0;
}
for (const [st, t] of Object.entries(lsTotals)) if (t.em > 0 && !stateTotals[st]) stateTotals[st] = t;
const stateGender = Object.fromEntries(Object.entries(stateTotals).map(([st, t]) => [st, { electors: +((100 * t.ew) / (t.ew + t.em)).toFixed(1), voters: +((100 * t.vw) / (t.vw + t.vm)).toFixed(1), turnoutGap: +((100 * t.vw) / t.ew - (100 * t.vm) / t.em).toFixed(1) }]));
writeFileSync(new URL('../../frontend/src/engine/data/state_gender.json', import.meta.url).pathname, JSON.stringify(stateGender, null, 1) + '\n');
out.push('## State figures shipped to the app', '', '| State | Women % of electors | Women % of voters | Women minus men turnout (pts) |', '|---|---|---|---|', ...Object.entries(stateGender).sort().map(([s, g]) => `| ${s} | ${g.electors} | ${g.voters} | ${g.turnoutGap} |`), '');
writeFileSync(new URL('./results/08_gender.md', import.meta.url).pathname, out.join('\n') + '\n');
console.log(out.join('\n'));
