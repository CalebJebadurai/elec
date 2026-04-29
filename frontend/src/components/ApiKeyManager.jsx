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

  if (loading)
    return (
      <div className="py-8 space-y-2">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex gap-4 py-2">
            <div className="animate-pulse bg-neutral-800 rounded h-4 w-24" />
            <div className="animate-pulse bg-neutral-800 rounded h-4 w-32" />
            <div className="animate-pulse bg-neutral-800 rounded h-4 w-20" />
          </div>
        ))}
      </div>
    );

  return (
    <div className="mt-6">
      <h3 className="text-base font-semibold text-primary-400 mb-2">API Keys</h3>
      <p className="text-neutral-400 text-xs mb-3">
        Use API keys for programmatic access. Keys are shown only once at creation.
      </p>

      {createdKey && (
        <div className="bg-primary-400/10 border border-primary-400/30 rounded-lg p-3 mb-4 break-all text-xs">
          <strong>New API Key (copy now — it won&apos;t be shown again):</strong>
          <br />
          <code className="text-primary-300">{createdKey}</code>
        </div>
      )}

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Key label (optional)"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          className="bg-neutral-900 border border-neutral-800 text-neutral-200 rounded-md px-3 py-2 text-sm max-w-[200px]"
        />
        <button
          className="bg-primary-400 text-black text-sm font-semibold px-4 py-2 rounded-md hover:opacity-90 transition-opacity cursor-pointer"
          onClick={handleCreate}
        >
          Generate Key
        </button>
      </div>

      {error && <p className="text-error text-xs mb-2">{error}</p>}

      {keys.length === 0 ? (
        <p className="text-neutral-400 text-sm">No API keys yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="const-grid w-full">
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
                    <code className="text-primary-300">{k.key_prefix}…</code>
                  </td>
                  <td>{k.label || '—'}</td>
                  <td>{new Date(k.created_at).toLocaleDateString()}</td>
                  <td>{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : '—'}</td>
                  <td>{k.is_active ? '✓ Active' : '✗ Revoked'}</td>
                  <td>
                    {k.is_active && (
                      <button
                        onClick={() => handleRevoke(k.id)}
                        className="bg-transparent border-none text-error cursor-pointer text-xs hover:underline"
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
