// Step 1: what does our local data cover, and which elections fall due after it?
// Uses only files already on disk. "Due" is computed from the 5-year term alone.
import { readCsv, num } from './csv';

const TODAY = { year: 2026, month: 10 };
const ae = readCsv('../../data/TCPD_AE_All_States_2026-4-30.csv.gz');
const ge = readCsv('../../data/TCPD_GE_All_States_2026-4-30.csv.gz');

const count = (rows: typeof ae, k: string) =>
  rows.reduce<Record<string, number>>((m, r) => ((m[r[k]] = (m[r[k]] || 0) + 1), m), {});
console.log('AE rows', ae.length, 'Election_Type', count(ae, 'Election_Type'));
console.log('AE Poll_No', count(ae, 'Poll_No'));
console.log('GE rows', ge.length, 'Election_Type', count(ge, 'Election_Type'));

function latestGenerals(rows: typeof ae) {
  const by: Record<string, { year: number; month: number; seats: Set<string> }[]> = {};
  for (const r of rows) {
    if (r.Poll_No !== '0' || !/\(AE\)|\(GE\)/.test(r.Election_Type)) continue;
    const s = r.State_Name;
    const y = num(r.Year);
    by[s] ??= [];
    let e = by[s].find((x) => x.year === y);
    if (!e) by[s].push((e = { year: y, month: num(r.month), seats: new Set() }));
    e.seats.add(r.Constituency_No);
  }
  return by;
}

const aeBy = latestGenerals(ae);
const due: string[] = [];
console.log('\nState | last AE general election | seats | next due (5-yr term) | due by Oct 2026?');
for (const s of Object.keys(aeBy).sort()) {
  const els = aeBy[s].sort((a, b) => a.year - b.year);
  const last = els[els.length - 1];
  const dueY = last.year + 5;
  const m = Number.isFinite(last.month) ? last.month : 6;
  const isDue = dueY < TODAY.year || (dueY === TODAY.year && m <= TODAY.month);
  if (isDue) due.push(s);
  console.log(`${s} | ${last.year}-${String(m).padStart(2, '0')} | ${last.seats.size} | ${dueY} | ${isDue ? 'YES' : ''}`);
}
const geBy = latestGenerals(ge);
const geYears = new Set(Object.values(geBy).map((els) => Math.max(...els.map((e) => e.year))));
console.log('\nLok Sabha latest general election year(s) in data:', [...geYears].sort());
console.log('\nAssembly elections due since our data:', due.length, due.join(', '));
