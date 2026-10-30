import { useEffect, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { api } from '../api';
import type { GenderYear } from '../types';

interface Props {
  state: string;
  electionType: string;
}

const share = (n: number, d: number) => (d > 0 ? +((n / d) * 100).toFixed(1) : null);

/** Women candidates and winners as a share of all, per general election. */
export default function WomenRepresentation({ state, electionType }: Props) {
  const key = `${state}:${electionType}`;
  const [loaded, setLoaded] = useState<{ key: string; rows: GenderYear[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .gender(state, electionType)
      .catch(() => [] as GenderYear[])
      .then((rows) => {
        if (!cancelled) setLoaded({ key, rows });
      });
    return () => {
      cancelled = true;
    };
  }, [state, electionType, key]);

  const rows = useMemo(() => (loaded?.key === key ? loaded.rows : []), [loaded, key]);
  const chart = useMemo(
    () =>
      rows.map((r) => ({
        year: r.year,
        candidates: share(r.female_candidates, r.candidates),
        winners: share(r.female_winners, r.winners),
      })),
    [rows]
  );

  if (rows.length === 0) return null;
  const latest = rows[rows.length - 1];
  const unknown = rows.reduce((s, r) => s + r.unknown_sex, 0);

  return (
    <section aria-labelledby="women-rep-heading" className="mt-8">
      <h3 id="women-rep-heading" className="text-base font-semibold text-primary-400 mb-1">
        Women&apos;s representation
      </h3>
      <p className="text-xs text-neutral-400 mb-3">
        In {latest.year}, {latest.female_winners} of {latest.winners} winners (
        {share(latest.female_winners, latest.winners)}%) and {latest.female_candidates} of{' '}
        {latest.candidates} candidates ({share(latest.female_candidates, latest.candidates)}%) were
        women.
      </p>
      <div className="h-[260px] mb-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="year" stroke="#ccc" tick={{ fontSize: 12 }} />
            <YAxis stroke="#ccc" unit="%" tick={{ fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: '#1e1e2e', border: '1px solid #444' }}
              formatter={(v) => (v == null ? '—' : `${v}%`)}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="candidates"
              name="Women among candidates"
              stroke="#e69f00"
              strokeWidth={2}
              dot={{ r: 3 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="winners"
              name="Women among winners"
              stroke="#56b4e9"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="const-grid">
          <thead>
            <tr>
              <th scope="col">Year</th>
              <th scope="col">Women candidates</th>
              <th scope="col">Women winners</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.year}>
                <td>{r.year}</td>
                <td>
                  {r.female_candidates} / {r.candidates} ({share(r.female_candidates, r.candidates)}
                  %)
                </td>
                <td>
                  {r.female_winners} / {r.winners} ({share(r.female_winners, r.winners)}%)
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {unknown > 0 && (
        <p className="text-xs text-neutral-500 mt-2">
          {unknown} candidate records have no sex recorded in the source data and are counted as not
          women.
        </p>
      )}
    </section>
  );
}
