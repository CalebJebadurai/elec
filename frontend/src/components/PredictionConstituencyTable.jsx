import { useState, useMemo } from 'react';
import { partyColor, normalizeParty } from '../constants';

export default function PredictionConstituencyTable({
  predictions,
  onOverride,
  latestYear,
  nextYear,
}) {
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
    return ['ALL', ...[...set].sort()];
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
            (Math.abs(b.predicted_margin_pct || 0) - Math.abs(b.margin_percentage_latest || 0));
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

  const sortIcon = (key) => (sortKey === key ? (sortDir === 1 ? ' ↑' : ' ↓') : '');

  const flippedCount = (predictions || []).filter((r) => r.flipped).length;

  return (
    <div className="mb-8">
      <h3 className="text-base font-semibold text-primary-400 mb-3">
        Constituency-Level Predictions
      </h3>

      <div className="flex flex-col gap-2 mb-3 md:flex-row md:flex-wrap md:items-center">
        <input
          type="text"
          placeholder="Search constituency or district..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:w-64 bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-md px-3 py-2 text-sm placeholder:text-neutral-500 focus:outline-none focus:border-primary-400"
        />
        <select
          value={regionFilter}
          onChange={(e) => setRegionFilter(e.target.value)}
          aria-label="Filter by region"
          className="bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-md px-3 py-2 text-sm cursor-pointer"
        >
          {subRegions.map((r) => (
            <option key={r} value={r}>
              {r === 'ALL' ? 'All Regions' : r}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
          <input
            type="checkbox"
            checked={showFlippedOnly}
            onChange={(e) => setShowFlippedOnly(e.target.checked)}
            className="cursor-pointer"
          />
          Flipped only ({flippedCount})
        </label>
      </div>

      <div className="inline-block bg-neutral-900 text-neutral-300 text-xs px-3 py-1 rounded-full mb-3">
        {filtered.length} constituencies
      </div>

      {/* Mobile card view */}
      <div className="block md:hidden space-y-2">
        {filtered.map((r) => {
          const marginDelta = (r.predicted_margin_pct || 0) - (r.margin_percentage_latest || 0);
          return (
            <button
              key={r.constituency_name}
              onClick={() => onOverride && onOverride(r.constituency_name)}
              className={`w-full text-left bg-neutral-900 border rounded-xl p-4 transition-colors cursor-pointer ${r.flipped ? 'border-warning/50' : 'border-neutral-800 hover:border-primary-400/50'}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm text-white truncate">
                    {r.constituency_name}
                  </div>
                  <div className="text-xs text-neutral-400 mt-0.5">{r.district_name}</div>
                </div>
                {r.flipped && (
                  <span
                    className="text-xs bg-warning/20 text-warning px-2 py-0.5 rounded shrink-0"
                    title={`${r.winner_party_latest} → ${r.predicted_winner}`}
                  >
                    ⇄ Flip
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-2 text-xs">
                <span style={{ color: partyColor(normalizeParty(r.winner_party_latest)) }}>
                  {normalizeParty(r.winner_party_latest)}{' '}
                  {(r.margin_percentage_latest || 0).toFixed(1)}%
                </span>
                <span className="text-neutral-500">→</span>
                <span style={{ color: partyColor(r.predicted_winner) || '#9b59b6' }}>
                  {r.predicted_winner} {(r.predicted_margin_pct || 0).toFixed(1)}%
                </span>
                <span
                  className={`font-mono ${marginDelta > 0 ? 'text-success' : marginDelta < 0 ? 'text-error' : 'text-neutral-500'}`}
                >
                  {marginDelta > 0 ? '+' : ''}
                  {marginDelta.toFixed(1)}%
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Desktop table view */}
      <div className="hidden md:block overflow-x-auto max-h-[600px] overflow-y-auto">
        <table className="const-grid">
          <caption className="sr-only">Constituency-level prediction results</caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky-col"
                onClick={() => handleSort('name')}
                style={{ cursor: 'pointer' }}
              >
                Constituency{sortIcon('name')}
              </th>
              <th scope="col">District</th>
              <th scope="col">{latestYr} Winner</th>
              <th
                scope="col"
                onClick={() => handleSort('marginLatest')}
                style={{ cursor: 'pointer' }}
              >
                {latestYr} Margin{sortIcon('marginLatest')}
              </th>
              <th scope="col">{nextYr} Predicted</th>
              <th
                scope="col"
                onClick={() => handleSort('marginNext')}
                style={{ cursor: 'pointer' }}
              >
                {nextYr} Margin{sortIcon('marginNext')}
              </th>
              <th
                scope="col"
                onClick={() => handleSort('marginChange')}
                style={{ cursor: 'pointer' }}
              >
                Change{sortIcon('marginChange')}
              </th>
              {predictions?.some((r) => r.new_party_share > 0) && (
                <th
                  scope="col"
                  onClick={() => handleSort('newParty')}
                  style={{ cursor: 'pointer' }}
                >
                  New Party %{sortIcon('newParty')}
                </th>
              )}
              <th scope="col">Flip</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const marginDelta = (r.predicted_margin_pct || 0) - (r.margin_percentage_latest || 0);
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
                      <span
                        className="flip-indicator"
                        title={`${r.winner_party_latest} → ${r.predicted_winner}`}
                      >
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
