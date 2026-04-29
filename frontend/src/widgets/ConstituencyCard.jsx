import { useState, useEffect } from 'react';

const BASE = import.meta.env.VITE_API_URL || '/api';

/**
 * Embeddable constituency result card widget.
 * Usage: <ConstituencyCard state="Tamil_Nadu" constituency="Chennai_North" />
 */
export default function ConstituencyCard({ state, constituency, electionType = 'AE' }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(
      `${BASE}/v1/swings/constituency/${encodeURIComponent(constituency)}?state=${encodeURIComponent(state)}&election_type=${electionType}`
    )
      .then((r) => r.json())
      .then(setData)
      .catch(() => setError('Failed to load data'));
  }, [state, constituency, electionType]);

  if (error) return <div style={{ color: '#f44', padding: 16 }}>{error}</div>;
  if (!data || !data.length) return <div style={{ padding: 16, color: '#999' }}>Loading…</div>;

  const latest = data[data.length - 1];

  return (
    <div
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: '#0d1117',
        color: '#e6edf3',
        padding: 16,
        borderRadius: 8,
        maxWidth: 320,
      }}
    >
      <h3 style={{ margin: '0 0 4px', fontSize: 15 }}>{constituency.replace(/_/g, ' ')}</h3>
      <p style={{ fontSize: 12, color: '#8b949e', margin: '0 0 12px' }}>
        {state.replace(/_/g, ' ')} · {latest.year}
      </p>
      <div style={{ fontSize: 14, marginBottom: 6 }}>
        <strong>{latest.winner}</strong> ({latest.winner_party})
      </div>
      {latest.margin_percentage != null && (
        <div style={{ fontSize: 13, color: '#8b949e' }}>
          Margin: {parseFloat(latest.margin_percentage).toFixed(1)}%
        </div>
      )}
      {latest.turnout_percentage != null && (
        <div style={{ fontSize: 13, color: '#8b949e' }}>
          Turnout: {parseFloat(latest.turnout_percentage).toFixed(1)}%
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: 10, color: '#8b949e', textAlign: 'right' }}>
        Powered by Election Analytics
      </div>
    </div>
  );
}
