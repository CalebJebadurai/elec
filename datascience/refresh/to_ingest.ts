// Write the converted ECI rows in the full column layout api/ingest.py expects.
// Outputs (gitignored): raw/ingest_ae_2023_26.csv, raw/ingest_ge_2024.csv
import { writeFileSync } from 'node:fs';
import { readCsv } from '../backtest/csv';

const COLUMNS = ['state_name', 'assembly_no', 'constituency_no', 'year', 'month', 'delim_id', 'poll_no', 'position', 'candidate', 'sex', 'party', 'votes', 'age', 'candidate_type', 'valid_votes', 'electors', 'constituency_name', 'constituency_type', 'district_name', 'sub_region', 'n_cand', 'turnout_percentage', 'vote_share_percentage', 'deposit_lost', 'margin', 'margin_percentage', 'enop', 'pid', 'party_type_tcpd', 'party_id', 'last_poll', 'contested', 'last_party', 'last_party_id', 'last_constituency_name', 'same_constituency', 'same_party', 'no_terms', 'turncoat', 'incumbent', 'recontest', 'myneta_education', 'tcpd_prof_main', 'tcpd_prof_main_desc', 'tcpd_prof_second', 'tcpd_prof_second_desc', 'election_type'];
const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
// Lok Sabha constituencies were redrawn in Assam (2023) and Jammu & Kashmir (2022)
const GE_DELIM: Record<string, string> = { Assam: '5', 'Jammu_&_Kashmir': '5' };

function convert(src: string, dest: string, ge: boolean) {
  const rows = readCsv(new URL(src, import.meta.url).pathname);
  const out = [COLUMNS.join(',')];
  // Namesakes standing in the same seat are real, but the DB's unique index includes the
  // candidate name, so the second and later ones get a " [n]" suffix
  const seen = new Map<string, number>();
  for (const r of rows) {
    const k = `${r.State_Name}|${r.Year}|${r.Constituency_No}|${r.Candidate.toUpperCase()}`;
    const n = (seen.get(k) || 0) + 1;
    seen.set(k, n);
    if (n > 1) r.Candidate = `${r.Candidate} [${n}]`;
    const lower = Object.fromEntries(Object.entries(r).map(([k, v]) => [k.toLowerCase(), v]));
    if (ge) {
      lower.delim_id = GE_DELIM[r.State_Name] ?? '4';
      const valid = Number(r.Valid_Votes);
      lower.vote_share_percentage = valid ? ((100 * Number(r.Votes)) / valid).toFixed(2) : '';
    } else lower.delim_id = r.DelimID;
    out.push(COLUMNS.map((c) => q(lower[c] ?? '')).join(','));
  }
  writeFileSync(new URL(dest, import.meta.url).pathname, out.join('\n') + '\n');
  console.log(dest, rows.length);
}
convert('./raw/ae_2023_26_tcpd.csv', './raw/ingest_ae_2023_26.csv', false);
convert('./raw/ge_2024_tcpd.csv', './raw/ingest_ge_2024.csv', true);
