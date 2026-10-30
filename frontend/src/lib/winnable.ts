import type { ConstituencySwingRow } from '../types';

export interface WinnableSeat {
  name: string;
  district: string | null;
  /** Party that beat the chosen party in the latest election */
  heldBy: string | null;
  /** Gap to the winner in the latest election, % of votes cast */
  gap: number;
  /** Earlier years the chosen party won this seat */
  wonBefore: number[];
  /** Times the seat changed party across all elections in the data */
  changesOfHands: number;
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Seats where `party` came second in `year`, ranked by how close it got.
 * Ties on the gap are broken by past wins, then by how often the seat changes hands.
 */
export function findWinnableSeats(
  rows: ConstituencySwingRow[],
  party: string,
  year: number
): WinnableSeat[] {
  const byName = new Map<string, ConstituencySwingRow[]>();
  for (const r of rows) {
    if (!r.constituency_name) continue;
    const list = byName.get(r.constituency_name) ?? [];
    list.push(r);
    byName.set(r.constituency_name, list);
  }

  const seats: WinnableSeat[] = [];
  for (const [name, history] of byName) {
    history.sort((a, b) => a.year - b.year);
    const latest = history.find((r) => r.year === year);
    const gap = num(latest?.margin_percentage);
    if (!latest || latest.runner_up_party !== party || gap == null) continue;
    let changes = 0;
    for (let i = 1; i < history.length; i++) {
      if (history[i].winner_party !== history[i - 1].winner_party) changes++;
    }
    seats.push({
      name,
      district: latest.district_name,
      heldBy: latest.winner_party,
      gap,
      wonBefore: history
        .filter((r) => r.year < year && r.winner_party === party)
        .map((r) => r.year),
      changesOfHands: changes,
    });
  }

  return seats.sort(
    (a, b) =>
      a.gap - b.gap ||
      b.wonBefore.length - a.wonBefore.length ||
      b.changesOfHands - a.changesOfHands
  );
}

/** Parties that finished second somewhere in `year`, most second places first. */
export function runnerUpParties(rows: ConstituencySwingRow[], year: number): string[] {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    if (r.year === year && r.runner_up_party) {
      counts[r.runner_up_party] = (counts[r.runner_up_party] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p);
}
