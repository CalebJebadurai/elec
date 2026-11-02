// Refit the app's coefficients on every same-boundary election pair in the data, including
// the 2023–26 elections from ECI reports (datascience/refresh). Same model design and the
// same error inflation as the frozen v1 (predictions/swing_model_v1_frozen.json).
import { writeFileSync } from 'node:fs';
import { load, buildPairs } from './data';
import { fit } from './train';
import { SIGMA_K } from './03_freeze_constants';

const { elections, ls } = load();
const pairs = buildPairs(elections).filter((p) => p.sameBoundaries && p.target.year >= 1977);
const years = pairs.map((p) => p.target.year);
const coef = fit(pairs, ls, `${pairs.length} same-boundary assembly election pairs, ${Math.min(...years)}–${Math.max(...years)} (TCPD 2026-04-30 + ECI statistical reports 2023–26, Lok Sabha to 2024)`);
coef.version = 2;
coef.state.sigma = [coef.state.sigma[0] * SIGMA_K, coef.state.sigma[1] * SIGMA_K];
writeFileSync(new URL('../../frontend/src/engine/data/swing_model.json', import.meta.url).pathname, JSON.stringify(coef, null, 2) + '\n');
console.log(JSON.stringify({ pairs: pairs.length, state: coef.state.w.map((x) => +x.toFixed(2)), seat: coef.seat.w.map((x) => +x.toFixed(2)), effects: coef.effects }, null, 0));
