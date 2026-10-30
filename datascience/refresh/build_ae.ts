// Convert ECI "10 - Detailed Results" (2023–26 assembly elections) into TCPD-format rows and
// validate them. Output: raw/ae_2023_26_tcpd.csv (gitignored) + results/01_ae_validation.md.
// Run after fetch_eci_reports.py and xlsx2csv.py.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { readCsv, num } from '../backtest/csv';
import { normalizeParty } from '../../frontend/src/constants';
import { mapParty } from '../backtest/party_map';

const RAW = new URL('./raw/eci/', import.meta.url).pathname;
const TCPD = new URL('../../data/TCPD_AE_All_States_2026-4-30.csv.gz', import.meta.url).pathname;
// Counting month per category folder (ECI result declaration)
const MONTH: Record<string, [number, number]> = {
  Andhra_Pradesh: [2024, 6], Arunachal_Pradesh: [2024, 6], Odisha: [2024, 6], Sikkim: [2024, 6],
  Haryana: [2024, 10], 'Jammu_&_Kashmir': [2024, 10], Maharashtra: [2024, 11], Jharkhand: [2024, 11],
  Delhi: [2025, 2], Bihar: [2025, 11], Assam: [2026, 5], Kerala: [2026, 5], Puducherry: [2026, 5],
  Tamil_Nadu: [2026, 5], West_Bengal: [2026, 5], Mizoram: [2023, 12], Madhya_Pradesh: [2023, 12],
  Rajasthan: [2023, 12], Telangana: [2023, 12],
};
/**
 * ECI abbreviation -> TCPD code where the two differ for the same registered party (legal
 * identity, as in ../backtest/AMENDMENT-1.md). Factions and new parties keep ECI's code.
 */
export const CODE_MAP: Record<string, string> = {
  BHRS: 'TRS', // Bharat Rashtra Samithi, renamed from Telangana Rashtra Samithi
  'CPI(M)': 'CPM',
  RLTP: 'RaLtP', // Rashtriya Loktantrik Party
  ASMJTYP: 'AJP', // Assam Jatiya Parishad
  TTPty: 'Twenty 20 Party',
  JKPDFS: 'JKPDF', // Jammu and Kashmir Peoples Democratic Front (Secular)
  AMMKMNKZ: 'AMMK', // Amma Makkal Munnettra Kazagam
};

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { f += '"'; i++; } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f.replace(/\r$/, '')); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}

interface Cand { no: number; name: string; type: string; cand: string; sex: string; party: string; votes: number; electors: number }

if (import.meta.main) main();

function main() {
const tcpd = readCsv(TCPD);
const tcpdCodes: Record<string, Set<string>> = {};
const baseByState: Record<string, { year: number; delim: string; names: Record<number, string>; winners: Record<number, { name: string; terms: number }> }> = {};

/** Dice similarity of character bigrams after stripping case, brackets and punctuation. */
function similarity(a: string, b: string): number {
  const norm = (x: string) => x.toUpperCase().replace(/\(.*?\)/g, '').replace(/[^A-Z]/g, '');
  const bg = (x: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < x.length - 1; i++) m.set(x.slice(i, i + 2), (m.get(x.slice(i, i + 2)) || 0) + 1);
    return m;
  };
  const [x, y] = [bg(norm(a)), bg(norm(b))];
  let inter = 0;
  for (const [k, v] of x) inter += Math.min(v, y.get(k) || 0);
  const tot = [...x.values(), ...y.values()].reduce((t, v) => t + v, 0);
  return tot ? (2 * inter) / tot : 0;
}
const latestYear: Record<string, number> = {};
for (const r of tcpd) {
  if (r.Poll_No !== '0') continue;
  (tcpdCodes[r.State_Name] ??= new Set()).add(r.Party);
  latestYear[r.State_Name] = Math.max(latestYear[r.State_Name] || 0, num(r.Year));
}
// Base election per state (latest in TCPD): seat names, DelimID, winners and their terms
for (const r of tcpd) {
  if (r.Poll_No !== '0' || num(r.Year) !== latestYear[r.State_Name]) continue;
  const b = (baseByState[r.State_Name] ??= { year: num(r.Year), delim: r.DelimID, names: {}, winners: {} });
  b.names[num(r.Constituency_No)] = r.Constituency_Name;
  if (r.Position === '1') b.winners[num(r.Constituency_No)] = { name: r.Candidate, terms: num(r.No_Terms) || 1 };
}

