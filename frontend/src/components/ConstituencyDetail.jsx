import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  Cell,
  ReferenceLine,
} from 'recharts';
import { api } from '../api';
import { partyColor, normalizeParty } from '../constants';
import { useStateSelection } from '../contexts/StateContext';

export default function ConstituencyDetail({ name, onBack }) {
  const { selectedState, electionType } = useStateSelection();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!name) return;
    setLoading(true);
    api
      .constituencySwing(name, selectedState, electionType)
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [name, selectedState, electionType]);

  if (loading)
    return (
      <div className="py-8 space-y-4">
        <div className="animate-pulse bg-neutral-800 rounded h-6 w-48" />
        <div className="animate-pulse bg-neutral-800 rounded-lg h-32" />
        <div className="animate-pulse bg-neutral-800 rounded-lg h-[40vh]" />
      </div>
    );
  if (!data)
    return <div className="text-center py-16 text-neutral-400">Constituency not found.</div>;

  const results = data.results || [];

  // Winner party over time
  const winnerTimeline = results.map((r) => ({
    year: r.year,
    party: normalizeParty(r.winner_party),
    winner: r.winner,
    margin: r.margin_percentage != null ? parseFloat(r.margin_percentage) : null,
    turnout: r.turnout_percentage != null ? parseFloat(r.turnout_percentage) : null,
    runner_up_party: normalizeParty(r.runner_up_party),
    runner_up: r.runner_up,
  }));

  // Margin chart data with positive/negative for incumbent-vs-challenger visualization
  const marginData = results.map((r) => ({
    year: r.year,
    margin: r.margin_percentage != null ? parseFloat(r.margin_percentage) : null,
    party: normalizeParty(r.winner_party),
    winner: r.winner,
  }));

  // Turnout trend
  const turnoutData = results.map((r) => ({
    year: r.year,
    turnout: r.turnout_percentage != null ? parseFloat(r.turnout_percentage) : null,
    enop: r.enop != null ? parseFloat(r.enop) : null,
    candidates: r.n_cand,
  }));

  return (
    <div className="mb-8">
      <button
        className="text-primary-400 text-sm mb-4 hover:underline cursor-pointer"
        onClick={onBack}
      >
        ← Back to list
      </button>

      <div className="mb-4">
        <h2 className="text-lg font-semibold text-white md:text-xl">{data.constituency_name}</h2>
        <div className="flex gap-2 text-xs text-neutral-400 mt-1">
          <span>{data.district_name}</span>
          <span>·</span>
          <span>{data.sub_region}</span>
        </div>
      </div>

      <h3 className="text-base font-semibold text-primary-400 mb-3">Winning Party Timeline</h3>
      <div className="space-y-1 mb-4">
        {winnerTimeline.map((w) => (
          <div key={w.year} className="flex items-center gap-2 text-xs">
            <div className="w-10 text-neutral-400 font-mono">{w.year}</div>
            <div
              className="flex-1 h-6 rounded flex items-center px-2 text-white text-[10px] font-semibold"
              style={{ background: partyColor(w.party) }}
            >
              {w.party}
            </div>
            <div className="w-24 text-neutral-300 truncate hidden md:block">{w.winner}</div>
            <div className="w-10 text-right text-neutral-400">
              {w.margin != null ? `${w.margin.toFixed(1)}%` : '—'}
            </div>
          </div>
        ))}
      </div>

      <h3 className="text-base font-semibold text-primary-400 mt-6 mb-3">Victory Margin Trend</h3>
      <div className="min-h-[200px] h-[40vh] max-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={marginData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="year" stroke="#ccc" />
            <YAxis stroke="#ccc" unit="%" />
            <Tooltip
              contentStyle={{ background: '#1e1e2e', border: '1px solid #444' }}
              formatter={(val, _name, props) => [
                `${val?.toFixed(1)}%`,
                `${props.payload.party} — ${props.payload.winner}`,
              ]}
            />
            <Bar dataKey="margin" name="Margin %">
              {marginData.map((d, i) => (
                <Cell key={i} fill={partyColor(d.party)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <h3 className="text-base font-semibold text-primary-400 mt-6 mb-3">Turnout & Competition</h3>
      <div className="min-h-[200px] h-[40vh] max-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={turnoutData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
            <XAxis dataKey="year" stroke="#ccc" />
            <YAxis yAxisId="left" stroke="#ccc" unit="%" />
            <YAxis yAxisId="right" orientation="right" stroke="#ccc" />
            <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid #444' }} />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="turnout"
              stroke="#61dafb"
              strokeWidth={2}
              name="Turnout %"
              dot={{ r: 4 }}
              connectNulls
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="enop"
              stroke="#ffa500"
              strokeWidth={2}
              name="ENOP"
              dot={{ r: 4 }}
              connectNulls
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="candidates"
              stroke="#888"
              strokeWidth={1}
              strokeDasharray="5 5"
              name="Candidates"
              dot={{ r: 3 }}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <h3 className="text-base font-semibold text-primary-400 mt-6 mb-3">Election Results</h3>
      <div className="overflow-x-auto">
        <table className="const-grid">
          <thead>
            <tr>
              <th>Year</th>
              <th>Winner</th>
              <th>Party</th>
              <th>Votes</th>
              <th>Runner-up</th>
              <th>R-U Party</th>
              <th>Margin</th>
              <th>Turnout</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.year}>
                <td>{r.year}</td>
                <td>{r.winner}</td>
                <td>
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full mr-1.5 align-middle"
                    style={{ background: partyColor(normalizeParty(r.winner_party)) }}
                  />
                  {r.winner_party}
                </td>
                <td>{r.winner_votes?.toLocaleString()}</td>
                <td>{r.runner_up || '—'}</td>
                <td>{r.runner_up_party || '—'}</td>
                <td>
                  {r.margin_percentage != null
                    ? `${parseFloat(r.margin_percentage).toFixed(1)}%`
                    : '—'}
                </td>
                <td>
                  {r.turnout_percentage != null
                    ? `${parseFloat(r.turnout_percentage).toFixed(1)}%`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
