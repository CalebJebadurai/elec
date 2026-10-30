// Step 3: freeze predictions for every assembly election that fell due after
// our local data, from local data only, before any new data is downloaded.
import { readFileSync, writeFileSync } from 'node:fs';
import { readCsv, num, type Row } from './csv';
import { generalYears, engineInput, engineForecast, rulingPartyOutForecast, normalizeParty } from './model';

// From 01_inventory.ts: due by Oct 2026 on a 5-year term (old state names excluded)
const DUE = [
  'Andhra_Pradesh', 'Arunachal_Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Delhi', 'Haryana',
  'Jammu_&_Kashmir', 'Jharkhand', 'Kerala', 'Madhya_Pradesh', 'Maharashtra', 'Mizoram', 'Odisha',
  'Puducherry', 'Rajasthan', 'Sikkim', 'Tamil_Nadu', 'Telangana', 'West_Bengal',
];
const M3 = JSON.parse(readFileSync('results/m3_setting.json', 'utf8')).antiIncumbencyPct as number;

const ae = readCsv('../../data/TCPD_AE_All_States_2026-4-30.csv.gz');
const out: Record<string, unknown> = {
  frozenAt: new Date().toISOString(),
  source: 'data/TCPD_AE_All_States_2026-4-30.csv.gz (local only)',
  engine: 'frontend/src/engine/predictionEngine.ts at git ab6679c, factor sliders 0, turnout 75%, growth 1',
  models: {
    M0: 'persistence: engine at 0% anti-incumbency',
    M1: 'app engine, shipped default 10% anti-incumbency (PRIMARY)',
    M2: 'largest party loses every seat it holds to that seat runner-up',
    M3: `app engine at ${M3}% anti-incumbency, chosen on historical pairs before freezing`,
  },
  states: {} as Record<string, unknown>,
};
for (const state of DUE) {
  const years = generalYears(ae, state);
  const base = years[years.length - 1];
  const rows = ae.filter((r: Row) => r.State_Name === state && num(r.Year) === base);
  const input = engineInput(rows);
  const delim = rows.find((r) => r.Poll_No === '0')?.DelimID ?? '';
  const m0 = engineForecast(input, state, 0);
  const m1 = engineForecast(input, state, 10);
  const m3 = engineForecast(input, state, M3);
  const m2 = rulingPartyOutForecast(input);
  const parties = [...new Set(rows.filter((r) => r.Poll_No === '0').map((r) => normalizeParty(r.Party)))].sort();
  (out.states as Record<string, unknown>)[state] = {
    baseYear: base,
    baseDelimID: delim,
    seats: input.length,
    partiesInBase: parties,
    totals: { M0: m0.totals, M1: m1.totals, M2: m2.totals, M3: m3.totals },
    M1range: { low: m1.rangeLow, high: m1.rangeHigh },
    perSeat: Object.fromEntries(
      m0.seats.map((s, i) => [s.seat, { M0: s.predicted, M1: m1.seats[i].predicted, M2: m2.seats.find((x) => x.seat === s.seat)?.predicted, M3: m3.seats[i].predicted }])
    ),
  };
}
writeFileSync('predictions/frozen_predictions.json', JSON.stringify(out, null, 1) + '\n');

// Human-readable seat totals
const lines = ['# Frozen predictions: seat totals (top parties)', '', '| State | Base year | Seats | M1 app default (10%) | M0 persistence |', '|---|---|---|---|---|'];
const top = (t: Record<string, number>) => Object.entries(t).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([p, n]) => `${p} ${n}`).join(', ');
for (const [s, v] of Object.entries(out.states as Record<string, { baseYear: number; seats: number; totals: Record<string, Record<string, number>> }>))
  lines.push(`| ${s} | ${v.baseYear} | ${v.seats} | ${top(v.totals.M1)} | ${top(v.totals.M0)} |`);
writeFileSync('predictions/frozen_totals.md', lines.join('\n') + '\n');
console.log(lines.join('\n'));
