import { useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  CartesianGrid, Cell, ReferenceLine,
} from 'recharts';
import { partyColor, majorityMark } from '../constants';

export default function PredictionResults({ summary, actualLatest, latestYear, nextYear, newPartyColor, newPartyName }) {
  const MAJORITY_MARK = majorityMark(summary?.totalSeats || 234);
  const latestYr = latestYear || 'Previous';
  const nextYr = nextYear || 'Next';

  // Build comparative seats data: latest actual vs predicted
  const seatsData = useMemo(() => {
    if (!summary || !actualLatest) return [];

    const allParties = new Set();
    summary.parties.forEach((p) => allParties.add(p.party));
    actualLatest.forEach((p) => allParties.add(p.party));

    const actualMap = {};
    actualLatest.forEach((p) => {
      actualMap[p.party] = p.seats;
    });

    return [...allParties]
      .map((party) => {
        const pred = summary.parties.find((p) => p.party === party);
        return {
          party,
          actualLatest: actualMap[party] || 0,
          predicted: pred ? pred.seats : 0,
          change: (pred ? pred.seats : 0) - (actualMap[party] || 0),
        };
      })
      .filter((d) => d.actualLatest > 0 || d.predicted > 0)
      .sort((a, b) => b.predicted - a.predicted)
      .slice(0, 12);
  }, [summary, actualLatest]);

  // Vote share comparison
  const voteShareData = useMemo(() => {
    if (!summary) return [];
    return summary.parties
      .filter((p) => p.seats > 0 || p.avgVoteShare > 2)
      .slice(0, 10)
      .map((p) => ({
        party: p.party,
        voteShare: +p.avgVoteShare.toFixed(1),
        seats: p.seats,
        totalVotes: p.totalVotes,
      }));
  }, [summary]);

  if (!summary) return null;

  const getBarColor = (party) => {
    if (party === newPartyName) return newPartyColor || '#9b59b6';
    return partyColor(party);
  };

  // Leading party
  const leader = summary.parties[0];
  const hasSimpleMajority = leader && leader.seats >= MAJORITY_MARK;

  return (
    <div className="pred-results">
      {/* Summary cards */}
      <div className="pred-cards">
        <div className={`pred-card ${hasSimpleMajority ? 'majority' : 'hung'}`}>
          <div className="card-label">Predicted Outcome</div>
          <div className="card-value">
            {hasSimpleMajority
              ? `${leader.party} Majority`
              : 'Hung Assembly'}
          </div>
          {leader && (
            <div className="card-sub">
              {leader.party}: {leader.seats} seats
              {hasSimpleMajority && ` (+${leader.seats - MAJORITY_MARK} over majority)`}
            </div>
          )}
        </div>

        {summary.parties.slice(0, 4).map((p) => (
          <div key={p.party} className="pred-card">
            <div className="card-label" style={{ borderLeftColor: getBarColor(p.party) }}>
              {p.party}
            </div>
            <div className="card-value">{p.seats}</div>
            <div className="card-sub">
              {p.avgVoteShare.toFixed(1)}% avg vote share
            </div>
          </div>
        ))}

        <div className="pred-card">
          <div className="card-label">Flipped Seats</div>
          <div className="card-value flip-value">{summary.flippedCount}</div>
          <div className="card-sub">of {summary.totalSeats} constituencies</div>
        </div>
      </div>

      {/* Seat projection chart */}
      <div className="panel">
        <h3>Seat Projection: {latestYr} Actual vs {nextYr} Predicted</h3>
        <ResponsiveContainer width="100%" height={350}>
          <BarChart data={seatsData} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a40" />
            <XAxis dataKey="party" tick={{ fill: '#888', fontSize: 12 }} />
            <YAxis tick={{ fill: '#888', fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a40', borderRadius: 6 }}
              labelStyle={{ color: '#e0e0e0' }}
            />
            <Legend />
            <ReferenceLine y={MAJORITY_MARK} stroke="#facc15" strokeDasharray="5 5" label={{ value: `Majority (${MAJORITY_MARK})`, fill: '#facc15', fontSize: 11 }} />
            <Bar dataKey="actualLatest" name={`${latestYr} Actual`} fill="#555" radius={[4,4,0,0]}>
              {seatsData.map((d) => (
                <Cell key={d.party} fill={getBarColor(d.party)} fillOpacity={0.4} />
              ))}
            </Bar>
            <Bar dataKey="predicted" name={`${nextYr} Predicted`} radius={[4,4,0,0]}>
              {seatsData.map((d) => (
                <Cell key={d.party} fill={getBarColor(d.party)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Seat swings */}
      <div className="panel">
        <h3>Seat Change from {latestYr}</h3>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={seatsData.filter((d) => d.change !== 0)} margin={{ top: 10, right: 30, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a40" />
            <XAxis dataKey="party" tick={{ fill: '#888', fontSize: 12 }} />
            <YAxis tick={{ fill: '#888', fontSize: 12 }} />
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a40', borderRadius: 6 }}
            />
            <ReferenceLine y={0} stroke="#888" />
            <Bar dataKey="change" name="Seat Change" radius={[4,4,0,0]}>
              {seatsData
                .filter((d) => d.change !== 0)
                .map((d) => (
                  <Cell
                    key={d.party}
                    fill={d.change > 0 ? '#4ade80' : '#f87171'}
                  />
                ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Vote share bars */}
      <div className="panel">
        <h3>Average Vote Share by Party ({nextYr} Predicted)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={voteShareData} layout="vertical" margin={{ top: 10, right: 30, left: 60, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2a2a40" />
            <XAxis type="number" tick={{ fill: '#888', fontSize: 12 }} unit="%" />
            <YAxis type="category" dataKey="party" tick={{ fill: '#888', fontSize: 12 }} width={55} />
            <Tooltip
              contentStyle={{ background: '#1a1a2e', border: '1px solid #2a2a40', borderRadius: 6 }}
              formatter={(val) => [`${val}%`, 'Avg Vote Share']}
            />
            <Bar dataKey="voteShare" name="Avg Vote Share %" radius={[0,4,4,0]}>
              {voteShareData.map((d) => (
                <Cell key={d.party} fill={getBarColor(d.party)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
