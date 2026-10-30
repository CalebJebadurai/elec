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
import { stateTurnoutByYear, compareTurnout, describeTurnout } from '../lib/turnout';
import Term from './Term';
import type { ConstituencyResult, ConstituencySwingRow } from '../types';

interface Props {
  results: ConstituencyResult[];
  state: string;
  electionType: string;
}

/** This constituency's turnout over time against the state average. */
export default function TurnoutComparison({ results, state, electionType }: Props) {
  const key = `${state}:${electionType}`;
  const [loaded, setLoaded] = useState<{ key: string; rows: ConstituencySwingRow[] } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .allConstituencySwings(state, electionType)
      .catch(() => [] as ConstituencySwingRow[])
      .then((rows) => {
        if (!cancelled) setLoaded({ key, rows });
      });
    return () => {
      cancelled = true;
    };
  }, [state, electionType, key]);

  const points = useMemo(() => {
    if (loaded?.key !== key) return [];
    return compareTurnout(results, stateTurnoutByYear(loaded.rows)).map((p) => ({
      ...p,
      here: p.here != null ? +p.here.toFixed(1) : null,
      stateAvg: p.stateAvg != null ? +p.stateAvg.toFixed(1) : null,
    }));
  }, [loaded, key, results]);
  const sentence = describeTurnout(points);

  if (!sentence) return null;

  return (
    <section aria-labelledby="turnout-compare-heading">
      <h3
        id="turnout-compare-heading"
        className="text-base font-semibold text-primary-400 mt-6 mb-2"
      >
        <Term id="turnout">Turnout</Term> compared with the state
      </h3>
      <p className="text-sm text-neutral-200 mb-3">{sentence}</p>
      <div className="min-h-[200px] h-[35vh] max-h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="year" stroke="#ccc" />
            <YAxis stroke="#ccc" unit="%" domain={['auto', 'auto']} />
            <Tooltip
              contentStyle={{ background: '#1e1e2e', border: '1px solid #444' }}
              formatter={(v) => (v == null ? '—' : `${v}%`)}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="here"
              name="This constituency"
              stroke="#56b4e9"
              strokeWidth={2}
              dot={{ r: 4 }}
              connectNulls
            />
            <Line
              type="monotone"
              dataKey="stateAvg"
              name="State average"
              stroke="#e69f00"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-neutral-500 mt-1">
        State average is the mean turnout across constituencies, not weighted by electorate size.
      </p>
    </section>
  );
}
