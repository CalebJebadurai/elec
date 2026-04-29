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
    <div className="state-comparison">
      <div className="national-controls">
        <div className="control-group">
          <label>State A</label>
          <select value={stateA} onChange={(e) => setStateA(e.target.value)}>
            {stateList.map((s) => (
              <option key={s.state_name} value={s.state_name}>
                {s.display_name || s.state_name.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="control-group">
          <label>State B</label>
          <select value={stateB} onChange={(e) => setStateB(e.target.value)}>
            {stateList.map((s) => (
              <option key={s.state_name} value={s.state_name}>
                {s.display_name || s.state_name.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>
        <div className="control-group">
          <label>Election Type</label>
          <select value={electionType} onChange={(e) => onElectionTypeChange(e.target.value)}>
            <option value="AE">Assembly (AE)</option>
            <option value="GE">Lok Sabha (GE)</option>
          </select>
        </div>
      </div>

      {stateA === stateB && <p className="muted">Select two different states to compare.</p>}

      {loading && <div className="loading-spinner">Loading comparison…</div>}
      {error && <div className="error-message">{error}</div>}

      {data && !loading && (
        <>
          {/* Key Stats side-by-side */}
          <div className="compare-stats">
            {[
              { label: 'Constituencies', key: 'total_constituencies' },
              { label: 'Latest Year', key: 'year_max' },
              { label: 'Avg Turnout', key: 'avg_turnout', suffix: '%' },
              { label: 'Election Years', key: 'total_years' },
            ].map(({ label, key, suffix = '' }) => (
              <div className="compare-row" key={key}>
                <span className="compare-val-a">
                  {data.state_a?.[key] != null ? `${data.state_a[key]}${suffix}` : '—'}
                </span>
                <span className="compare-label">{label}</span>
                <span className="compare-val-b">
                  {data.state_b?.[key] != null ? `${data.state_b[key]}${suffix}` : '—'}
                </span>
              </div>
            ))}
          </div>

          {/* Turnout Trend Chart */}
          {turnoutChart.length > 0 && (
            <div className="chart-section">
              <h3>Turnout Trend Comparison</h3>
              <ResponsiveContainer width="100%" height={300}>
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
          )}

          {/* Top Parties Comparison */}
          <div className="compare-parties">
            <div className="compare-col">
              <h4>{data.state_a?.display_name} — Top Parties</h4>
              {data.state_a?.top_parties?.map((p) => (
                <div key={p.party} className="party-bar-row">
                  <span className="party-name">{p.party}</span>
                  <span className="party-bar">
                    <span
                      style={{
                        width: `${(p.seats_won / (data.state_a.total_constituencies || 1)) * 100}%`,
                        background: partyColor(p.party),
                      }}
                    />
                  </span>
                  <span className="party-seats">{p.seats_won}</span>
                </div>
              ))}
            </div>
            <div className="compare-col">
              <h4>{data.state_b?.display_name} — Top Parties</h4>
              {data.state_b?.top_parties?.map((p) => (
                <div key={p.party} className="party-bar-row">
                  <span className="party-name">{p.party}</span>
                  <span className="party-bar">
                    <span
                      style={{
                        width: `${(p.seats_won / (data.state_b.total_constituencies || 1)) * 100}%`,
                        background: partyColor(p.party),
                      }}
                    />
                  </span>
                  <span className="party-seats">{p.seats_won}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
