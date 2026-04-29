import { useMemo, useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from 'recharts';
import { partyColor, majorityMark } from '../constants';

export default function PredictionResults({
  summary,
  actualLatest,
  latestYear,
  nextYear,
  newPartyColor,
  newPartyName,
}) {
  const MAJORITY_MARK = majorityMark(summary?.totalSeats || 234);
  const latestYr = latestYear || 'Previous';
  const nextYr = nextYear || 'Next';

  // Animate charts only on first mount, not on slider-driven re-renders
  const [animateCharts, setAnimateCharts] = useState(true);
  useEffect(() => {
    setAnimateCharts(false);
  }, []);

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
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2 mb-4 md:grid-cols-3 lg:grid-cols-6">
        <div
          className={`bg-neutral-900 border rounded-xl p-3 text-center ${hasSimpleMajority ? 'border-success/50' : 'border-warning/50'} col-span-2 md:col-span-1`}
        >
          <div className="text-xs text-neutral-400">Predicted Outcome</div>
          <div className="text-sm font-bold text-white mt-1">
            {hasSimpleMajority ? `${leader.party} Majority` : 'Hung Assembly'}
          </div>
          {leader && (
            <div className="text-xs text-neutral-500 mt-0.5">
              {leader.party}: {leader.seats} seats
              {hasSimpleMajority && ` (+${leader.seats - MAJORITY_MARK} over majority)`}
            </div>
          )}
        </div>

        {summary.parties.slice(0, 4).map((p) => (
          <div
            key={p.party}
            className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center"
            style={{ borderLeftColor: getBarColor(p.party), borderLeftWidth: 3 }}
          >
            <div className="text-xs text-neutral-400">{p.party}</div>
            <div className="text-lg font-bold text-white mt-0.5">{p.seats}</div>
            <div className="text-xs text-neutral-500">{p.avgVoteShare.toFixed(1)}% avg</div>
          </div>
        ))}

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center">
          <div className="text-xs text-neutral-400">Flipped Seats</div>
          <div className="text-lg font-bold text-warning mt-0.5">{summary.flippedCount}</div>
          <div className="text-xs text-neutral-500">of {summary.totalSeats}</div>
        </div>
      </div>

      {/* Seat projection chart */}
      <div className="mb-6">
        <h3 className="text-base font-semibold text-primary-400 mb-3">
          Seat Projection: {latestYr} Actual vs {nextYr} Predicted
        </h3>
        <div className="min-h-[200px] h-[40vh] max-h-[350px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={seatsData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a40" />
              <XAxis dataKey="party" tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: '#1a1a2e',
                  border: '1px solid #2a2a40',
                  borderRadius: 6,
                }}
                labelStyle={{ color: '#e0e0e0' }}
              />
              <Legend verticalAlign="bottom" />
              <ReferenceLine
                y={MAJORITY_MARK}
                stroke="#facc15"
                strokeDasharray="5 5"
                label={{ value: `Majority (${MAJORITY_MARK})`, fill: '#facc15', fontSize: 11 }}
              />
              <Bar
                dataKey="actualLatest"
                name={`${latestYr} Actual`}
                fill="#555"
                radius={[4, 4, 0, 0]}
                isAnimationActive={animateCharts}
                animationDuration={400}
                animationEasing="ease-out"
              >
                {seatsData.map((d) => (
                  <Cell key={d.party} fill={getBarColor(d.party)} fillOpacity={0.4} />
                ))}
              </Bar>
              <Bar
                dataKey="predicted"
                name={`${nextYr} Predicted`}
                radius={[4, 4, 0, 0]}
                isAnimationActive={animateCharts}
                animationDuration={400}
                animationEasing="ease-out"
              >
                {seatsData.map((d) => (
                  <Cell key={d.party} fill={getBarColor(d.party)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Seat swings */}
      <div className="mb-6">
        <h3 className="text-base font-semibold text-primary-400 mb-3">
          Seat Change from {latestYr}
        </h3>
        <div className="min-h-[150px] h-[30vh] max-h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={seatsData.filter((d) => d.change !== 0)}
              margin={{ top: 10, right: 10, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a40" />
              <XAxis dataKey="party" tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: '#1a1a2e',
                  border: '1px solid #2a2a40',
                  borderRadius: 6,
                }}
              />
              <ReferenceLine y={0} stroke="#888" />
              <Bar
                dataKey="change"
                name="Seat Change"
                radius={[4, 4, 0, 0]}
                isAnimationActive={animateCharts}
                animationDuration={400}
                animationEasing="ease-out"
              >
                {seatsData
                  .filter((d) => d.change !== 0)
                  .map((d) => (
                    <Cell key={d.party} fill={d.change > 0 ? '#4ade80' : '#f87171'} />
                  ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Vote share bars */}
      <div className="mb-6">
        <h3 className="text-base font-semibold text-primary-400 mb-3">
          Average Vote Share by Party ({nextYr} Predicted)
        </h3>
        <div className="min-h-[200px] h-[35vh] max-h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={voteShareData}
              layout="vertical"
              margin={{ top: 10, right: 10, left: 50, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a40" />
              <XAxis type="number" tick={{ fill: '#888', fontSize: 11 }} unit="%" />
              <YAxis
                type="category"
                dataKey="party"
                tick={{ fill: '#888', fontSize: 11 }}
                width={45}
              />
              <Tooltip
                contentStyle={{
                  background: '#1a1a2e',
                  border: '1px solid #2a2a40',
                  borderRadius: 6,
                }}
                formatter={(val) => [`${val}%`, 'Avg Vote Share']}
              />
              <Bar
                dataKey="voteShare"
                name="Avg Vote Share %"
                radius={[0, 4, 4, 0]}
                isAnimationActive={animateCharts}
                animationDuration={400}
                animationEasing="ease-out"
              >
                {voteShareData.map((d) => (
                  <Cell key={d.party} fill={getBarColor(d.party)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
