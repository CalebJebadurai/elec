export default function SupportPage() {
  return (
    <div className="legal-page">
      <h1>Support</h1>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        We are here to help. Support availability depends on your subscription tier.
      </p>

      <div style={{ display: 'grid', gap: 16, maxWidth: 600 }}>
        <div
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 16,
          }}
        >
          <h3 style={{ margin: '0 0 8px' }}>Free</h3>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 14 }}>
            Community support via GitHub Discussions. No guaranteed response time.
          </p>
        </div>

        <div
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 16,
          }}
        >
          <h3 style={{ margin: '0 0 8px' }}>Pro</h3>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 14 }}>
            Email support with 48-hour response SLA. Priority bug fixes.
          </p>
        </div>

        <div
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--accent)',
            borderRadius: 8,
            padding: 16,
          }}
        >
          <h3 style={{ margin: '0 0 8px' }}>Business</h3>
          <p style={{ color: 'var(--text-muted)', margin: 0, fontSize: 14 }}>
            Email support with 24-hour response SLA. Dedicated onboarding assistance. Custom widget
            branding.
          </p>
        </div>
      </div>

      <h2 style={{ marginTop: 32 }}>Contact</h2>
      <p>
        Email:{' '}
        <a href="mailto:support@elec.example.com" style={{ color: 'var(--accent)' }}>
          support@elec.example.com
        </a>
      </p>
      <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
        For security issues, please email security@elec.example.com directly.
      </p>
    </div>
  );
}
