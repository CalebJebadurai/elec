import { useState, useEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { api } from '../api';
import { normalizeParty, partyColor } from '../constants';
import { useStateSelection } from '../contexts/StateContext';
import { useDebounce } from '../hooks/useDebounce';

export default function ConstituencyList({ onSelect }) {
  const { selectedState, electionType } = useStateSelection();
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const [filterDistrict, setFilterDistrict] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [sortBy, setSortBy] = useState('name');

  useEffect(() => {
    setLoading(true);
    setSearch('');
    setFilterDistrict('');
    setFilterRegion('');
    api
      .allConstituencySwings(selectedState, electionType)
      .then((rows) => {
        setAllData(rows);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedState, electionType]);

  // Group by constituency
  const constituencies = useMemo(() => {
    const map = {};
    allData.forEach((r) => {
      const key = r.constituency_name;
      if (!key) return;
      if (!map[key]) {
        map[key] = {
          name: key,
          constituency_no: r.constituency_no,
          district: r.district_name,
          region: r.sub_region,
          type: r.constituency_type,
          years: {},
        };
      }
      map[key].years[r.year] = {
        winner_party: normalizeParty(r.winner_party),
        winner: r.winner,
        margin: r.margin_percentage != null ? parseFloat(r.margin_percentage) : null,
        turnout: r.turnout_percentage != null ? parseFloat(r.turnout_percentage) : null,
        runner_up_party: normalizeParty(r.runner_up_party),
        vote_share: r.winner_vote_share != null ? parseFloat(r.winner_vote_share) : null,
      };
    });
    return Object.values(map);
  }, [allData]);

  // Derive election years from data
  const dataYears = useMemo(
    () => [...new Set(allData.map((r) => r.year))].sort((a, b) => a - b),
    [allData]
  );
  const latestYear = dataYears.length > 0 ? dataYears[dataYears.length - 1] : null;

  // Unique districts and regions for filters
  const districts = useMemo(
    () => [...new Set(constituencies.map((c) => c.district).filter(Boolean))].sort(),
    [constituencies]
  );
  const regions = useMemo(
    () => [...new Set(constituencies.map((c) => c.region).filter(Boolean))].sort(),
    [constituencies]
  );

  // Count swings per constituency (party change between consecutive elections)
  function countSwings(c) {
    const yrs = dataYears.filter((y) => c.years[y]);
    let swings = 0;
    for (let i = 1; i < yrs.length; i++) {
      if (c.years[yrs[i]].winner_party !== c.years[yrs[i - 1]].winner_party) swings++;
    }
    return swings;
  }

  const filtered = useMemo(() => {
    let list = constituencies;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || (c.district || '').toLowerCase().includes(q)
      );
    }
    if (filterDistrict) list = list.filter((c) => c.district === filterDistrict);
    if (filterRegion) list = list.filter((c) => c.region === filterRegion);

    if (sortBy === 'swings') {
      list = [...list].sort((a, b) => countSwings(b) - countSwings(a));
    } else if (sortBy === 'margin') {
      list = [...list].sort((a, b) => {
        const ma = latestYear ? (a.years[latestYear]?.margin ?? 999) : 999;
        const mb = latestYear ? (b.years[latestYear]?.margin ?? 999) : 999;
        return ma - mb;
      });
    } else {
      list = [...list].sort((a, b) => a.name.localeCompare(b.name));
    }
    return list;
  }, [constituencies, debouncedSearch, filterDistrict, filterRegion, sortBy]);

  if (loading)
    return (
      <div className="py-8 space-y-2">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="animate-pulse bg-neutral-800 rounded-xl h-20" />
        ))}
      </div>
    );

  // Which general election years have data?
  const activeYears = dataYears.filter((y) => allData.some((r) => r.year === y));

  return (
    <div className="mb-8">
      <div className="flex flex-col gap-2 mb-3 md:flex-row md:flex-wrap md:items-center">
        <input
          type="text"
          placeholder="Search constituency or district…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:w-64 bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-md px-3 py-2 text-sm placeholder:text-neutral-500 focus:outline-none focus:border-primary-400"
        />
        <select
          value={filterRegion}
          onChange={(e) => setFilterRegion(e.target.value)}
          aria-label="Filter by region"
          className="bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-md px-3 py-2 text-sm cursor-pointer"
        >
          <option value="">All Regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          value={filterDistrict}
          onChange={(e) => setFilterDistrict(e.target.value)}
          aria-label="Filter by district"
          className="bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-md px-3 py-2 text-sm cursor-pointer"
        >
          <option value="">All Districts</option>
          {districts.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="Sort order"
          className="bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-md px-3 py-2 text-sm cursor-pointer"
        >
          <option value="name">Sort: Name</option>
          <option value="swings">Sort: Most Swings</option>
          <option value="margin">Sort: Tightest Latest Margin</option>
        </select>
      </div>

      <div className="inline-block bg-neutral-900 text-neutral-300 text-xs px-3 py-1 rounded-full mb-3">
        {filtered.length} constituencies
      </div>

      {/* Mobile card view — virtualized */}
      <MobileCardList
        filtered={filtered}
        latestYear={latestYear}
        countSwings={countSwings}
        onSelect={onSelect}
      />

      {/* Desktop table view — virtualized */}
      <DesktopTableView
        filtered={filtered}
        activeYears={activeYears}
        countSwings={countSwings}
        onSelect={onSelect}
      />
    </div>
  );
}

