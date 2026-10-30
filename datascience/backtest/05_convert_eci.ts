// Step 5: convert archived ECI state-wise result pages into a TCPD-format CSV that the
// unchanged 04_score.ts can read. Rules: AMENDMENT-1.md.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { readCsv, num } from './csv';
import { mapParty as mapPartyBase } from './party_map';

// AMENDMENT-1 rule 3 additions, made after parsing: ECI names that are the same registered
// party as a TCPD code contesting the same state's base election (spelling differences only).
// Each code was checked to appear in that state's base-year TCPD data.
export const ADDITIONS: Record<string, string> = {
  'Congress (Secular)': 'C(S)', // Kerala
  'Indian National League': 'INL', // Kerala
  'Gondvana Gantantra Party': 'GGP', // Chhattisgarh
  'Haryana Lokhit Party': 'HaLP', // Haryana
  'Jammu And Kashmir Peoples Democratic Front (Secular)': 'JKPDF', // Jammu & Kashmir
  'Jammu & Kashmir People Conference': 'JPC', // Jammu & Kashmir
  'Rashtriya Loktantrik Party': 'RaLtP', // Rajasthan
  "People's Party of Arunachal": 'PPA', // Arunachal Pradesh
  'Vanchit Bahujan Aaghadi': 'VBA', // Maharashtra
  'Rashtriya Samaj Paksha': 'RSPS', // Maharashtra
  'Jan Surajya Shakti': 'JSS', // Maharashtra
  'Prahar Janshakti Party': 'PHJSP', // Maharashtra
};
function mapParty(name: string) {
  const b = mapPartyBase(name);
  if (b.mapped) return b;
  const a = ADDITIONS[name.trim()];
  return a ? { code: a, mapped: true } : b;
}

const ECI_STATE: Record<string, string> = {
  S01: 'Andhra_Pradesh', S02: 'Arunachal_Pradesh', S03: 'Assam', S04: 'Bihar', S26: 'Chhattisgarh',
  U05: 'Delhi', S07: 'Haryana', U08: 'Jammu_&_Kashmir', S27: 'Jharkhand', S11: 'Kerala',
  S12: 'Madhya_Pradesh', S13: 'Maharashtra', S16: 'Mizoram', S18: 'Odisha', U07: 'Puducherry',
  S20: 'Rajasthan', S21: 'Sikkim', S22: 'Tamil_Nadu', S29: 'Telangana', S25: 'West_Bengal',
};
const DIR = 'new_data_raw/eci/pages';

interface Seat {
  no: number;
  name: string;
  party: string;
  runnerUpParty: string;
  declared: boolean;
}

// ── Parse one archived state-wise page ──────────────────────────────
const text = (html: string) =>
  html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export function parsePage(html: string): Seat[] {
  const seats: Seat[] = [];
  // Party cells nest a small table plus a tooltip table: drop the tooltip, then collapse
  // each remaining nested table to its text so only the outer table is left
  const flat = html
    .replace(/<div class='tooltip'>[\s\S]*?<\/div>/g, '')
    .replace(/<span class='tooltip-icon'[^>]*>i<\/span>/g, '')
    .replace(/<td[^>]*>\s*<table>([\s\S]*?)<\/table>\s*<\/td>/g, (_, inner) => `<td>${text(inner)}</td>`);
  const body = flat.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] ?? '';
  for (const tr of body.split(/<tr[^>]*>/i).slice(1)) {
    const cells = tr.split(/<\/td>/i).map(text).filter((c) => c !== '');
    if (cells.length < 8) continue;
    // Constituency | Const. No. | Leading Candidate | Leading Party | Trailing Candidate | Trailing Party | Margin | Round | Status
    const [name, no, , lead, , trail] = cells;
    const status = cells[cells.length - 1];
    seats.push({
      no: num(no),
      name,
      party: lead,
      runnerUpParty: trail,
      declared: /declared/i.test(status),
    });
  }
  return seats;
}

// ── Seat-name similarity for the boundary check (character bigrams, Dice) ─
const norm = (s: string) => s.toUpperCase().replace(/\(.*?\)/g, '').replace(/[^A-Z]/g, '');
function similarity(a: string, b: string) {
  const bg = (s: string) => {
    const m = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) || 0) + 1);
    return m;
  };
  const [x, y] = [bg(norm(a)), bg(norm(b))];
  let inter = 0;
  for (const [k, v] of x) inter += Math.min(v, y.get(k) || 0);
  const tot = [...x.values(), ...y.values()].reduce((s, v) => s + v, 0);
  return tot ? (2 * inter) / tot : 0;
}

