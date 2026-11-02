/**
 * Swing model: a two-level forecast learned from Indian assembly elections (TCPD data).
 *
 * 1. State level: each party's change in state-wide vote share, from its size, whether it
 *    was the largest party, its trend over the last two elections and the Lok Sabha result
 *    in between. Coefficients and error sizes are fitted in datascience/swing/02_train.ts.
 * 2. Seat level: the seat's last result plus the party's state swing (partly uniform,
 *    partly proportional), pulled back towards the party's state average, with a term
 *    for the party that holds the seat.
 *
 * Uncertainty is simulated: a shared state-level error per party plus a seat-level error,
 * both sized from past forecast errors, so seat ranges and win chances are calibrated on
 * history rather than guessed. Sliders add to the learned swings; they never replace data.
 */

export interface SwingCoefficients {
  version: number;
  state: { w: number[]; sigma: [number, number] }; // sigma(S) = a + b * S/10, pts
  seat: { w: number[]; sigma: [number, number] }; // sigma(v) = a + b * v/10, pts
  ind: { keep: number; sigma: number }; // independents keep this fraction of their share
  effects: {
    turnout: { perPoint: number; se: number; mean: number };
    electorateGrowth: { perPoint: number; se: number; mean: number };
  };
  trainedOn: string;
}

export interface SeatBase {
  key: string; // stable id (constituency number, else name)
  name: string;
  shares: Record<string, number>; // party -> vote share % at the base election
  winner: string;
  winnerTerms: number;
  margin: number; // pts
}

export interface SwingInput {
  seats: SeatBase[];
  stateShare: Record<string, number>; // base election, %
  priorShare: Record<string, number> | null; // election before the base, %
  lsShare: Record<string, number> | null; // Lok Sabha held after the base election, %
  largest: string; // party with most seats at the base election
  /** Party governing the state going into the election, when known (else `largest` is used) */
  ruling?: string;
}

export interface VoterGroup {
  label: string;
  share: number; // % of voters in the group
  lean: number; // pts swing within the group towards `party` (negative = away)
  party: string;
}

export interface SwingSliders {
  rulingSwing: number; // extra pts for the largest party (anti-incumbency < 0)
  partySwing: Record<string, number>; // extra pts per party
  sittingMla: number; // extra pts for the party holding each seat
  turnoutChange: number; // pts vs the last election, relative to the historical average
  electorateGrowth: number; // % growth in electors, relative to the historical average
  groups: VoterGroup[];
}

export const NEUTRAL_SLIDERS: SwingSliders = {
  rulingSwing: 0,
  partySwing: {},
  sittingMla: 0,
  turnoutChange: 0,
  electorateGrowth: 0,
  groups: [],
};

// ── Features (shared by training and the app) ──────────────────────

const MIN_STATE_SHARE = 1; // parties below 1% state-wide get no state swing term

/** State-level features for one party: [1, S, largest, trend, trendMissing, ls, lsMissing, largest*S]. */
export function stateFeatures(party: string, input: Omit<SwingInput, 'seats'>): number[] {
  const S = input.stateShare[party] || 0;
  const L = party === rulingParty(input) ? 1 : 0;
  const hasPrior = input.priorShare !== null;
  const T = hasPrior ? S - (input.priorShare![party] || 0) : 0;
  const hasLs = input.lsShare !== null;
  const G = hasLs ? clamp((input.lsShare![party] || 0) - S, -30, 30) : 0;
  return [1, S / 10, L, T / 10, hasPrior ? 0 : 1, G / 10, hasLs ? 0 : 1, (L * S) / 10];
}

/** Seat-level features: [dS, dS*(v/S-1), (v-S)/10, holds, holds*(terms>=2), holds*margin/10]. */
export function seatFeatures(
  v: number,
  S: number,
  dS: number,
  holds: boolean,
  terms: number,
  margin: number
): number[] {
  const r = S > 0 ? clamp(v / S, 0, 3) - 1 : 0;
  const h = holds ? 1 : 0;
  return [dS, dS * r, (v - S) / 10, h, h * (terms >= 2 ? 1 : 0), (h * margin) / 10];
}

