import type { ConstituencySwingRow } from '../types';

export interface MarginalSeat {
  name: string;
  district: string | null;
  winner: string | null;
  winnerParty: string | null;
  runnerUpParty: string | null;
  margin: number;
}

export const MARGIN_BINS: { label: string; min: number; max: number }[] = [
  { label: '<2%', min: 0, max: 2 },
  { label: '2–5%', min: 2, max: 5 },
  { label: '5–10%', min: 5, max: 10 },
  { label: '10–15%', min: 10, max: 15 },
  { label: '15–20%', min: 15, max: 20 },
  { label: '20%+', min: 20, max: Infinity },
];

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Seats from one election year with a known margin, tightest first. */
export function seatsForYear(rows: ConstituencySwingRow[], year: number): MarginalSeat[] {
  return rows
    .filter((r) => r.year === year && r.constituency_name && num(r.margin_percentage) != null)
    .map((r) => ({
      name: r.constituency_name as string,
      district: r.district_name,
      winner: r.winner,
      winnerParty: r.winner_party,
      runnerUpParty: r.runner_up_party,
      margin: num(r.margin_percentage) as number,
    }))
    .sort((a, b) => a.margin - b.margin);
}

export function marginHistogram(seats: MarginalSeat[]): { label: string; seats: number }[] {
  return MARGIN_BINS.map((b) => ({
    label: b.label,
    seats: seats.filter((s) => s.margin >= b.min && s.margin < b.max).length,
  }));
}

/** Count of marginal seats held by each party, largest first. */
export function marginalByParty(
  seats: MarginalSeat[],
  threshold: number
): { party: string; held: number; secondIn: number }[] {
  const held: Record<string, number> = {};
  const second: Record<string, number> = {};
  for (const s of seats) {
    if (s.margin >= threshold) continue;
    if (s.winnerParty) held[s.winnerParty] = (held[s.winnerParty] || 0) + 1;
    if (s.runnerUpParty) second[s.runnerUpParty] = (second[s.runnerUpParty] || 0) + 1;
  }
  const parties = new Set([...Object.keys(held), ...Object.keys(second)]);
  return [...parties]
    .map((party) => ({ party, held: held[party] || 0, secondIn: second[party] || 0 }))
    .sort((a, b) => b.held + b.secondIn - (a.held + a.secondIn));
}
