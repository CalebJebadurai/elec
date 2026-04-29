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
      <div className="election-timeline">
        <p className="muted">No timeline data available.</p>
      </div>
    );
  }

  return (
    <div className="election-timeline">
      <h3>Election Timeline</h3>

      <div className="timeline-axis">
        {/* Past */}
        {pastElections.length > 0 && (
          <div className="timeline-section">
            <div className="timeline-section-label">Recent Elections</div>
            {pastElections.map((e) => (
              <TimelineCard key={`${e.state_name}-past`} entry={e} onClick={onStateClick} />
            ))}
          </div>
        )}

        {/* Current year divider */}
        <div className="timeline-now">
          <div className="timeline-now-line" />
          <span className="timeline-now-label">{currentYear} — Now</span>
          {thisYear.map((e) => (
            <TimelineCard key={`${e.state_name}-now`} entry={e} onClick={onStateClick} />
          ))}
        </div>

        {/* Future */}
        {futureElections.length > 0 && (
          <div className="timeline-section">
            <div className="timeline-section-label">Upcoming (estimated)</div>
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
      className={`timeline-card ${entry.type}`}
      style={{ borderLeftColor: accent }}
      onClick={() => onClick?.(entry.state_name)}
    >
      <div className="timeline-card-header">
        <span className="timeline-year">{entry.year}</span>
        <span className="timeline-state">{entry.display_name}</span>
        {entry.et_code && (
          <span className={`et-badge ${entry.et_code.toLowerCase()}`}>{entry.et_code}</span>
        )}
      </div>
      <div className="timeline-card-body" style={{ opacity: isPast ? 0.6 : 1 }}>
        {entry.ruling_party && (
          <span className="party-badge" style={{ background: accent, color: '#fff' }}>
            {entry.ruling_party}
            {entry.ruling_seats != null && entry.total
              ? ` ${entry.ruling_seats}/${entry.total}`
              : ''}
          </span>
        )}
        {entry.turnout != null && <span className="turnout-tag">Turnout: {entry.turnout}%</span>}
      </div>
    </div>
  );
}
