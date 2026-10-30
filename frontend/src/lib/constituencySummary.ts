import type { ConstituencyResult } from '../types';

export interface Representative {
  name: string;
  party: string | null;
  years: number[];
}

export interface ConstituencySummaryInfo {
  latest: ConstituencyResult | null;
  previous: ConstituencyResult | null;
  /** True when the latest winner's party also won the previous election */
  partyRetained: boolean | null;
  /** True when the latest winner also won the previous election */
  memberReelected: boolean | null;
  /** Past representatives, most recent first; consecutive terms of the same person are merged */
  representatives: Representative[];
}

function toNumber(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

export function summarizeConstituency(results: ConstituencyResult[]): ConstituencySummaryInfo {
  const sorted = [...results].sort((a, b) => a.year - b.year);
  const latest = sorted.length ? sorted[sorted.length - 1] : null;
  const previous = sorted.length > 1 ? sorted[sorted.length - 2] : null;

  const representatives: Representative[] = [];
  for (const r of [...sorted].reverse()) {
    if (!r.winner) continue;
    const last = representatives[representatives.length - 1];
    if (last && last.name === r.winner && last.party === r.winner_party) {
      last.years.push(r.year);
    } else {
      representatives.push({ name: r.winner, party: r.winner_party, years: [r.year] });
    }
  }
  representatives.forEach((rep) => rep.years.sort((a, b) => a - b));

  return {
    latest,
    previous,
    partyRetained: latest && previous ? latest.winner_party === previous.winner_party : null,
    memberReelected: latest && previous ? latest.winner === previous.winner : null,
    representatives,
  };
}

/** One plain-language sentence describing the latest result. */
export function describeLatestResult(latest: ConstituencyResult | null): string {
  if (!latest || !latest.winner) return 'No result is available for this constituency yet.';
  const party = latest.winner_party ? ` (${latest.winner_party})` : '';
  const margin = toNumber(latest.margin);
  const marginPct = toNumber(latest.margin_percentage);
  let by = '';
  if (margin != null && marginPct != null) {
    by = ` by ${margin.toLocaleString('en-IN')} votes (${marginPct.toFixed(1)}% of votes cast)`;
  } else if (marginPct != null) {
    by = ` by ${marginPct.toFixed(1)}% of votes cast`;
  }
  const over = latest.runner_up
    ? ` over ${latest.runner_up}${latest.runner_up_party ? ` (${latest.runner_up_party})` : ''}`
    : '';
  return `${latest.winner}${party} won in ${latest.year}${by}${over}.`;
}

/** Rough closeness label for a winning margin, in percentage points. */
export function marginLabel(marginPct: number | string | null | undefined): string | null {
  const m = toNumber(marginPct);
  if (m == null) return null;
  if (m < 2) return 'Very close contest';
  if (m < 5) return 'Close contest';
  if (m < 15) return 'Comfortable win';
  return 'Landslide';
}
