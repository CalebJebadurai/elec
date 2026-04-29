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
      <div className="mb-8">
        <div className="py-8 space-y-4">
          <div className="animate-pulse bg-neutral-800 rounded h-6 w-48" />
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="animate-pulse bg-neutral-800 rounded-xl h-20" />
            ))}
          </div>
          <div className="animate-pulse bg-neutral-800 rounded-lg h-[40vh]" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-8">
        <div className="text-center py-8 text-error">
          {error}{' '}
          <button
            className="ml-2 text-primary-400 hover:underline cursor-pointer"
            onClick={() => setRetryCount((c) => c + 1)}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8">
      {/* Tab nav */}
      <div className="flex gap-1 mb-6 border-b-2 border-neutral-800 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-[2px] transition-colors cursor-pointer min-h-[44px] md:min-h-0 ${tab === t.key ? 'border-saffron text-saffron font-semibold' : 'border-transparent text-neutral-400 hover:text-neutral-200'}`}
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
          <div className="flex flex-col gap-3 mb-4 md:flex-row md:items-end">
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Election Type</label>
              <select
                value={et}
                onChange={(e) => setEt(e.target.value)}
                aria-label="Election type"
                className="bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-md px-3 py-2 text-sm cursor-pointer min-h-[44px] md:min-h-0"
              >
                <option value="AE">Assembly (AE)</option>
                <option value="GE">Lok Sabha (GE)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-neutral-400 mb-1">Map Color</label>
              <select
                value={colorMode}
                onChange={(e) => setColorMode(e.target.value)}
                aria-label="Map color mode"
                className="bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-md px-3 py-2 text-sm cursor-pointer min-h-[44px] md:min-h-0"
              >
                {COLOR_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Summary cards + Map */}
          <div className="flex flex-col gap-4 mb-6 lg:flex-row">
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-2 lg:w-48">
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-primary-300">
                  {summary?.totalStates || 0}
                </div>
                <div className="text-xs text-neutral-400">States/UTs</div>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-primary-300">
                  {summary?.totalSeats?.toLocaleString() || 0}
                </div>
                <div className="text-xs text-neutral-400">Total Seats</div>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center">
                <div
                  className="text-xl font-bold"
                  style={{
                    color: summary?.dominant ? partyColor(summary.dominant.party) : undefined,
                  }}
                >
                  {summary?.dominant?.party || '—'}
                </div>
                <div className="text-xs text-neutral-400">Dominant Party</div>
              </div>
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center">
                <div className="text-xl font-bold text-primary-300">
                  {summary?.avgTurnout || '—'}%
                </div>
                <div className="text-xs text-neutral-400">Avg Turnout</div>
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <IndiaMap
                stateData={stateData}
                colorMode={colorMode}
                onStateClick={handleStateClick}
              />
            </div>
          </div>

          {/* State rankings table */}
          <div className="mb-6">
            <h3 className="text-base font-semibold text-primary-400 mb-3">State Rankings</h3>
            <div className="overflow-x-auto">
              <table className="const-grid">
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
                      <th
                        key={col}
                        scope="col"
                        onClick={() => toggleSort(col)}
                        style={{ cursor: 'pointer' }}
                      >
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
                      className="clickable-row"
                    >
                      <td>{s.display_name}</td>
                      <td>{s.latest_year}</td>
                      <td>{s.total_constituencies}</td>
                      <td>
                        <span
                          className="inline-block px-2 py-0.5 rounded text-xs text-white"
                          style={{ background: partyColor(s.ruling_party) }}
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
            <div className="mb-6">
              <h3 className="text-base font-semibold text-primary-400 mb-3">Upcoming Elections</h3>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
                {upcoming.slice(0, 10).map((u) => (
                  <button
                    key={`${u.state_name}-${u.election_type_code}`}
                    className="bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-center hover:border-primary-400/50 transition-colors cursor-pointer"
                    onClick={() => handleStateClick(u.state_name)}
                  >
                    <span className="block text-lg font-bold text-saffron">
                      {u.estimated_next_year}
                    </span>
                    <span className="block text-sm text-neutral-200 truncate">
                      {u.display_name}
                    </span>
                    <span
                      className={`inline-block mt-1 text-xs px-2 py-0.5 rounded ${u.election_type_code === 'AE' ? 'bg-primary-900/40 text-primary-300' : 'bg-saffron/20 text-saffron'}`}
                    >
                      {u.election_type_code}
                    </span>
                  </button>
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
