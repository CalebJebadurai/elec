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
    <div className="party-strength">
      <div className="national-controls">
        <div className="control-group">
          <label>Election Type</label>
          <select value={electionType} onChange={(e) => onElectionTypeChange(e.target.value)}>
            <option value="AE">Assembly (AE)</option>
            <option value="GE">Lok Sabha (GE)</option>
          </select>
        </div>
        <div className="control-group">
          <label>View</label>
          <div className="tab-group">
            <button
              className={`tab-btn ${view === 'bar' ? 'active' : ''}`}
              onClick={() => setView('bar')}
            >
              Seats Chart
            </button>
            <button
              className={`tab-btn ${view === 'map' ? 'active' : ''}`}
              onClick={() => setView('map')}
            >
              Party Map
            </button>
          </div>
        </div>
      </div>

      {/* Party selector */}
      <div className="party-selector">
        {top10.map((p) => (
          <button
            key={p.party}
            className={`party-pill ${selected === p.party ? 'active' : ''}`}
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
        <div className="party-detail-panel">
          {(() => {
            const p = partyData.find((d) => d.party === selected);
            if (!p) return null;
            return (
              <div className="party-detail-stats">
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
        <div className="chart-section">
          <h3>National Seat Wins — Top Parties</h3>
          <ResponsiveContainer width="100%" height={400}>
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

          {/* States presence bar */}
          <h3 style={{ marginTop: '1.5rem' }}>States Won In</h3>
          <ResponsiveContainer width="100%" height={300}>
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
      )}

      {view === 'map' && (
        <div className="chart-section">
          <h3>{selected ? `${selected} — State-wise Seats` : 'Select a party to view map'}</h3>
          {selected && partyMapData ? (
            <>
              <IndiaMap
                stateData={stateData}
                colorMode="party"
                partyMapData={partyMapData}
                selectedParty={selected}
              />
              <div className="party-map-list">
                {partyMapData
                  .sort((a, b) => b.seats_won - a.seats_won)
                  .map((s) => (
                    <div key={s.state_name} className="party-map-row">
                      <span>{s.display_name}</span>
                      <span className="seats-bar">
                        <span
                          style={{
                            width: `${(s.seats_won / s.total_seats) * 100}%`,
                            background: partyColor(selected),
                          }}
                        />
                      </span>
                      <span className="seats-num">
                        {s.seats_won}/{s.total_seats}
                      </span>
                    </div>
                  ))}
              </div>
            </>
          ) : (
            <p className="muted">Click a party pill above to see its state-wise presence.</p>
          )}
        </div>
      )}
    </div>
  );
}