const out: string[] = [
  'State_Name,Year,month,DelimID,Poll_No,Position,Candidate,Sex,Party,Votes,Valid_Votes,Electors,Constituency_Name,Constituency_No,Constituency_Type,Turnout_Percentage,Vote_Share_Percentage,Margin,Margin_Percentage,No_Terms,N_Cand,ENOP,Election_Type',
];
const report: string[] = ['# 2023–26 assembly data from ECI statistical reports: validation', '', '| State | Year | Seats | Candidates | Share sum (min–max) | Winners agree with counting-day pages | Same boundaries as base | Re-elected MLAs (name match) | Party codes ≥1% new to state |', '|---|---|---|---|---|---|---|---|---|'];
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const disagreements: string[] = [];

// Counting-day winners from the earlier, independent conversion (Internet Archive)
const cd = existsSync(new URL('../backtest/new_data_raw/eci_converted_AE.csv', import.meta.url).pathname)
  ? readCsv(new URL('../backtest/new_data_raw/eci_converted_AE.csv', import.meta.url).pathname).filter((r) => r.Position === '1')
  : [];

for (const dir of readdirSync(RAW).filter((d) => /^\d+_/.test(d) && !d.startsWith('1_'))) {
  const state = dir.replace(/^\d+_/, '');
  const file = readdirSync(RAW + dir).find((f) => /Detailed_Results\.csv$/.test(f));
  if (!file) continue;
  const rows = parseCsv(readFileSync(RAW + dir + '/' + file, 'utf8'));
  const hi = rows.findIndex((r) => r[0]?.toUpperCase().startsWith('STATE'));
  const h = rows[hi].map((x) => x.toUpperCase());
  const col = (re: RegExp) => h.findIndex((x) => re.test(x));
  const [cNo, cName, cCand, cSex, cCat, cParty, cTotal, cElect] = [col(/^AC NO/), col(/^AC NAME/), col(/^CANDIDATE/), col(/^(SEX|GENDER)$/), col(/^CATEGORY/), col(/^PARTY$/), col(/^TOTAL$/), col(/^TOTAL ELECTORS$/)];
  const seats = new Map<number, Cand[]>();
  for (const r of rows.slice(hi + 1)) {
    const no = num(r[cNo]);
    if (!Number.isFinite(no) || !r[cParty]) continue;
    const name = r[cName].replace(/\s*\((SC|ST)\)\s*$/i, '').trim();
    const type = /\(SC\)/i.test(r[cName]) ? 'SC' : /\(ST\)/i.test(r[cName]) ? 'ST' : 'GEN';
    const party = r[cParty].trim() === 'NOTA' ? 'NOTA' : CODE_MAP[r[cParty].trim()] ?? r[cParty].trim();
    const c: Cand = { no, name, type, cand: r[cCand].replace(/^\d+\s+/, ''), sex: (r[cSex] || '').slice(0, 1), party, votes: num(r[cTotal]) || 0, electors: num(r[cElect]) || 0 };
    let s = seats.get(no);
    if (!s) seats.set(no, (s = []));
    s.push(c);
  }
  // Seat category: older formats mark it only in some files; fall back to TCPD's latest type for that seat number
  const [year, month] = MONTH[state];
  // Same boundaries as the base election when ≥90% of seat names match by number
  // (AMENDMENT-1 rule 4). Seats won unopposed may be absent here, and a seat whose poll was
  // postponed may be absent from TCPD's base (Ramgarh 2018, Patkura 2019), so at most one
  // seat number may be missing from the base
  const base = baseByState[state];
  const similar = [...seats].filter(([no, cs]) => base?.names[no] && similarity(base.names[no], cs[0].name) >= 0.5).length;
  const missing = base ? [...seats.keys()].filter((no) => !base.names[no]).length : seats.size;
  const sameBounds = !!base && missing <= 1 && similar >= 0.9 * seats.size;
  // A redrawn state gets the next DelimID (TCPD numbers delimitations; the DB column is an integer)
  const delim = sameBounds ? base.delim : String((num(base?.delim) || 4) + 1);
  const sums: number[] = [];
  const stateVotes: Record<string, number> = {};
  let stateValid = 0, agree = 0, compared = 0, candidates = 0, reelected = 0;
  const cdState = new Map(cd.filter((r) => r.State_Name === state).map((r) => [num(r.Constituency_No), r.Party]));
  for (const [no, cs] of seats) {
    cs.sort((a, b) => b.votes - a.votes);
    const valid = cs.reduce((s, c) => s + c.votes, 0);
    const real = cs.filter((c) => c.party !== 'NOTA');
    const nCand = real.length;
    const enop = 1 / real.reduce((t, c) => t + (c.votes / valid) ** 2, 0);
    const electors = cs[0].electors;
    stateValid += valid;
    sums.push(cs.reduce((s, c) => s + (100 * c.votes) / valid, 0));
    const winner = cs.find((c) => c.party !== 'NOTA')!;
    const runner = cs.filter((c) => c.party !== 'NOTA')[1];
    if (cdState.has(no)) {
      // Counting-day labels are TCPD codes or, for unmapped parties, ECI full names
      compared++;
      const a = normalizeParty(cdState.get(no));
      const b = normalizeParty(winner.party);
      if (a === b) agree++;
      else disagreements.push(`${state} ${no}: counting-day ${a} / report ${b}`);
    }
    // Sitting MLA's terms: TCPD's No_Terms is not in ECI reports, so a winner whose name
    // matches the base winner of the same seat continues that count; anyone else starts at 1
    const prev = sameBounds ? base.winners[no] : undefined;
    const terms = prev && similarity(prev.name, winner.cand) >= 0.7 ? prev.terms + 1 : 1;
    if (terms > 1) reelected++;
    cs.forEach((c, i) => {
      candidates++;
      stateVotes[c.party] = (stateVotes[c.party] || 0) + c.votes;
      const margin = i === 0 && runner ? winner.votes - runner.votes : '';
      out.push([state, year, month, delim, 0, i + 1, q(c.cand), c.sex, q(c.party), c.votes, valid, electors, q(c.name), no, c.type, electors ? ((100 * valid) / electors).toFixed(2) : '', ((100 * c.votes) / valid).toFixed(2), margin, i === 0 && runner ? ((100 * (winner.votes - runner.votes)) / valid).toFixed(2) : '', i === 0 ? terms : '', nCand, enop.toFixed(2), 'State Assembly Election (AE)'].join(','));
    });
  }
  const newCodes = Object.entries(stateVotes)
    .filter(([p, v]) => (100 * v) / stateValid >= 1 && p !== 'NOTA' && p !== 'IND' && !tcpdCodes[state]?.has(p))
    .map(([p, v]) => `${p} ${((100 * v) / stateValid).toFixed(1)}%`);
  report.push(`| ${state} | ${year} | ${seats.size} | ${candidates} | ${Math.min(...sums).toFixed(2)}–${Math.max(...sums).toFixed(2)} | ${compared ? `${agree} / ${compared}` : 'n/a'} | ${sameBounds ? `yes (${base.year}, ${similar}/${seats.size} names)` : `no (${similar}/${seats.size} names)`} | ${reelected} | ${newCodes.join(', ') || '–'} |`);
}
mkdirSync(new URL('./results', import.meta.url).pathname, { recursive: true });
report.push('', '## Winner disagreements with counting-day pages', '', ...disagreements.map((d) => `- ${d}`));
writeFileSync(RAW + '../ae_2023_26_tcpd.csv', out.join('\n') + '\n');
writeFileSync(new URL('./results/01_ae_validation.md', import.meta.url).pathname, report.join('\n') + '\n');
console.log(report.join('\n'));
void baseByState;
void mapParty;
}
