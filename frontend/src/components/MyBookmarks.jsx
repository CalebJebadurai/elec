import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';

export default function MyBookmarks({ onLoad }) {
  const { user } = useAuth();
  const [bookmarks, setBookmarks] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const data = await api.listBookmarks();
      setBookmarks(data);
    } catch (err) {
      console.error('Failed to load bookmarks:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  async function handleDelete(id) {
    try {
      await api.deleteBookmark(id);
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      console.error(err);
    }
  }

  async function handleTogglePublic(bookmark) {
    try {
      const updated = await api.updateBookmark(bookmark.id, {
        is_public: !bookmark.is_public,
      });
      setBookmarks((prev) =>
        prev.map((b) => (b.id === bookmark.id ? updated : b))
      );
    } catch (err) {
      console.error(err);
    }
  }

  if (!user) return null;

  return (
    <div className="bookmarks-panel">
      <h3>My Saved Predictions</h3>

      {loading && <div className="loading">Loading...</div>}

      {!loading && bookmarks.length === 0 && (
        <p className="bookmarks-empty">
          No saved predictions yet. Adjust the sliders and click "Save" to bookmark your scenarios.
        </p>
      )}

      <div className="bookmarks-list">
        {bookmarks.map((b) => (
          <div key={b.id} className="bookmark-card">
            <div className="bookmark-header">
              <h4 className="bookmark-title">{b.title}</h4>
              <div className="bookmark-meta">
                {b.is_public ? (
                  <span className="badge badge-public">Public</span>
                ) : (
                  <span className="badge badge-private">Private</span>
                )}
                <span className="bookmark-date">
                  {new Date(b.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
            {b.description && <p className="bookmark-desc">{b.description}</p>}
            <div className="bookmark-stats">
              {b.is_public && (
                <>
                  <span>👍 {b.like_count}</span>
                  <span>👎 {b.dislike_count}</span>
                </>
              )}
            </div>
            <div className="bookmark-actions">
              <button className="btn-sm btn-primary" onClick={() => onLoad(b.params)}>
                Load
              </button>
              <button
                className="btn-sm btn-secondary"
                onClick={() => handleTogglePublic(b)}
              >
                {b.is_public ? 'Make Private' : 'Publish'}
              </button>
              <button className="btn-sm btn-danger" onClick={() => handleDelete(b.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
