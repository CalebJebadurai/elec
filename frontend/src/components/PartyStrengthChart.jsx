import { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend,
  LineChart,
  Line,
} from 'recharts';
import { partyColor } from '../constants';
import { api } from '../api';
import IndiaMap from './IndiaMap';

export default function PartyStrengthChart({
  partyData,
  stateData,
  electionType,
  onElectionTypeChange,
}) {
  const [selected, setSelected] = useState(null);
  const [partyMapData, setPartyMapData] = useState(null);
  const [view, setView] = useState('bar'); // 'bar' | 'trend' | 'map'

  const top10 = useMemo(() => (partyData || []).slice(0, 10), [partyData]);

  async function selectParty(party) {
    setSelected(party);
    setView('map');
    try {
      const data = await api.nationalPartyMap(party, electionType);
      setPartyMapData(data);
    } catch {
      setPartyMapData([]);
    }
  }

  // Build trend data from party years_active
  const _trendData = useMemo(() => {
    if (!partyData?.length) return [];
    const top5 = partyData.slice(0, 5);
    const allYears = new Set();
    top5.forEach((p) => p.years_active?.forEach((y) => allYears.add(y)));
    // We don't have per-year seat data from this endpoint, so just show the overview
    return Array.from(allYears)
      .sort()
      .map((year) => {
        const entry = { year };
        top5.forEach((p) => {
          entry[p.party] = p.years_active?.includes(year) ? 1 : 0;
        });
        return entry;
      });
  }, [partyData]);

  return (
    <div className="mb-8">
      <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-end">
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
        <div>
          <label className="block text-xs text-neutral-400 mb-1">View</label>
          <div className="flex gap-1">
            <button
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors cursor-pointer ${view === 'bar' ? 'bg-primary-400 text-black border-primary-400' : 'bg-neutral-900 text-neutral-300 border-neutral-700 hover:bg-neutral-800'}`}
              onClick={() => setView('bar')}
            >
              Seats Chart
            </button>
            <button
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors cursor-pointer ${view === 'map' ? 'bg-primary-400 text-black border-primary-400' : 'bg-neutral-900 text-neutral-300 border-neutral-700 hover:bg-neutral-800'}`}
              onClick={() => setView('map')}
            >
              Party Map
            </button>
          </div>
        </div>
      </div>

      {/* Party selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {top10.map((p) => (
          <button
            key={p.party}
            className="px-3 py-1 text-xs rounded-full border cursor-pointer transition-colors min-h-[36px]"
            style={{
              borderColor: partyColor(p.party),
              background: selected === p.party ? partyColor(p.party) : 'transparent',
              color: selected === p.party ? '#fff' : partyColor(p.party),
            }}
            onClick={() => selectParty(p.party)}
          >
            {p.party}
          </button>
        ))}
      </div>

      {/* Selected party detail */}
      {selected && (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 mb-4">
          {(() => {
            const p = partyData.find((d) => d.party === selected);
            if (!p) return null;
            return (
              <div className="flex flex-wrap gap-4 text-xs text-neutral-300">
                <span>
                  <strong>{p.total_seats_won.toLocaleString()}</strong> total seats
                </span>
                <span>
                  <strong>{p.states_won_in}</strong> states
                </span>
                <span>
                  <strong>{p.avg_vote_share}%</strong> avg vote share
                </span>
                <span>
                  Active: {p.years_active?.[0]}–{p.years_active?.[p.years_active.length - 1]}
                </span>
              </div>
            );
          })()}
        </div>
      )}

      {view === 'bar' && (
        <div className="mb-6">
          <h3 className="text-base font-semibold text-primary-400 mb-3">
            National Seat Wins — Top Parties
          </h3>
          <div className="min-h-[200px] h-[40vh] max-h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top10} layout="vertical" margin={{ left: 60, right: 20 }}>
                <XAxis type="number" />
                <YAxis type="category" dataKey="party" width={55} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => v.toLocaleString()} />
                <Bar dataKey="total_seats_won" name="Total Seats Won">
                  {top10.map((p) => (
                    <Cell
                      key={p.party}
                      fill={partyColor(p.party)}
                      opacity={selected && selected !== p.party ? 0.3 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* States presence bar */}
          <h3 className="text-base font-semibold text-primary-400 mt-6 mb-3">States Won In</h3>
          <div className="min-h-[200px] h-[40vh] max-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={top10} layout="vertical" margin={{ left: 60, right: 20 }}>
                <XAxis type="number" />
                <YAxis type="category" dataKey="party" width={55} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="states_won_in" name="States Won In">
                  {top10.map((p) => (
                    <Cell
                      key={p.party}
                      fill={partyColor(p.party)}
                      opacity={selected && selected !== p.party ? 0.3 : 1}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {view === 'map' && (
        <div className="mb-6">
          <h3 className="text-base font-semibold text-primary-400 mb-3">
            {selected ? `${selected} — State-wise Seats` : 'Select a party to view map'}
          </h3>
          {selected && partyMapData ? (
            <>
              <IndiaMap
                stateData={stateData}
                colorMode="party"
                partyMapData={partyMapData}
                selectedParty={selected}
              />
              <div className="space-y-1 mt-4">
                {partyMapData
                  .sort((a, b) => b.seats_won - a.seats_won)
                  .map((s) => (
                    <div key={s.state_name} className="flex items-center gap-2 text-xs">
                      <span className="w-24 text-neutral-300 truncate">{s.display_name}</span>
                      <span className="flex-1 h-4 bg-neutral-800 rounded overflow-hidden">
                        <span
                          className="block h-full rounded"
                          style={{
                            width: `${(s.seats_won / s.total_seats) * 100}%`,
                            background: partyColor(selected),
                          }}
                        />
                      </span>
                      <span className="w-12 text-right text-neutral-300">
                        {s.seats_won}/{s.total_seats}
                      </span>
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <p className="text-neutral-400 text-sm">
              Click a party pill above to see its state-wise presence.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