/** The party treated as the incumbent government: the known ruling party, else the largest. */
export const rulingParty = (input: Pick<SwingInput, 'largest' | 'ruling'>) =>
  input.ruling || input.largest;

export const dot = (w: number[], x: number[]) => x.reduce((s, xi, i) => s + xi * (w[i] || 0), 0);
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

// ── Forecast ───────────────────────────────────────────────────────

export interface SeatForecast {
  key: string;
  name: string;
  expected: Record<string, number>; // mean vote share %
  winProb: Record<string, number>;
  likelyWinner: string;
}

export interface PartyTotals {
  party: string;
  mean: number;
  median: number;
  low: number; // 10th percentile
  high: number; // 90th percentile
  pLargest: number;
  pMajority: number;
  expectedStateShare: number;
}

export interface SwingForecast {
  seats: SeatForecast[];
  parties: PartyTotals[];
  stateSwing: Record<string, number>; // expected change in state share, pts (incl. sliders)
  draws: number;
}

/** Expected state-wide swing per party: learned part plus slider adjustments. */
export function expectedStateSwing(
  input: SwingInput,
  coef: SwingCoefficients,
  sl: SwingSliders
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [p, S] of Object.entries(input.stateShare)) {
    if (p === 'IND' || S < MIN_STATE_SHARE) continue;
    let d = dot(coef.state.w, stateFeatures(p, input));
    if (p === rulingParty(input)) {
      d += sl.rulingSwing;
      d += coef.effects.turnout.perPoint * sl.turnoutChange;
      d += coef.effects.electorateGrowth.perPoint * sl.electorateGrowth;
    }
    d += sl.partySwing[p] || 0;
    for (const g of sl.groups) if (g.party === p) d += (g.share * g.lean) / 100;
    out[p] = Math.max(d, -S); // a party cannot fall below zero
  }
  // Parties only named in sliders (e.g. a group swinging to a party below 1%)
  for (const [p, extra] of Object.entries(sl.partySwing)) if (!(p in out) && extra) out[p] = extra;
  return out;
}

