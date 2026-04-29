import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { partyColor } from '../constants';
import IndiaMap from './IndiaMap';
import PartyStrengthChart from './PartyStrengthChart';
import ElectionTimeline from './ElectionTimeline';
import StateComparison from './StateComparison';

const TABS = [
  { key: 'map', label: 'Map' },
  { key: 'parties', label: 'Parties' },
  { key: 'compare', label: 'Compare' },
  { key: 'timeline', label: 'Timeline' },
];

const COLOR_MODES = [
  { value: 'party', label: 'Ruling Party' },
  { value: 'turnout', label: 'Voter Turnout' },
  { value: 'margin', label: 'Victory Margin' },
];

export default function NationalDashboard({ initialTab }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState(initialTab || 'map');
  const [et, setEt] = useState('AE');
  const [colorMode, setColorMode] = useState('party');
  const [stateData, setStateData] = useState([]);
  const [partyData, setPartyData] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);
  const [sortCol, setSortCol] = useState('state_name');
  const [sortDir, setSortDir] = useState('asc');

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      api.nationalStateSummary(et),
      api.nationalPartyStrength(et),
      api.nationalUpcoming(),
    ])
      .then(([states, parties, up]) => {
        if (cancelled) return;
        setStateData(states);
        setPartyData(parties);
        setUpcoming(up);
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
  }, [et, retryCount]);

  const summary = useMemo(() => {
    if (!stateData.length) return null;
    const totalSeats = stateData.reduce((s, d) => s + d.total_constituencies, 0);
    const totalElectors = stateData.reduce((s, d) => s + (d.total_electors || 0), 0);
    const turArr = stateData.filter((d) => d.avg_turnout != null);
    const avgTurnout = turArr.length
      ? (turArr.reduce((s, d) => s + d.avg_turnout, 0) / turArr.length).toFixed(1)
      : null;
    const dominant = partyData.length ? partyData[0] : null;
    return { totalStates: stateData.length, totalSeats, totalElectors, avgTurnout, dominant };
  }, [stateData, partyData]);

  const sorted = useMemo(() => {
    const arr = [...stateData];
    arr.sort((a, b) => {
      let va = a[sortCol],
        vb = b[sortCol];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [stateData, sortCol, sortDir]);

  function toggleSort(col) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortCol(col);
      setSortDir('asc');
    }
  }

  function handleStateClick(dbName) {
    navigate(`/state/${dbName}/overview`);
  }

  if (loading) {
    return (
      <div className="national-dashboard">
        <div className="loading-spinner">Loading national data…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="national-dashboard">
        <div className="error-message">
          {error} <button onClick={() => setRetryCount((c) => c + 1)}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="national-dashboard">
      {/* Tab nav */}
      <div className="national-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => {
              setTab(t.key);
              navigate(t.key === 'map' ? '/national' : `/national/${t.key}`);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'map' && (
        <>
          {/* Controls */}
          <div className="national-controls">
            <div className="control-group">
              <label>Election Type</label>
              <select value={et} onChange={(e) => setEt(e.target.value)}>
                <option value="AE">Assembly (AE)</option>
                <option value="GE">Lok Sabha (GE)</option>
              </select>
            </div>
            <div className="control-group">
              <label>Map Color</label>
              <select value={colorMode} onChange={(e) => setColorMode(e.target.value)}>
                {COLOR_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Summary cards + Map */}
          <div className="national-top">
            <div className="summary-cards">
              <div className="stat-card">
                <div className="stat-value">{summary?.totalStates || 0}</div>
                <div className="stat-label">States/UTs</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{summary?.totalSeats?.toLocaleString() || 0}</div>
                <div className="stat-label">Total Seats</div>
              </div>
              <div className="stat-card">
                <div
                  className="stat-value"
                  style={{
                    color: summary?.dominant ? partyColor(summary.dominant.party) : undefined,
                  }}
                >
                  {summary?.dominant?.party || '—'}
                </div>
                <div className="stat-label">Dominant Party</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{summary?.avgTurnout || '—'}%</div>
                <div className="stat-label">Avg Turnout</div>
              </div>
            </div>
            <div className="map-section">
              <IndiaMap
                stateData={stateData}
                colorMode={colorMode}
                onStateClick={handleStateClick}
              />
            </div>
          </div>

          {/* State rankings table */}
          <div className="state-rankings">
            <h3>State Rankings</h3>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {[
                      ['state_name', 'State'],
                      ['latest_year', 'Year'],
                      ['total_constituencies', 'Seats'],
                      ['ruling_party', 'Ruling Party'],
                      ['ruling_party_seats', 'Seats Won'],
                      ['runner_up_party', 'Runner-up'],
                      ['avg_turnout', 'Turnout'],
                    ].map(([col, label]) => (
                      <th key={col} onClick={() => toggleSort(col)} style={{ cursor: 'pointer' }}>
                        {label} {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s) => (
                    <tr
                      key={s.state_name}
                      onClick={() => handleStateClick(s.state_name)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td>{s.display_name}</td>
                      <td>{s.latest_year}</td>
                      <td>{s.total_constituencies}</td>
                      <td>
                        <span
                          className="party-badge"
                          style={{ background: partyColor(s.ruling_party), color: '#fff' }}
                        >
                          {s.ruling_party}
                        </span>
                      </td>
                      <td>{s.ruling_party_seats}</td>
                      <td>{s.runner_up_party || '—'}</td>
                      <td>{s.avg_turnout != null ? `${s.avg_turnout}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Upcoming elections */}
          {upcoming.length > 0 && (
            <div className="upcoming-section">
              <h3>Upcoming Elections</h3>
              <div className="upcoming-grid">
                {upcoming.slice(0, 10).map((u) => (
                  <div
                    key={`${u.state_name}-${u.election_type_code}`}
                    className="upcoming-card"
                    onClick={() => handleStateClick(u.state_name)}
                  >
                    <span className="upcoming-year">{u.estimated_next_year}</span>
                    <span className="upcoming-state">{u.display_name}</span>
                    <span className={`et-badge ${u.election_type_code.toLowerCase()}`}>
                      {u.election_type_code}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'parties' && (
        <PartyStrengthChart
          partyData={partyData}
          stateData={stateData}
          electionType={et}
          onElectionTypeChange={setEt}
        />
      )}

      {tab === 'compare' && (
        <StateComparison stateData={stateData} electionType={et} onElectionTypeChange={setEt} />
      )}

      {tab === 'timeline' && (
        <ElectionTimeline
          upcoming={upcoming}
          stateData={stateData}
          onStateClick={handleStateClick}
        />
      )}
    </div>
  );
}
