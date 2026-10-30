// Fit the final model on every same-boundary election pair up to 2023, write the app's
// coefficients, and freeze forecasts for the 20 assembly elections held Nov 2023 – May 2026.
// Run BEFORE 04_score.ts; PREREGISTRATION-2.md records the hashes.
import { writeFileSync, readFileSync } from 'node:fs';
import { load, buildPairs } from './data';
import { fit, toInput } from './train';
import { forecastSwing, NEUTRAL_SLIDERS } from '../../frontend/src/engine/swingModel';

// Calibration: smallest inflation of the state-level error whose 80% seat ranges cover
// ≥80% of parties on the 2000–2009 backtest (results/02_backtest_calibration.md)
export const SIGMA_K = 1.5;

const { elections, ls } = load();
const pairs = buildPairs(elections).filter((p) => p.sameBoundaries && p.target.year >= 1977);
const coef = fit(pairs, ls, `${pairs.length} same-boundary assembly election pairs, ${pairs[0] ? Math.min(...pairs.map((p) => p.target.year)) : ''}–${Math.max(...pairs.map((p) => p.target.year))} (TCPD dump 2026-04-30)`);
coef.state.sigma = [coef.state.sigma[0] * SIGMA_K, coef.state.sigma[1] * SIGMA_K];
writeFileSync(new URL('../../frontend/src/engine/data/swing_model.json', import.meta.url).pathname, JSON.stringify(coef, null, 2) + '\n');

// The same 20 states and base elections as the first freeze (../backtest/PREREGISTRATION.md)
const first = JSON.parse(readFileSync(new URL('../backtest/predictions/frozen_predictions.json', import.meta.url), 'utf8')).states as Record<string, { baseYear: number }>;
const targetYear: Record<string, number> = {
  Chhattisgarh: 2023, Madhya_Pradesh: 2023, Rajasthan: 2023, Telangana: 2023, Mizoram: 2023,
  Andhra_Pradesh: 2024, Arunachal_Pradesh: 2024, Odisha: 2024, Sikkim: 2024, Haryana: 2024,
  'Jammu_&_Kashmir': 2024, Maharashtra: 2024, Jharkhand: 2024, Delhi: 2025, Bihar: 2025,
  Assam: 2026, Kerala: 2026, Tamil_Nadu: 2026, West_Bengal: 2026, Puducherry: 2026,
};
const out: Record<string, unknown> = {};
for (const [state, { baseYear }] of Object.entries(first)) {
  const i = elections.findIndex((e) => e.state === state && e.year === baseYear);
  const base = elections[i];
  const prior = i > 0 && elections[i - 1].state === state ? elections[i - 1] : null;
  const f = forecastSwing(toInput(base, prior, ls, { year: targetYear[state], month: 12 }), coef, NEUTRAL_SLIDERS, 2000, 7);
  out[state] = {
    baseYear,
    targetYear: targetYear[state],
    lokSabhaSignal: toInput(base, prior, ls, { year: targetYear[state], month: 12 }).lsShare !== null,
    perSeat: Object.fromEntries(f.seats.map((s) => [s.key, { likely: s.likelyWinner, base: base.seats.get(Number(s.key))!.winner, p: s.winProb }])),
    totals: f.parties.filter((p) => p.high > 0).map((p) => ({ party: p.party, mean: +p.mean.toFixed(2), median: p.median, low: p.low, high: p.high, pLargest: p.pLargest })),
    stateSwing: f.stateSwing,
  };
}
writeFileSync('predictions/frozen_swing_2023_26.json', JSON.stringify({ frozenAt: new Date().toISOString(), sigmaK: SIGMA_K, states: out }, null, 1) + '\n');
const rows = Object.entries(out).map(([s, v]) => {
  const t = (v as { totals: { party: string; median: number; low: number; high: number; pLargest: number }[] }).totals.slice(0, 3);
  return `| ${s} | ${t.map((p) => `${p.party} ${p.median} (${p.low}–${p.high}), P(first) ${Math.round(100 * p.pLargest)}%`).join('; ')} |`;
});
writeFileSync('predictions/frozen_swing_totals.md', ['# Frozen swing-model forecasts (median seats, 80% range)', '', '| State | Top three parties |', '|---|---|', ...rows, ''].join('\n'));
console.log(rows.join('\n'));
