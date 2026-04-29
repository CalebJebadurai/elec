import { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
} from 'recharts';
import { api } from '../api';
import { partyColor } from '../constants';
import { useStateSelection } from '../contexts/StateContext';

export default function StateComparison({ stateData, electionType, onElectionTypeChange }) {
  const { states } = useStateSelection();
  const [stateA, setStateA] = useState('Tamil_Nadu');
  const [stateB, setStateB] = useState('Kerala');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!stateA || !stateB || stateA === stateB) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .nationalCompare(stateA, stateB, electionType)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [stateA, stateB, electionType]);

  const stateList = useMemo(() => {
    if (states?.length) return states;
    return (
      stateData?.map((s) => ({ state_name: s.state_name, display_name: s.display_name })) || []
    );
  }, [states, stateData]);

  // Merge turnout trends for dual-line chart
  const turnoutChart = useMemo(() => {
    if (!data) return [];
    const map = {};
    data.state_a?.turnout_trend?.forEach((t) => {
      map[t.year] = { year: t.year, a: t.avg_turnout };
    });
    data.state_b?.turnout_trend?.forEach((t) => {
      if (!map[t.year]) map[t.year] = { year: t.year };
      map[t.year].b = t.avg_turnout;
    });
    return Object.values(map).sort((x, y) => x.year - y.year);
  }, [data]);

  return (
    <div className="mb-8">
      <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-end">
        <div>
          <label className="block text-xs text-neutral-400 mb-1">State A</label>
          <select
            value={stateA}
            onChange={(e) => setStateA(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-md px-3 py-2 text-sm cursor-pointer"
          >
            {stateList.map((s) => (
              <option key={s.state_name} value={s.state_name}>
                {s.display_name || s.state_name.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-400 mb-1">State B</label>
          <select
            value={stateB}
            onChange={(e) => setStateB(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-md px-3 py-2 text-sm cursor-pointer"
          >
            {stateList.map((s) => (
              <option key={s.state_name} value={s.state_name}>
                {s.display_name || s.state_name.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-neutral-400 mb-1">Election Type</label>
          <select
            value={electionType}
            onChange={(e) => onElectionTypeChange(e.target.value)}
            className="bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-md px-3 py-2 text-sm cursor-pointer"
          >
            <option value="AE">Assembly (AE)</option>
            <option value="GE">Lok Sabha (GE)</option>
          </select>
        </div>
      </div>

      {stateA === stateB && (
        <p className="text-neutral-400 text-sm">Select two different states to compare.</p>
      )}

      {loading && (
        <div className="py-8 space-y-4">
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className="animate-pulse bg-neutral-800 rounded h-4" />
            ))}
          </div>
          <div className="animate-pulse bg-neutral-800 rounded-lg h-[40vh]" />
        </div>
      )}
      {error && <div className="text-center py-4 text-error">{error}</div>}

      {data && !loading && (
        <>
          {/* Key Stats side-by-side */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: 'Constituencies', key: 'total_constituencies' },
              { label: 'Latest Year', key: 'year_max' },
              { label: 'Avg Turnout', key: 'avg_turnout', suffix: '%' },
              { label: 'Election Years', key: 'total_years' },
            ].map(({ label, key, suffix = '' }) => (
              <div className="contents" key={key}>
                <span className="text-right text-sm text-primary-300 font-mono">
                  {data.state_a?.[key] != null ? `${data.state_a[key]}${suffix}` : '—'}
                </span>
                <span className="text-center text-xs text-neutral-400 self-center">{label}</span>
                <span className="text-left text-sm text-primary-300 font-mono">
                  {data.state_b?.[key] != null ? `${data.state_b[key]}${suffix}` : '—'}
                </span>
              </div>
            ))}
          </div>

          {/* Turnout Trend Chart */}
          {turnoutChart.length > 0 && (
            <div className="mb-6">
              <h3 className="text-base font-semibold text-primary-400 mb-3">
                Turnout Trend Comparison
              </h3>
              <div className="min-h-[200px] h-[40vh] max-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={turnoutChart}>
                    <XAxis dataKey="year" />
                    <YAxis domain={[0, 100]} unit="%" />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="a"
                      name={data.state_a?.display_name}
                      stroke="#e63946"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="b"
                      name={data.state_b?.display_name}
                      stroke="#457b9d"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Top Parties Comparison */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <h4 className="text-sm font-semibold text-white mb-2">
                {data.state_a?.display_name} — Top Parties
              </h4>
              {data.state_a?.top_parties?.map((p) => (
                <div key={p.party} className="flex items-center gap-2 mb-1 text-xs">
                  <span className="w-16 text-neutral-300 truncate">{p.party}</span>
                  <span className="flex-1 h-4 bg-neutral-800 rounded overflow-hidden">
                    <span
                      className="block h-full rounded"
                      style={{
                        width: `${(p.seats_won / (data.state_a.total_constituencies || 1)) * 100}%`,
                        background: partyColor(p.party),
                      }}
                    />
                  </span>
                  <span className="w-8 text-right text-neutral-300">{p.seats_won}</span>
                </div>
              ))}
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-2">
                {data.state_b?.display_name} — Top Parties
              </h4>
              {data.state_b?.top_parties?.map((p) => (
                <div key={p.party} className="flex items-center gap-2 mb-1 text-xs">
                  <span className="w-16 text-neutral-300 truncate">{p.party}</span>
                  <span className="flex-1 h-4 bg-neutral-800 rounded overflow-hidden">
                    <span
                      className="block h-full rounded"
                      style={{
                        width: `${(p.seats_won / (data.state_b.total_constituencies || 1)) * 100}%`,
                        background: partyColor(p.party),
                      }}
                    />
                  </span>
                  <span className="w-8 text-right text-neutral-300">{p.seats_won}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
