// Convert ECI's 2024 Lok Sabha reports into (a) TCPD-format GE rows, for state-wide shares,
// and (b) party votes per assembly segment, for a seat-level Lok Sabha signal.
// Outputs (gitignored): raw/ge_2024_tcpd.csv, raw/ls2024_segments.csv
import { readFileSync, writeFileSync } from 'node:fs';
import { CODE_MAP, parseCsv } from './build_ae';

const DIR = new URL('./raw/eci/1_LS_2024/', import.meta.url).pathname;
export const stateName = (s: string) =>
  ({ 'Jammu and Kashmir': 'Jammu_&_Kashmir', 'NCT OF Delhi': 'Delhi', 'Andaman & Nicobar Islands': 'Andaman_&_Nicobar_Islands' })[s.trim()] ??
  s.trim().replace(/ /g, '_');
const code = (p: string) => (p.trim() === 'NOTA' ? 'NOTA' : CODE_MAP[p.trim()] ?? p.trim());
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

// PC numbers come from the segment report (the detailed result lists names only)
const d34 = parseCsv(readFileSync(DIR + '34.Details_of_Assembly_Segment_of_PC.csv', 'utf8'));
const pcNumber = new Map<string, number>();
for (const r of d34) if (r.length >= 12 && /^\d+$/.test(r[1])) pcNumber.set(`${stateName(r[0])}|${r[2].trim().toLowerCase()}`, Number(r[1]));

// (a) Constituency-wise detailed result: one row per candidate
const d33 = parseCsv(readFileSync(DIR + '33.Constituency_Wise_Detailed_Result.csv', 'utf8'));
const pcs = new Map<string, { state: string; pc: string; rows: { cand: string; party: string; votes: number; electors: number }[] }>();
for (const r of d33) {
  if (r.length < 17 || !/^\d+$/.test(r[12])) continue;
  const k = `${r[0]}|${r[1]}`;
  let p = pcs.get(k);
  if (!p) pcs.set(k, (p = { state: stateName(r[0]), pc: r[1].trim(), rows: [] }));
  p.rows.push({ cand: r[2], party: code(r[6]), votes: Number(r[12]), electors: Number(r[16]) || 0 });
}
const ge = ['State_Name,Year,month,Poll_No,Position,Candidate,Party,Votes,Valid_Votes,Electors,Constituency_Name,Constituency_No,Election_Type'];
for (const p of pcs.values()) {
  const pcNo = pcNumber.get(`${p.state}|${p.pc.toLowerCase().replace(/\s*\((sc|st)\)$/, '')}`) ?? pcNumber.get(`${p.state}|${p.pc.toLowerCase()}`);
  if (pcNo === undefined) throw new Error(`No PC number for ${p.state} ${p.pc}`);
  p.rows.sort((a, b) => b.votes - a.votes);
  const valid = p.rows.reduce((s, x) => s + x.votes, 0);
  p.rows.forEach((x, i) => ge.push([p.state, 2024, 5, 0, i + 1, q(x.cand), q(x.party), x.votes, valid, x.electors, q(p.pc), pcNo, 'Lok Sabha Election (GE)'].join(',')));
}
writeFileSync(DIR + '../../ge_2024_tcpd.csv', ge.join('\n') + '\n');

// (b) Assembly segments: EVM votes per party per AC (postal votes are not split by segment)
const seg = ['State_Name,AC_No,AC_Name,Party,Votes'];
const acc = new Map<string, number>();
const names = new Map<string, string>();
for (const r of d34) {
  if (r.length < 12 || !/^\d+$/.test(r[4]) || !/^\d+(\.\d+)?$/.test(r[11])) continue;
  const k = `${stateName(r[0])}|${r[4]}|${code(r[10])}`;
  acc.set(k, (acc.get(k) || 0) + Number(r[11]));
  names.set(`${stateName(r[0])}|${r[4]}`, r[5].trim());
  // NOTA is a separate column in this report
  const nk = `${stateName(r[0])}|${r[4]}|NOTA`;
  if (!acc.has(nk)) acc.set(nk, Number(r[8]) || 0);
}
for (const [k, v] of acc) {
  const [st, ac, party] = k.split('|');
  seg.push([st, ac, q(names.get(`${st}|${ac}`) ?? ''), q(party), v].join(','));
}
writeFileSync(DIR + '../../ls2024_segments.csv', seg.join('\n') + '\n');
console.log(`GE 2024: ${pcs.size} PCs, ${ge.length - 1} rows; segments: ${names.size} ACs`);
