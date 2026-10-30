// Fitting the swing model (frontend/src/engine/swingModel.ts) on election pairs.
import { lokSabhaBetween, type LokSabha, type Pair, type StateElection } from './data';
import {
  stateFeatures,
  seatFeatures,
  dot,
  type SwingCoefficients,
  type SwingInput,
} from '../../frontend/src/engine/swingModel';

/** Model input for forecasting `target` from `base` (only what was known before polling day). */
export function toInput(base: StateElection, prior: StateElection | null, ls: LokSabha, target: { year: number; month: number }): SwingInput {
  return {
    seats: [...base.seats.values()].map((s) => ({
      key: String(s.no),
      name: s.name,
      shares: s.shares,
      winner: s.winner,
      winnerTerms: s.winnerTerms,
      margin: s.margin,
    })),
    stateShare: base.stateShare,
    priorShare: prior ? prior.stateShare : null,
    lsShare: lokSabhaBetween(ls, base.state, base, target),
    largest: base.largest,
  };
}

/** Weighted ridge regression (intercept-free design; the caller adds a constant column). */
export function ridge(X: number[][], y: number[], w: number[], lambda = 1): { beta: number[]; se: number[] } {
  const k = X[0].length;
  const A = Array.from({ length: k }, () => new Array(k).fill(0));
  const b = new Array(k).fill(0);
  for (let i = 0; i < X.length; i++)
    for (let j = 0; j < k; j++) {
      b[j] += w[i] * X[i][j] * y[i];
      for (let l = 0; l < k; l++) A[j][l] += w[i] * X[i][j] * X[i][l];
    }
  for (let j = 1; j < k; j++) A[j][j] += lambda; // never shrink the first column
  const inv = invert(A);
  const beta = inv.map((row) => row.reduce((s, a, j) => s + a * b[j], 0));
  let rss = 0;
  let wsum = 0;
  for (let i = 0; i < X.length; i++) {
    rss += w[i] * (y[i] - dot(beta, X[i])) ** 2;
    wsum += w[i];
  }
  // Effective-n correction for weights
  const sigma2 = rss / Math.max(1, wsum - k);
  return { beta, se: inv.map((row, j) => Math.sqrt(Math.max(0, row[j] * sigma2))) };
}

function invert(M: number[][]): number[][] {
  const n = M.length;
  const A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c] || 1e-12;
    for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = A[r][c];
      if (f) for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map((r) => r.slice(n));
}

/** Fit sigma(x) = a + b*x/10 to absolute residuals (mean |e| = sigma*sqrt(2/pi) for a normal). */
function fitSigma(xs: number[], absRes: number[]): [number, number] {
  const k = Math.sqrt(Math.PI / 2);
  const { beta } = ridge(xs.map((x) => [1, x / 10]), absRes.map((r) => r * k), xs.map(() => 1), 0);
  return [Math.max(0.5, beta[0]), Math.max(0, beta[1])];
}

export function fit(pairs: Pair[], ls: LokSabha, trainedOn: string): SwingCoefficients {
  // ── Stage A: state-wide swing per party ──
  const XA: number[][] = [], yA: number[] = [], wA: number[] = [], sA: number[] = [];
  const largestRows: { res: number; dT: number; growth: number }[] = [];
  for (const p of pairs) {
    const input = toInput(p.base, p.prior, ls, p.target);
    for (const [party, S] of Object.entries(p.base.stateShare)) {
      if (party === 'IND' || S < 1) continue;
      XA.push(stateFeatures(party, input));
      yA.push((p.target.stateShare[party] || 0) - S);
      wA.push(Math.min(S, 30) / 10);
      sA.push(S);
    }
  }
  const A = ridge(XA, yA, wA, 1);
  const resA = XA.map((x, i) => yA[i] - dot(A.beta, x));
  const sigmaA = fitSigma(sA, resA.map(Math.abs));

  // After-the-fact effects on the largest party (for sliders only; never in the default forecast)
  for (const p of pairs) {
    const input = toInput(p.base, p.prior, ls, p.target);
    const L = p.base.largest;
    const S = p.base.stateShare[L] || 0;
    const res = (p.target.stateShare[L] || 0) - S - dot(A.beta, stateFeatures(L, input));
    largestRows.push({
      res,
      dT: p.target.turnout - p.base.turnout,
      growth: p.base.electors ? (100 * (p.target.electors - p.base.electors)) / p.base.electors : 0,
    });
  }
  const effect = (f: (r: (typeof largestRows)[number]) => number) => {
    const m = largestRows.reduce((s, r) => s + f(r), 0) / largestRows.length;
    const { beta, se } = ridge(largestRows.map((r) => [1, f(r) - m]), largestRows.map((r) => r.res), largestRows.map(() => 1), 0);
    return { perPoint: beta[1], se: se[1], mean: m };
  };

  // ── Stage B: seat level, given the actual state swing ──
  const XB: number[][] = [], yB: number[] = [], vB: number[] = [];
  let indXY = 0, indXX = 0;
  const indRes: [number, number][] = [];
  for (const p of pairs) {
    for (const [no, s] of p.base.seats) {
      const t = p.target.seats.get(no);
      if (!t) continue;
      for (const [party, v] of Object.entries(s.shares)) {
        if (party === 'IND') {
          const vt = t.shares.IND || 0;
          indXY += v * vt;
          indXX += v * v;
          indRes.push([v, vt]);
          continue;
        }
        if (t.shares[party] === undefined) continue; // did not contest again (alliance seat swaps)
        const S = p.base.stateShare[party] || 0;
        const dS = (p.target.stateShare[party] || 0) - S;
        XB.push(seatFeatures(v, S, dS, party === s.winner, s.winnerTerms, s.margin));
        yB.push(t.shares[party] - v);
        vB.push(v);
      }
    }
  }
  const B = ridge(XB, yB, XB.map(() => 1), 1);
  const resB = XB.map((x, i) => Math.abs(yB[i] - dot(B.beta, x)));
  const sigmaB = fitSigma(vB.map((v, i) => Math.max(0, v + dot(B.beta, XB[i]))), resB);
  const keep = indXX ? indXY / indXX : 0;
  const indSigma = Math.sqrt(indRes.reduce((s, [v, vt]) => s + (vt - keep * v) ** 2, 0) / Math.max(1, indRes.length));

  return {
    version: 1,
    state: { w: A.beta, sigma: sigmaA },
    seat: { w: B.beta, sigma: sigmaB },
    ind: { keep, sigma: indSigma },
    effects: {
      turnout: effect((r) => r.dT),
      electorateGrowth: effect((r) => r.growth),
    },
    trainedOn,
  };
}
