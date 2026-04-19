import { useState, useMemo } from 'react';
import { partyColor, normalizeParty } from '../constants';

export default function PredictionConstituencyTable({ predictions, onOverride, latestYear, nextYear }) {
  const latestYr = latestYear || 'Previous';
  const nextYr = nextYear || 'Next';
  const [search, setSearch] = useState('');
  const [regionFilter, setRegionFilter] = useState('ALL');
  const [showFlippedOnly, setShowFlippedOnly] = useState(false);
  const [sortKey, setSortKey] = useState('name');
  const [sortDir, setSortDir] = useState(1);

  // Derive sub-regions from data
  const subRegions = useMemo(() => {
    const set = new Set((predictions || []).map((r) => r.sub_region).filter(Boolean));
    return ['ALL', ...([...set].sort())];
  }, [predictions]);

  const filtered = useMemo(() => {
    let list = predictions || [];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(
        (r) =>
          r.constituency_name?.toLowerCase().includes(q) ||
          r.district_name?.toLowerCase().includes(q)
      );
    }
    if (regionFilter !== 'ALL') {
      list = list.filter((r) => r.sub_region === regionFilter);
    }
    if (showFlippedOnly) {
      list = list.filter((r) => r.flipped);
    }

    list = [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'name':
          cmp = (a.constituency_name || '').localeCompare(b.constituency_name || '');
          break;
        case 'marginLatest':
          cmp = (a.margin_percentage_latest || 0) - (b.margin_percentage_latest || 0);
          break;
        case 'marginNext':
          cmp = (a.predicted_margin_pct || 0) - (b.predicted_margin_pct || 0);
          break;
        case 'marginChange':
          cmp =
            Math.abs(a.predicted_margin_pct || 0) -
            Math.abs(a.margin_percentage_latest || 0) -
            (Math.abs(b.predicted_margin_pct || 0) -
              Math.abs(b.margin_percentage_latest || 0));
          break;
        case 'newParty':
          cmp = (a.new_party_share || 0) - (b.new_party_share || 0);
          break;
        default:
          cmp = 0;
      }
      return cmp * sortDir;
    });

    return list;
  }, [predictions, search, regionFilter, showFlippedOnly, sortKey, sortDir]);

  const handleSort = (key) => {
    if (sortKey === key) setSortDir(-sortDir);
    else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const sortIcon = (key) =>
    sortKey === key ? (sortDir === 1 ? ' ↑' : ' ↓') : '';

  const flippedCount = (predictions || []).filter((r) => r.flipped).length;

  return (
    <div className="panel">
      <h3>Constituency-Level Predictions</h3>

      <div className="filters">
        <input
          type="text"
          placeholder="Search constituency or district..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
        >
          {subRegions.map((r) => (
            <option key={r} value={r}>
              {r === 'ALL' ? 'All Regions' : r}
            </option>
          ))}
        </select>
        <label className="filter-checkbox">
          <input
            type="checkbox"
            checked={showFlippedOnly}
            onChange={(e) => setShowFlippedOnly(e.target.checked)}
          />
          Flipped only ({flippedCount})
        </label>
      </div>

      <div className="count-badge">{filtered.length} constituencies</div>

      <div className="const-grid-wrap" style={{ maxHeight: '600px', overflowY: 'auto' }}>
        <table className="const-grid">
          <thead>
            <tr>
              <th className="sticky-col" onClick={() => handleSort('name')} style={{ cursor: 'pointer' }}>
                Constituency{sortIcon('name')}
              </th>
              <th>District</th>
              <th>{latestYr} Winner</th>
              <th onClick={() => handleSort('marginLatest')} style={{ cursor: 'pointer' }}>
                {latestYr} Margin{sortIcon('marginLatest')}
              </th>
              <th>{nextYr} Predicted</th>
              <th onClick={() => handleSort('marginNext')} style={{ cursor: 'pointer' }}>
                {nextYr} Margin{sortIcon('marginNext')}
              </th>
              <th onClick={() => handleSort('marginChange')} style={{ cursor: 'pointer' }}>
                Change{sortIcon('marginChange')}
              </th>
              {predictions?.some((r) => r.new_party_share > 0) && (
                <th onClick={() => handleSort('newParty')} style={{ cursor: 'pointer' }}>
                  New Party %{sortIcon('newParty')}
                </th>
              )}
              <th>Flip</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const marginDelta =
                (r.predicted_margin_pct || 0) -
                (r.margin_percentage_latest || 0);
              const newPartyCol = predictions?.some((x) => x.new_party_share > 0);

              return (
                <tr
                  key={r.constituency_name}
                  className={`clickable-row ${r.flipped ? 'flip-row' : ''}`}
                  onClick={() => onOverride && onOverride(r.constituency_name)}
                >
                  <td className="sticky-col const-name">{r.constituency_name}</td>
                  <td className="small-text">{r.district_name}</td>
                  <td>
                    <span
                      className="party-dot"
                      style={{
                        background: partyColor(normalizeParty(r.winner_party_latest)),
                      }}
                    />
                    {normalizeParty(r.winner_party_latest)}
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {(r.margin_percentage_latest || 0).toFixed(1)}%
                  </td>
                  <td>
                    <span
                      className="party-dot"
                      style={{
                        background: partyColor(r.predicted_winner) || '#9b59b6',
                      }}
                    />
                    {r.predicted_winner}
                  </td>
                  <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                    {(r.predicted_margin_pct || 0).toFixed(1)}%
                  </td>
                  <td
                    style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 12,
                      color: marginDelta > 0 ? '#4ade80' : marginDelta < 0 ? '#f87171' : '#888',
                    }}
                  >
                    {marginDelta > 0 ? '+' : ''}
                    {marginDelta.toFixed(1)}%
                  </td>
                  {newPartyCol && (
                    <td style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>
                      {(r.new_party_share || 0).toFixed(1)}%
                    </td>
                  )}
                  <td>
                    {r.flipped && (
                      <span className="flip-indicator" title={`${r.winner_party_latest} → ${r.predicted_winner}`}>
                        ⇄
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
