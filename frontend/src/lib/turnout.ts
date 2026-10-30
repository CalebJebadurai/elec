import type { ConstituencyResult, ConstituencySwingRow } from '../types';

export interface TurnoutPoint {
  year: number;
  here: number | null;
  stateAvg: number | null;
}

function num(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

/** Mean of constituency turnouts per year (not weighted by electorate size). */
export function stateTurnoutByYear(rows: ConstituencySwingRow[]): Record<number, number> {
  const acc: Record<number, { sum: number; n: number }> = {};
  for (const r of rows) {
    const t = num(r.turnout_percentage);
    if (t == null) continue;
    acc[r.year] ||= { sum: 0, n: 0 };
    acc[r.year].sum += t;
    acc[r.year].n += 1;
  }
  return Object.fromEntries(Object.entries(acc).map(([y, a]) => [y, a.sum / a.n]));
}

export function compareTurnout(
  results: ConstituencyResult[],
  stateAvg: Record<number, number>
): TurnoutPoint[] {
  return [...results]
    .sort((a, b) => a.year - b.year)
    .map((r) => ({
      year: r.year,
      here: num(r.turnout_percentage),
      stateAvg: stateAvg[r.year] ?? null,
    }));
}

/** Plain sentence for the latest year with both figures. */
export function describeTurnout(points: TurnoutPoint[]): string | null {
  const latest = [...points].reverse().find((p) => p.here != null && p.stateAvg != null);
  if (!latest || latest.here == null || latest.stateAvg == null) return null;
  const diff = latest.here - latest.stateAvg;
  const rel =
    Math.abs(diff) < 0.5
      ? 'about the same as'
      : `${Math.abs(diff).toFixed(1)} points ${diff > 0 ? 'above' : 'below'}`;
  const first = points.find((p) => p.here != null);
  const trend =
    first && first.year !== latest.year && first.here != null
      ? ` Since ${first.year} it has ${latest.here >= first.here ? 'risen' : 'fallen'} from ${first.here.toFixed(1)}%.`
      : '';
  return `In ${latest.year}, ${latest.here.toFixed(1)}% of electors here voted, ${rel} the state average of ${latest.stateAvg.toFixed(1)}%.${trend}`;
}
