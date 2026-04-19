import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid,
  LineChart, Line, Cell,
} from 'recharts';
import { api } from '../api';
import { partyColor, normalizeParty } from '../constants';

export default function StateOverview() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.stateSwing().then((rows) => {
      setData(rows);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading state overview…</div>;

  // Derive election years from data
  const years = [...new Set(data.map((d) => d.year))].sort((a, b) => a - b);

  // Derive top parties by total seats won across all years
  const partySeatTotals = {};
  data.forEach((d) => {
    const p = normalizeParty(d.party);
    partySeatTotals[p] = (partySeatTotals[p] || 0) + (d.seats_won || 0);
  });
  const topParties = Object.entries(partySeatTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([p]) => p);

  // Top 2 parties for vote share trend comparison
  const top2 = topParties.slice(0, 2);

  const seatData = years.map((yr) => {
    const entry = { year: yr };
    topParties.forEach((p) => {
      const match = data.find((d) => d.year === yr && normalizeParty(d.party) === p);
      entry[p] = match ? match.seats_won : 0;
    });
    return entry;
  });

  // Vote share trend for top 2 parties
  const voteShareData = years.map((yr) => {
    const entry = { year: yr };
    top2.forEach((p) => {
      const match = data.find((d) => d.year === yr && normalizeParty(d.party) === p);
      entry[p] = match?.avg_vote_share ?? null;
    });
    return entry;
  });

  // Swing from previous election for top parties (up to 4)
  const swingParties = topParties.slice(0, 4);
  const swingData = data
    .filter((d) => d.swing_from_prev !== null && swingParties.includes(normalizeParty(d.party)))
    .map((d) => ({
      year: d.year,
      party: normalizeParty(d.party),
      swing: d.swing_from_prev,
    }));

  const swingByYear = years.slice(1).map((yr) => {
    const entry = { year: yr };
    swingParties.forEach((p) => {
      const m = swingData.find((d) => d.year === yr && d.party === p);
      entry[p] = m?.swing ?? null;
    });
    return entry;
  });

  return (
    <div className="panel">
      <h2>Seats Won by Party (General Elections)</h2>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart data={seatData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="year" stroke="#ccc" />
          <YAxis stroke="#ccc" />
          <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid #444' }} />
          <Legend />
          {topParties.map((p) => (
            <Bar key={p} dataKey={p} stackId="seats" fill={partyColor(p)} />
          ))}
        </BarChart>
      </ResponsiveContainer>

      <h2>{top2.join(' vs ')} — Average Vote Share Trend</h2>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={voteShareData}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="year" stroke="#ccc" />
          <YAxis domain={[0, 'auto']} stroke="#ccc" unit="%" />
          <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid #444' }} />
          <Legend />
          {top2.map((p) => (
            <Line key={p} type="monotone" dataKey={p} stroke={partyColor(p)} strokeWidth={3} dot={{ r: 5 }} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>

      <h2>Vote Share Swing from Previous Election</h2>
      <ResponsiveContainer width="100%" height={350}>
        <BarChart data={swingByYear}>
          <CartesianGrid strokeDasharray="3 3" stroke="#333" />
          <XAxis dataKey="year" stroke="#ccc" />
          <YAxis stroke="#ccc" unit="%" />
          <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid #444' }} />
          <Legend />
          {swingParties.map((p) => (
            <Bar key={p} dataKey={p} fill={partyColor(p)} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
