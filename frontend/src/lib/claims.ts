import type { ConstituencySwingRow, StateSwingSummary } from '../types';

export type Verdict = 'true' | 'false' | 'unverifiable';

export interface ClaimResult {
  verdict: Verdict;
  /** One plain sentence saying what the data shows */
  finding: string;
  /** Supporting facts, one per line */
  evidence: string[];
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

const pct = (n: number) => `${n.toFixed(2)}%`;

/** "PARTY won N seats in YEAR" */
export function checkSeatCount(
  summary: StateSwingSummary[],
  party: string,
  year: number,
  claimed: number
): ClaimResult {
  const rows = summary.filter((r) => r.year === year);
  if (rows.length === 0) {
    return { verdict: 'unverifiable', finding: `No results for ${year}.`, evidence: [] };
  }
  const row = rows.find((r) => r.party === party);
  const actual = row?.seats_won ?? 0;
  const total = rows[0].total_seats;
  return {
    verdict: actual === claimed ? 'true' : 'false',
    finding:
      actual === claimed
        ? `Correct: ${party} won ${actual} of ${total} seats in ${year}.`
        : `${party} won ${actual} of ${total} seats in ${year}, not ${claimed}.`,
    evidence: rows
      .slice()
      .sort((a, b) => b.seats_won - a.seats_won)
      .slice(0, 5)
      .map((r) => `${r.party}: ${r.seats_won} seats`),
  };
}

function yearRows(rows: ConstituencySwingRow[], year: number) {
  return rows
    .filter((r) => r.year === year && num(r.margin_percentage) != null)
    .map((r) => ({ ...r, m: num(r.margin_percentage) as number }));
}

/** "CONSTITUENCY had the largest (or smallest) winning margin in the state in YEAR" */
export function checkMarginRecord(
  rows: ConstituencySwingRow[],
  constituency: string,
  year: number,
  kind: 'largest' | 'smallest'
): ClaimResult {
  const ranked = yearRows(rows, year).sort((a, b) => (kind === 'largest' ? b.m - a.m : a.m - b.m));
  const idx = ranked.findIndex((r) => r.constituency_name === constituency);
  if (ranked.length === 0 || idx < 0) {
    return {
      verdict: 'unverifiable',
      finding: `No ${year} margin found for ${constituency}.`,
      evidence: [],
    };
  }
  const top = ranked[0];
  const evidence = ranked
    .slice(0, 5)
    .map((r, i) => `${i + 1}. ${r.constituency_name}: ${pct(r.m)} (${r.winner_party})`);
  if (idx === 0) {
    return {
      verdict: 'true',
      finding: `Correct: ${constituency} had the ${kind} margin in ${year} (${pct(top.m)}).`,
      evidence,
    };
  }
  return {
    verdict: 'false',
    finding: `${constituency} ranked #${idx + 1} of ${ranked.length} with ${pct(ranked[idx].m)}. The ${kind} was ${top.constituency_name} (${pct(top.m)}).`,
    evidence,
  };
}

/** "PARTY has won CONSTITUENCY in every election since YEAR" */
export function checkWinningStreak(
  rows: ConstituencySwingRow[],
  constituency: string,
  party: string,
  sinceYear: number
): ClaimResult {
  const history = rows
    .filter((r) => r.constituency_name === constituency && r.year >= sinceYear)
    .sort((a, b) => a.year - b.year);
  if (history.length === 0) {
    return {
      verdict: 'unverifiable',
      finding: `No results for ${constituency} since ${sinceYear}.`,
      evidence: [],
    };
  }
  const evidence = history.map((r) => `${r.year}: ${r.winner_party} (${r.winner})`);
  const losses = history.filter((r) => r.winner_party !== party);
  if (losses.length === 0) {
    return {
      verdict: 'true',
      finding: `Correct: ${party} won ${constituency} in all ${history.length} elections since ${sinceYear}.`,
      evidence,
    };
  }
  return {
    verdict: 'false',
    finding: `${party} did not win ${constituency} in ${losses.map((r) => r.year).join(', ')}.`,
    evidence,
  };
}

/** "Turnout in YEAR was the highest of any election in the state" (mean of constituency turnouts) */
export function checkTurnoutRecord(rows: ConstituencySwingRow[], year: number): ClaimResult {
  const byYear: Record<number, number[]> = {};
  for (const r of rows) {
    const t = num(r.turnout_percentage);
    if (t == null) continue;
    (byYear[r.year] ||= []).push(t);
  }
  const avgs = Object.entries(byYear)
    .map(([y, ts]) => ({ year: Number(y), avg: ts.reduce((s, t) => s + t, 0) / ts.length }))
    .sort((a, b) => b.avg - a.avg);
  const target = avgs.find((a) => a.year === year);
  if (!target) {
    return { verdict: 'unverifiable', finding: `No turnout data for ${year}.`, evidence: [] };
  }
  const evidence = avgs.map((a) => `${a.year}: ${pct(a.avg)}`);
  const note = 'Average of constituency turnouts, not weighted by electorate size.';
  if (avgs[0].year === year) {
    return {
      verdict: 'true',
      finding: `Correct: ${year} had the highest average turnout (${pct(target.avg)}). ${note}`,
      evidence,
    };
  }
  return {
    verdict: 'false',
    finding: `${year} averaged ${pct(target.avg)}; the highest was ${avgs[0].year} (${pct(avgs[0].avg)}). ${note}`,
    evidence,
  };
}
