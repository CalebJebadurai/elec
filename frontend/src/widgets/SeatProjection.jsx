import { useState, useEffect } from 'react';

const BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Embeddable seat projection widget.
 * Usage: <SeatProjection state="Tamil_Nadu" year={2021} />
 */
export default function SeatProjection({ state, year, electionType = 'AE' }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(
      `${BASE}/v1/stats/summary?state=${encodeURIComponent(state)}&election_type=${electionType}`
    )
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError('Failed to load data'));
  }, [state, electionType]);

  if (error) return <div style={{ color: '#f44', padding: 16 }}>{error}</div>;
  if (!data) return <div style={{ padding: 16, color: '#999' }}>Loading…</div>;

  const parties = (data.top_parties || []).slice(0, 6);
  const maxSeats = Math.max(...parties.map((p) => p.seats_won || 0), 1);

  return (
    <div
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: '#0d1117',
        color: '#e6edf3',
        padding: 16,
        borderRadius: 8,
        maxWidth: 400,
      }}
    >
      <h3 style={{ margin: '0 0 12px', fontSize: 16 }}>
        {state.replace(/_/g, ' ')} — {year || 'Latest'} Seats
      </h3>
      {parties.map((p) => (
        <div key={p.party} style={{ marginBottom: 8 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 13,
              marginBottom: 2,
            }}
          >
            <span>{p.party}</span>
            <span style={{ fontWeight: 700 }}>{p.seats_won}</span>
          </div>
          <div style={{ background: '#21262d', borderRadius: 4, height: 20, overflow: 'hidden' }}>
            <div
              style={{
                width: `${(p.seats_won / maxSeats) * 100}%`,
                height: '100%',
                background: p.color || '#7ae0ff',
                borderRadius: 4,
                transition: 'width 0.5s ease',
              }}
            />
          </div>
        </div>
      ))}
      <div style={{ marginTop: 12, fontSize: 10, color: '#8b949e', textAlign: 'right' }}>
        Powered by Election Analytics
      </div>
    </div>
  );
}
