import { useMemo } from 'react';
import { partyColor } from '../constants';

export default function ElectionTimeline({ upcoming = [], stateData = [], onStateClick }) {
  const currentYear = new Date().getFullYear();

  // Build recent past elections from stateData
  const pastElections = useMemo(() => {
    return stateData
      .filter(
        (s) => s.latest_year && s.latest_year >= currentYear - 2 && s.latest_year <= currentYear
      )
      .map((s) => ({
        state_name: s.state_name,
        display_name: s.display_name,
        year: s.latest_year,
        type: 'past',
        ruling_party: s.ruling_party,
        ruling_seats: s.ruling_party_seats,
        total: s.total_constituencies,
        turnout: s.avg_turnout,
      }))
      .sort((a, b) => b.year - a.year || a.display_name.localeCompare(b.display_name));
  }, [stateData, currentYear]);

  const futureElections = useMemo(() => {
    return upcoming
      .filter((u) => u.estimated_next_year > currentYear)
      .map((u) => {
        const sd = stateData.find((s) => s.state_name === u.state_name);
        return {
          state_name: u.state_name,
          display_name: u.display_name,
          year: u.estimated_next_year,
          type: 'future',
          et_code: u.election_type_code,
          ruling_party: sd?.ruling_party,
          ruling_seats: sd?.ruling_party_seats,
          total: sd?.total_constituencies,
          turnout: sd?.avg_turnout,
        };
      });
  }, [upcoming, stateData, currentYear]);

  const thisYear = useMemo(() => {
    return upcoming
      .filter((u) => u.estimated_next_year === currentYear)
      .map((u) => {
        const sd = stateData.find((s) => s.state_name === u.state_name);
        return {
          state_name: u.state_name,
          display_name: u.display_name,
          year: currentYear,
          type: 'current',
          et_code: u.election_type_code,
          ruling_party: sd?.ruling_party,
          ruling_seats: sd?.ruling_party_seats,
          total: sd?.total_constituencies,
          turnout: sd?.avg_turnout,
        };
      });
  }, [upcoming, stateData, currentYear]);

  const allEntries = [...pastElections, ...thisYear, ...futureElections];

  if (!allEntries.length) {
    return (
      <div className="mb-8">
        <p className="text-neutral-400 text-sm">No timeline data available.</p>
      </div>
    );
  }

  return (
    <div className="mb-8">
      <h3 className="text-base font-semibold text-primary-400 mb-4">Election Timeline</h3>

      <div className="space-y-6">
        {/* Past */}
        {pastElections.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
              Recent Elections
            </div>
            {pastElections.map((e) => (
              <TimelineCard key={`${e.state_name}-past`} entry={e} onClick={onStateClick} />
            ))}
          </div>
        )}

        {/* Current year divider */}
        <div className="relative py-3">
          <div className="absolute left-0 right-0 top-1/2 h-px bg-primary-400" />
          <span className="relative bg-neutral-950 px-3 text-xs font-semibold text-primary-400">
            {currentYear} — Now
          </span>
          {thisYear.map((e) => (
            <TimelineCard key={`${e.state_name}-now`} entry={e} onClick={onStateClick} />
          ))}
        </div>

        {/* Future */}
        {futureElections.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider mb-2">
              Upcoming (estimated)
            </div>
            {futureElections.map((e) => (
              <TimelineCard key={`${e.state_name}-${e.year}`} entry={e} onClick={onStateClick} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TimelineCard({ entry, onClick }) {
  const accent = entry.ruling_party ? partyColor(entry.ruling_party) : '#6b7280';
  const isPast = entry.type === 'past';

  return (
    <div
      className={`border-l-2 pl-3 py-2 mb-2 rounded-r-lg bg-neutral-900 cursor-pointer hover:bg-neutral-800 transition-colors`}
      style={{ borderLeftColor: accent }}
      onClick={() => onClick?.(entry.state_name)}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-mono text-neutral-400">{entry.year}</span>
        <span className="text-sm font-semibold text-white">{entry.display_name}</span>
        {entry.et_code && (
          <span className="text-[10px] bg-neutral-800 text-neutral-300 px-1.5 py-0.5 rounded">
            {entry.et_code}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2" style={{ opacity: isPast ? 0.6 : 1 }}>
        {entry.ruling_party && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
            style={{ background: accent, color: '#fff' }}
          >
            {entry.ruling_party}
            {entry.ruling_seats != null && entry.total
              ? ` ${entry.ruling_seats}/${entry.total}`
              : ''}
          </span>
        )}
        {entry.turnout != null && (
          <span className="text-xs text-neutral-400">Turnout: {entry.turnout}%</span>
        )}
      </div>
    </div>
  );
}