function MobileCardList({ filtered, latestYear, countSwings, onSelect }) {
  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 88,
    overscan: 5,
  });

  return (
    <div
      ref={parentRef}
      className="block md:hidden overflow-y-auto"
      style={{ maxHeight: 'calc(100vh - 220px)' }}
    >
      <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const c = filtered[virtualRow.index];
          const sw = countSwings(c);
          const latest = latestYear ? c.years[latestYear] : null;
          return (
            <div
              key={c.name}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <button
                onClick={() => onSelect(c.name)}
                className="w-full text-left bg-neutral-900 border border-neutral-800 rounded-xl p-4 hover:border-primary-400/50 transition-colors cursor-pointer mb-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm text-white truncate">{c.name}</div>
                    <div className="text-xs text-neutral-400 mt-0.5">{c.district || '—'}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {latest && (
                      <span
                        className="text-xs font-mono px-2 py-0.5 rounded"
                        style={{
                          backgroundColor: partyColor(latest.winner_party) + '22',
                          color: partyColor(latest.winner_party),
                          borderLeft: `3px solid ${partyColor(latest.winner_party)}`,
                        }}
                      >
                        {latest.winner_party}
                      </span>
                    )}
                    <span
                      className={`text-xs font-mono px-1.5 py-0.5 rounded ${sw >= 5 ? 'bg-error/20 text-error' : sw >= 3 ? 'bg-warning/20 text-warning' : 'bg-neutral-800 text-neutral-400'}`}
                    >
                      {sw}↔
                    </span>
                  </div>
                </div>
                {latest && latest.margin != null && (
                  <div className="text-xs text-neutral-500 mt-1.5">
                    Margin: {latest.margin.toFixed(1)}% · Turnout:{' '}
                    {latest.turnout != null ? `${latest.turnout.toFixed(1)}%` : '—'}
                  </div>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DesktopTableView({ filtered, activeYears, countSwings, onSelect }) {
  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 10,
  });

  return (
    <div
      ref={parentRef}
      className="hidden md:block overflow-auto"
      style={{ maxHeight: 'calc(100vh - 200px)' }}
    >
      <table className="const-grid">
        <caption className="sr-only">Constituency election results</caption>
        <thead>
          <tr>
            <th scope="col" className="sticky-col">
              Constituency
            </th>
            <th scope="col">District</th>
            <th scope="col">Swings</th>
            {activeYears.map((y) => (
              <th scope="col" key={y}>
                {y}
              </th>
            ))}
          </tr>
        </thead>
        <tbody
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            position: 'relative',
            display: 'block',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const c = filtered[virtualRow.index];
            const sw = countSwings(c);
            return (
              <tr
                key={c.name}
                onClick={() => onSelect(c.name)}
                className="clickable-row"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                  display: 'table',
                  tableLayout: 'fixed',
                }}
              >
                <td className="sticky-col const-name">{c.name}</td>
                <td className="small-text">{c.district || '—'}</td>
                <td>
                  <span className={`swing-count ${sw >= 5 ? 'high' : sw >= 3 ? 'med' : 'low'}`}>
                    {sw}
                  </span>
                </td>
                {activeYears.map((y) => {
                  const d = c.years[y];
                  if (!d)
                    return (
                      <td key={y} className="empty-cell">
                        —
                      </td>
                    );
                  return (
                    <td
                      key={y}
                      className="party-cell"
                      style={{ borderLeft: `4px solid ${partyColor(d.winner_party)}` }}
                    >
                      <span className="pc-party">{d.winner_party}</span>
                      <span className="pc-margin">
                        {d.margin != null ? `${d.margin.toFixed(1)}%` : ''}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
