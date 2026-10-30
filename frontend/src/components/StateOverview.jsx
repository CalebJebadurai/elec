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
} from 'recharts';
import { api } from '../api';
import { partyColor, normalizeParty } from '../constants';
import { useStateSelection } from '../contexts/StateContext';
import DataSourceStamp from './DataSourceStamp';
import ChartCard from './ChartCard';
import WomenRepresentation from './WomenRepresentation';

export default function StateOverview() {
  const { selectedState, electionType } = useStateSelection();
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .stateSwing(selectedState, electionType)
      .then((rows) => {
        setData(rows);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedState, electionType]);

  if (loading)
    return (
      <div className="py-8 space-y-4">
        <div className="animate-pulse bg-neutral-800 rounded h-6 w-48" />
        <div className="animate-pulse bg-neutral-800 rounded-lg h-[40vh]" />
        <div className="animate-pulse bg-neutral-800 rounded-lg h-[40vh]" />
      </div>
    );

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
    <div className="mb-8 space-y-4 md:space-y-6">
      <ChartCard title="Seats won by party" note="General elections, stacked by party">
        <div className="min-h-[220px] h-[42vh] max-h-[440px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={seatData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="year" stroke="#ccc" tick={{ fontSize: 12 }} />
              <YAxis stroke="#ccc" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid #444' }} />
              <Legend verticalAlign="bottom" />
              {topParties.map((p) => (
                <Bar key={p} dataKey={p} stackId="seats" fill={partyColor(p)} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <div className="grid gap-4 md:gap-6 xl:grid-cols-2">
        <ChartCard
          title={`${top2.join(' vs ')}: average vote share`}
          note="Average share per contested seat"
        >
          <div className="min-h-[220px] h-[38vh] max-h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={voteShareData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="year" stroke="#ccc" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 'auto']} stroke="#ccc" unit="%" tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid #444' }} />
                <Legend verticalAlign="bottom" />
                {top2.map((p) => (
                  <Line
                    key={p}
                    type="monotone"
                    dataKey={p}
                    stroke={partyColor(p)}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, strokeWidth: 0 }}
                    activeDot={{ r: 6 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title="Vote share swing" note="Change from the previous election, in points">
          <div className="min-h-[220px] h-[38vh] max-h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={swingByYear}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="year" stroke="#ccc" tick={{ fontSize: 12 }} />
                <YAxis stroke="#ccc" unit="%" tick={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ background: '#1e1e2e', border: '1px solid #444' }} />
                <Legend verticalAlign="bottom" />
                {swingParties.map((p) => (
                  <Bar key={p} dataKey={p} fill={partyColor(p)} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
      <WomenRepresentation state={selectedState} electionType={electionType} />
      <DataSourceStamp
        viewTitle={`${selectedState.replace(/_/g, ' ')} ${electionType === 'GE' ? 'Lok Sabha' : 'Assembly'} election overview`}
        latestYear={years[years.length - 1]}
      />
    </div>
  );
}
