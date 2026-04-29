import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import { useState } from 'react';

const FEATURES = [
  { name: 'State election data', free: true, pro: true, business: true },
  { name: 'National dashboard', free: true, pro: true, business: true },
  { name: 'Constituency swing analysis', free: true, pro: true, business: true },
  { name: 'Prediction engine', free: false, pro: true, business: true },
  { name: 'CSV data export', free: false, pro: true, business: true },
  { name: 'API key access (1K req/mo)', free: false, pro: true, business: true },
  { name: 'Higher API limits (50K req/mo)', free: false, pro: false, business: true },
  { name: 'Unbranded embed widgets', free: false, pro: false, business: true },
  { name: '24-hour support SLA', free: false, pro: false, business: true },
];

export default function PricingPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubscribe() {
    if (!user) {
      setError('Please log in first to subscribe.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.createSubscription();
      if (res.short_url) {
        window.location.href = res.short_url;
      }
    } catch (err) {
      setError(err.message || 'Failed to create subscription');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 text-neutral-200 text-sm leading-relaxed">
      <h1 className="text-xl font-semibold text-white mb-2">Pricing</h1>
      <p className="text-neutral-400 text-sm mb-8">
        Explore India&apos;s election data for free, or upgrade to Pro for advanced features.
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 24,
          marginBottom: 32,
        }}
      >
        {/* Free tier */}
        <div
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 24,
          }}
        >
          <h2 style={{ marginBottom: 4 }}>Free</h2>
          <p
            style={{ fontSize: 28, fontWeight: 700, margin: '8px 0 16px', color: 'var(--accent)' }}
          >
            ₹0
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {FEATURES.filter((f) => f.free).map((f) => (
              <li key={f.name} style={{ padding: '6px 0', color: 'var(--text)' }}>
                ✓ {f.name}
              </li>
            ))}
            {FEATURES.filter((f) => !f.free).map((f) => (
              <li
                key={f.name}
                style={{
                  padding: '6px 0',
                  color: 'var(--text-muted)',
                  textDecoration: 'line-through',
                }}
              >
                {f.name}
              </li>
            ))}
          </ul>
        </div>

        {/* Pro tier */}
        <div
          style={{
            background: 'var(--bg2)',
            border: '2px solid var(--accent)',
            borderRadius: 12,
            padding: 24,
            position: 'relative',
          }}
        >
          <span
            style={{
              position: 'absolute',
              top: -12,
              right: 16,
              background: 'var(--accent)',
              color: '#000',
              fontSize: 12,
              fontWeight: 700,
              padding: '2px 10px',
              borderRadius: 8,
            }}
          >
            RECOMMENDED
          </span>
          <h2 style={{ marginBottom: 4 }}>Pro</h2>
          <p style={{ fontSize: 28, fontWeight: 700, margin: '8px 0 4px', color: 'var(--accent)' }}>
            ₹299
            <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)' }}>
              /month
            </span>
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            Cancel anytime
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px' }}>
            {FEATURES.filter((f) => f.pro).map((f) => (
              <li
                key={f.name}
                style={{
                  padding: '6px 0',
                  color: f.pro ? 'var(--text)' : 'var(--text-muted)',
                  textDecoration: f.pro ? 'none' : 'line-through',
                }}
              >
                ✓ {f.name}
              </li>
            ))}
            {FEATURES.filter((f) => !f.pro).map((f) => (
              <li
                key={f.name}
                style={{
                  padding: '6px 0',
                  color: 'var(--text-muted)',
                  textDecoration: 'line-through',
                }}
              >
                {f.name}
              </li>
            ))}
          </ul>
          <button
            className="w-full bg-primary-400 text-black font-semibold py-2 px-4 rounded-md hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
            onClick={handleSubscribe}
            disabled={loading}
          >
            {loading ? 'Processing…' : 'Subscribe to Pro'}
          </button>
          {error && <p style={{ color: '#f44', marginTop: 8, fontSize: 13 }}>{error}</p>}
        </div>

        {/* Business tier */}
        <div
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 24,
          }}
        >
          <h2 style={{ marginBottom: 4 }}>Business</h2>
          <p style={{ fontSize: 28, fontWeight: 700, margin: '8px 0 4px', color: 'var(--accent)' }}>
            ₹4,999
            <span style={{ fontSize: 14, fontWeight: 400, color: 'var(--text-muted)' }}>
              /month
            </span>
          </p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
            For media houses &amp; organizations
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 20px' }}>
            {FEATURES.map((f) => (
              <li key={f.name} style={{ padding: '6px 0', color: 'var(--text)' }}>
                ✓ {f.name}
              </li>
            ))}
          </ul>
          <a
            href="mailto:sales@elec.example.com"
            className="block w-full text-center bg-primary-400 text-black font-semibold py-2 px-4 rounded-md hover:opacity-90 transition-opacity no-underline"
          >
            Contact Sales
          </a>
        </div>
      </div>
    </div>
  );
}
