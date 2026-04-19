import { useState, useEffect, useMemo } from 'react';
import { api } from '../api';
import { normalizeParty, partyColor } from '../constants';

export default function ConstituencyList({ onSelect }) {
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDistrict, setFilterDistrict] = useState('');
  const [filterRegion, setFilterRegion] = useState('');
  const [sortBy, setSortBy] = useState('name');

  useEffect(() => {
    api.allConstituencySwings().then((rows) => {
      setAllData(rows);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

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
  const dataYears = useMemo(() => [...new Set(allData.map((r) => r.year))].sort((a, b) => a - b), [allData]);
  const latestYear = dataYears.length > 0 ? dataYears[dataYears.length - 1] : null;

  // Unique districts and regions for filters
  const districts = useMemo(() => [...new Set(constituencies.map((c) => c.district).filter(Boolean))].sort(), [constituencies]);
  const regions = useMemo(() => [...new Set(constituencies.map((c) => c.region).filter(Boolean))].sort(), [constituencies]);

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
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q) || (c.district || '').toLowerCase().includes(q));
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
  }, [constituencies, search, filterDistrict, filterRegion, sortBy]);

  if (loading) return <div className="loading">Loading constituency data…</div>;

  // Which general election years have data?
  const activeYears = dataYears.filter((y) => allData.some((r) => r.year === y));

  return (
    <div className="panel">
      <div className="filters">
        <input
          type="text"
          placeholder="Search constituency or district…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
        <select value={filterRegion} onChange={(e) => setFilterRegion(e.target.value)}>
          <option value="">All Regions</option>
          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={filterDistrict} onChange={(e) => setFilterDistrict(e.target.value)}>
          <option value="">All Districts</option>
          {districts.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="name">Sort: Name</option>
          <option value="swings">Sort: Most Swings</option>
          <option value="margin">Sort: Tightest Latest Margin</option>
        </select>
      </div>

      <div className="count-badge">{filtered.length} constituencies</div>

      <div className="const-grid-wrap">
        <table className="const-grid">
          <thead>
            <tr>
              <th className="sticky-col">Constituency</th>
              <th>District</th>
              <th>Swings</th>
              {activeYears.map((y) => <th key={y}>{y}</th>)}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => {
              const sw = countSwings(c);
              return (
                <tr key={c.name} onClick={() => onSelect(c.name)} className="clickable-row">
                  <td className="sticky-col const-name">{c.name}</td>
                  <td className="small-text">{c.district || '—'}</td>
                  <td><span className={`swing-count ${sw >= 5 ? 'high' : sw >= 3 ? 'med' : 'low'}`}>{sw}</span></td>
                  {activeYears.map((y) => {
                    const d = c.years[y];
                    if (!d) return <td key={y} className="empty-cell">—</td>;
                    return (
                      <td key={y} className="party-cell" style={{ borderLeft: `4px solid ${partyColor(d.winner_party)}` }}>
                        <span className="pc-party">{d.winner_party}</span>
                        <span className="pc-margin">{d.margin != null ? `${d.margin.toFixed(1)}%` : ''}</span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
