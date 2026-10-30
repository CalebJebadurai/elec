// How often do parties that did not exist at the last election matter? Base rates for the
// app's new-party warning (step 2c). A "new label" is a party code (not IND) absent from the
// base election's state results; renamed or split parties count, because the model cannot
// see them either.
import { writeFileSync } from 'node:fs';
import { load, buildPairs } from './data';

const { elections } = load();
const pairs = buildPairs(elections).filter((p) => p.target.year >= 1977);
const rows = pairs.map((p) => {
  const fresh = Object.entries(p.target.stateShare).filter(([party]) => party !== 'IND' && party !== 'NOTA' && !(party in p.base.stateShare));
  const share = fresh.reduce((s, [, v]) => s + v, 0);
  const top = fresh.sort((a, b) => b[1] - a[1])[0];
  const seats = Object.entries(p.target.seatsWon).filter(([party]) => party !== 'IND' && !(party in p.base.stateShare)).reduce((s, [, n]) => s + n, 0);
  return { label: `${p.target.state} ${p.target.year}`, year: p.target.year, share, top: top ? `${top[0]} ${top[1].toFixed(1)}%` : '', seatShare: seats / p.target.seats.size };
});
const frac = (f: (r: (typeof rows)[number]) => boolean, rs = rows) => rs.filter(f).length / rs.length;
const recent = rows.filter((r) => r.year >= 2000);
const pct = (x: number) => `${Math.round(100 * x)}%`;
const out = [
  '# New parties: base rates (all assembly elections 1977–2026 in the data)',
  '',
  '| | All years | Since 2000 |',
  '|---|---|---|',
  `| Elections | ${rows.length} | ${recent.length} |`,
  `| New parties together took ≥10% of the vote | ${pct(frac((r) => r.share >= 10))} | ${pct(frac((r) => r.share >= 10, recent))} |`,
  `| … ≥20% | ${pct(frac((r) => r.share >= 20))} | ${pct(frac((r) => r.share >= 20, recent))} |`,
  `| New parties won ≥10% of seats | ${pct(frac((r) => r.seatShare >= 0.1))} | ${pct(frac((r) => r.seatShare >= 0.1, recent))} |`,
  `| A new party came first in seats | – | ${recent.filter((r) => r.seatShare >= 0.5).length} elections with a majority for new labels |`,
  '',
  '## Largest new-party shares since 2000',
  '',
  ...recent.sort((a, b) => b.share - a.share).slice(0, 15).map((r) => `- ${r.label}: new labels ${r.share.toFixed(1)}% of votes, ${pct(r.seatShare)} of seats (top: ${r.top})`),
];
writeFileSync(new URL('./results/06_new_parties.md', import.meta.url).pathname, out.join('\n') + '\n');
console.log(out.join('\n'));
console.log(JSON.stringify({ since2000: { elections: recent.length, share10: frac((r) => r.share >= 10, recent), seats10: frac((r) => r.seatShare >= 0.1, recent) } }));