// ── Base election seat names from local TCPD (same base years as the freeze) ─
const frozen = JSON.parse(readFileSync('predictions/frozen_predictions.json', 'utf8')).states as Record<
  string,
  { baseYear: number; baseDelimID: string; seats: number }
>;
const ae = readCsv('../../data/TCPD_AE_All_States_2026-4-30.csv.gz');
const baseNames: Record<string, Record<number, string>> = {};
for (const r of ae) {
  const f = frozen[r.State_Name];
  if (!f || num(r.Year) !== f.baseYear || r.Poll_No !== '0' || num(r.Position) !== 1) continue;
  (baseNames[r.State_Name] ??= {})[num(r.Constituency_No)] = r.Constituency_Name;
}

// ── Convert ─────────────────────────────────────────────────────────
const files = readdirSync(DIR).filter((f) => f.endsWith('.htm'));
const byState: Record<string, { year: number; seats: Map<number, Seat>; snapshots: string[] }> = {};
for (const f of files) {
  const m = f.match(/^(\w+?)_statewise([SU]\d{2})(\d+)_(\d{14})\.htm$/);
  if (!m) continue;
  const [, folder, code, , ts] = m;
  const state = ECI_STATE[code];
  const year = Number(folder.match(/(\d{4})$/)![1]);
  const s = (byState[state] ??= { year, seats: new Map(), snapshots: [] });
  s.snapshots.push(ts);
  // Some archived bodies are stored gzip-compressed
  let buf: Uint8Array = readFileSync(`${DIR}/${f}`);
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = Bun.gunzipSync(buf);
  for (const seat of parsePage(new TextDecoder('utf-8').decode(buf))) s.seats.set(seat.no, seat);
}

const header =
  'State_Name,Year,Poll_No,Position,Party,Constituency_Name,Constituency_No,DelimID,Election_Type';
const out = [header];
const unmapped = new Set<string>();
const report: string[] = ['| State | Year | Seats on ECI pages | Declared | Base seats | Name similarity ≥ 0.5 | Seat-level? | Latest snapshot |', '|---|---|---|---|---|---|---|---|'];
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
for (const [state, s] of Object.entries(byState).sort()) {
  const f = frozen[state];
  const base = baseNames[state] ?? {};
  const declared = [...s.seats.values()].filter((x) => x.declared);
  const similar = [...s.seats.values()].filter((x) => base[x.no] && similarity(base[x.no], x.name) >= 0.5).length;
  const seatLevel = s.seats.size === f.seats && similar >= 0.9 * s.seats.size;
  const delim = seatLevel ? f.baseDelimID : `ECI-${s.year}`;
  report.push(`| ${state} | ${s.year} | ${s.seats.size} | ${declared.length} | ${f.seats} | ${similar} | ${seatLevel ? 'yes' : 'no (totals only)'} | ${s.snapshots.sort().at(-1)} |`);
  for (const seat of declared) {
    const name = (seatLevel && base[seat.no]) || seat.name;
    for (const [pos, party] of [[1, seat.party], [2, seat.runnerUpParty]] as const) {
      const p = mapParty(party);
      if (!p.mapped) unmapped.add(party);
      out.push([state, s.year, 0, pos, q(p.code), q(name), seat.no, delim, 'State Assembly Election (AE)'].join(','));
    }
  }
}
writeFileSync('new_data_raw/eci_converted_AE.csv', out.join('\n') + '\n');
writeFileSync(
  'results/05_conversion.md',
  ['# ECI conversion report (AMENDMENT-1.md)', '', ...report, '', '## Rule 3 additions (same registered party, spelling only)', '', ...Object.entries(ADDITIONS).map(([k, v]) => `- ${k} → ${v}`), '', '## ECI party names with no TCPD code (kept as is)', '', ...[...unmapped].sort().map((u) => `- ${u}`), ''].join('\n')
);
console.log(report.join('\n'));
console.log(`\nUnmapped party names: ${unmapped.size}`);
