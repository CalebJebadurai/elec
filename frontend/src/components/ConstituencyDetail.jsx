import { useState, useEffect, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Cell, ReferenceLine,
} from 'recharts';
import { api } from '../api';
import { partyColor, normalizeParty } from '../constants';

export default function ConstituencyDetail({ name, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!name) return;
    setLoading(true);
    api.constituencySwing(name).then((d) => {
      setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [name]);

  if (loading) return <div className="loading">Loading {name}…</div>;
  if (!data) return <div className="loading">Constituency not found.</div>;

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
    <div className="panel">
      <button className="back-btn" onClick={onBack}>← Back to list</button>

      <div className="const-header">
        <h2>{data.constituency_name}</h2>
        <div className="meta">
          <span>{data.district_name}</span>
          <span>{data.sub_region}</span>
        </div>
      </div>

      <h3>Winning Party Timeline</h3>
      <div className="timeline">
        {winnerTimeline.map((w) => (
          <div key={w.year} className="timeline-item">
            <div className="tl-year">{w.year}</div>
            <div className="tl-bar" style={{ background: partyColor(w.party) }}>
              <span className="tl-party">{w.party}</span>
            </div>
            <div className="tl-name">{w.winner}</div>
            <div className="tl-margin">{w.margin != null ? `${w.margin.toFixed(1)}%` : '—'}</div>
          </div>
        ))}
      </div>

      <h3>Victory Margin Trend</h3>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={marginData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="year" stroke="#ccc" />
          <YAxis stroke="#ccc" unit="%" />
          <Tooltip
            contentStyle={{ background: '#1e1e2e', border: '1px solid #444' }}
            formatter={(val, _name, props) => [`${val?.toFixed(1)}%`, `${props.payload.party} — ${props.payload.winner}`]}
          />
          <Bar dataKey="margin" name="Margin %">
            {marginData.map((d, i) => (
              <Cell key={i} fill={partyColor(d.party)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <h3>Turnout & Competition</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={turnoutData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="year" stroke="#ccc" />
          <YAxis yAxisId="left" stroke="#ccc" unit="%" />
          <YAxis yAxisId="right" orientation="right" stroke="#ccc" />
          <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid #444' }} />
          <Legend />
          <Line yAxisId="left" type="monotone" dataKey="turnout" stroke="#61dafb" strokeWidth={2} name="Turnout %" dot={{ r: 4 }} connectNulls />
          <Line yAxisId="right" type="monotone" dataKey="enop" stroke="#ffa500" strokeWidth={2} name="ENOP" dot={{ r: 4 }} connectNulls />
          <Line yAxisId="right" type="monotone" dataKey="candidates" stroke="#888" strokeWidth={1} strokeDasharray="5 5" name="Candidates" dot={{ r: 3 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>

      <h3>Election Results</h3>
      <div className="results-table-wrap">
        <table className="results-table">
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
                <td><span className="party-dot" style={{ background: partyColor(normalizeParty(r.winner_party)) }} />{r.winner_party}</td>
                <td>{r.winner_votes?.toLocaleString()}</td>
                <td>{r.runner_up || '—'}</td>
                <td>{r.runner_up_party || '—'}</td>
                <td>{r.margin_percentage != null ? `${parseFloat(r.margin_percentage).toFixed(1)}%` : '—'}</td>
                <td>{r.turnout_percentage != null ? `${parseFloat(r.turnout_percentage).toFixed(1)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