/** Monte Carlo forecast for one state. Deterministic for a given seed. */
export function forecastSwing(
  input: SwingInput,
  coef: SwingCoefficients,
  sliders: SwingSliders = NEUTRAL_SLIDERS,
  draws = 400,
  seed = 1
): SwingForecast {
  const rand = gaussian(seed);
  const dS = expectedStateSwing(input, coef, sliders);
  const parties = Object.keys(dS);
  const nSeats = input.seats.length;
  const majority = Math.floor(nSeats / 2) + 1;

  // Per seat: the expected share of every party, before noise
  const seatMeans = input.seats.map((s) => {
    const m: Record<string, number> = {};
    for (const [p, v] of Object.entries(s.shares)) {
      if (p === 'IND') m[p] = v * coef.ind.keep;
      else {
        const S = input.stateShare[p] || 0;
        const d = dS[p] ?? 0;
        const holds = p === s.winner;
        m[p] =
          v +
          dot(coef.seat.w, seatFeatures(v, S, d, holds, s.winnerTerms, s.margin)) +
          (holds ? sliders.sittingMla : 0);
      }
    }
    // Parties pushed in by sliders that did not contest the seat last time get their swing here
    for (const p of parties) if (!(p in m) && dS[p] > 0) m[p] = dS[p];
    return m;
  });

  const wins = input.seats.map(() => ({}) as Record<string, number>);
  const totals: Record<string, number[]> = {};
  const largestCount: Record<string, number> = {};
  const majorityCount: Record<string, number> = {};
  const sigmaState = (p: string) =>
    coef.state.sigma[0] + (coef.state.sigma[1] * (input.stateShare[p] || 0)) / 10;

  for (let d = 0; d < draws; d++) {
    const shock: Record<string, number> = {};
    for (const p of parties) shock[p] = rand() * sigmaState(p);
    const seatsWon: Record<string, number> = {};
    for (let i = 0; i < nSeats; i++) {
      const s = input.seats[i];
      let best = '';
      let bestV = -Infinity;
      for (const [p, mu] of Object.entries(seatMeans[i])) {
        const v0 = s.shares[p] || 0;
        const S = input.stateShare[p] || 0;
        // State shock spreads like the swing: partly uniform, partly proportional
        const sh = shock[p]
          ? shock[p] * (coef.seat.w[0] + coef.seat.w[1] * (S > 0 ? clamp(v0 / S, 0, 3) - 1 : 0))
          : 0;
        const sd =
          p === 'IND'
            ? coef.ind.sigma
            : coef.seat.sigma[0] + (coef.seat.sigma[1] * Math.max(mu, 0)) / 10;
        const v = mu + sh + rand() * sd;
        if (v > bestV) {
          bestV = v;
          best = p;
        }
      }
      wins[i][best] = (wins[i][best] || 0) + 1;
      seatsWon[best] = (seatsWon[best] || 0) + 1;
    }
    for (const p of new Set([...parties, ...Object.keys(seatsWon)]))
      (totals[p] ??= []).push(seatsWon[p] || 0);
    const top = Object.entries(seatsWon).sort((a, b) => b[1] - a[1])[0];
    if (top) largestCount[top[0]] = (largestCount[top[0]] || 0) + 1;
    for (const [p, n] of Object.entries(seatsWon))
      if (n >= majority) majorityCount[p] = (majorityCount[p] || 0) + 1;
  }

  const seats: SeatForecast[] = input.seats.map((s, i) => {
    const winProb: Record<string, number> = {};
    for (const [p, n] of Object.entries(wins[i])) winProb[p] = n / draws;
    const expected = normalise(seatMeans[i]);
    const likelyWinner = Object.entries(winProb).sort((a, b) => b[1] - a[1])[0]?.[0] ?? s.winner;
    return { key: s.key, name: s.name, expected, winProb, likelyWinner };
  });

  const partyTotals: PartyTotals[] = Object.entries(totals)
    .map(([party, xs]) => {
      // Pad parties that only appeared in some draws
      const all = xs.length < draws ? [...Array(draws - xs.length).fill(0), ...xs] : xs;
      const sorted = [...all].sort((a, b) => a - b);
      const q = (f: number) => sorted[Math.min(draws - 1, Math.floor(f * draws))];
      return {
        party,
        mean: all.reduce((a, b) => a + b, 0) / draws,
        median: q(0.5),
        low: q(0.1),
        high: q(0.9),
        pLargest: (largestCount[party] || 0) / draws,
        pMajority: (majorityCount[party] || 0) / draws,
        expectedStateShare: Math.max(0, (input.stateShare[party] || 0) + (dS[party] || 0)),
      };
    })
    .filter((p) => p.high > 0)
    .sort((a, b) => b.mean - a.mean);

  return { seats, parties: partyTotals, stateSwing: dS, draws };
}

function normalise(m: Record<string, number>): Record<string, number> {
  const pos = Object.entries(m).map(([p, v]) => [p, Math.max(0, v)] as const);
  const tot = pos.reduce((s, [, v]) => s + v, 0) || 1;
  return Object.fromEntries(pos.map(([p, v]) => [p, (100 * v) / tot]));
}

/** Seeded standard-normal generator (mulberry32 + Box–Muller). */
export function gaussian(seed: number): () => number {
  let a = seed >>> 0;
  const uni = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const s = spare;
      spare = null;
      return s;
    }
    const u = uni() || 1e-12;
    const v = uni();
    const r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v);
    return r * Math.cos(2 * Math.PI * v);
  };
}
