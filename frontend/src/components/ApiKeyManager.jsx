import { useState, useEffect } from 'react';
import { api } from '../api';

export default function ApiKeyManager() {
  const [keys, setKeys] = useState([]);
  const [newLabel, setNewLabel] = useState('');
  const [createdKey, setCreatedKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadKeys() {
    try {
      const data = await api.listApiKeys();
      setKeys(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadKeys();
  }, []);

  async function handleCreate() {
    setError('');
    setCreatedKey(null);
    try {
      const res = await api.createApiKey(newLabel || null);
      setCreatedKey(res.key);
      setNewLabel('');
      loadKeys();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRevoke(id) {
    try {
      await api.revokeApiKey(id);
      loadKeys();
    } catch (err) {
      setError(err.message);
    }
  }

  if (loading) return <div className="loading">Loading API keys…</div>;

  return (
    <div style={{ marginTop: 24 }}>
      <h3>API Keys</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        Use API keys for programmatic access. Keys are shown only once at creation.
      </p>

      {createdKey && (
        <div
          style={{
            background: 'rgba(122,224,255,0.1)',
            border: '1px solid var(--accent)',
            borderRadius: 8,
            padding: 12,
            marginBottom: 16,
            wordBreak: 'break-all',
            fontSize: 13,
          }}
        >
          <strong>New API Key (copy now — it won&apos;t be shown again):</strong>
          <br />
          <code>{createdKey}</code>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          type="text"
          placeholder="Key label (optional)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className="search-input"
          style={{ maxWidth: 200 }}
        />
        <button className="btn-login" onClick={handleCreate}>
          Generate Key
        </button>
      </div>

      {error && <p style={{ color: '#f44', fontSize: 13 }}>{error}</p>}

      {keys.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>No API keys yet.</p>
      ) : (
        <table className="const-grid" style={{ width: '100%' }}>
          <thead>
            <tr>
              <th>Prefix</th>
              <th>Label</th>
              <th>Created</th>
              <th>Last Used</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k.id}>
                <td>
                  <code>{k.key_prefix}…</code>
                </td>
                <td>{k.label || '—'}</td>
                <td>{new Date(k.created_at).toLocaleDateString()}</td>
                <td>{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : '—'}</td>
                <td>{k.is_active ? '✓ Active' : '✗ Revoked'}</td>
                <td>
                  {k.is_active && (
                    <button
                      onClick={() => handleRevoke(k.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#f44',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
