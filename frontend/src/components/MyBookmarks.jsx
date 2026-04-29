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

  useEffect(() => {
    fetch();
  }, [fetch]);

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
      setBookmarks((prev) => prev.map((b) => (b.id === bookmark.id ? updated : b)));
    } catch (err) {
      console.error(err);
    }
  }

  if (!user) return null;

  return (
    <div className="mb-6">
      <h3 className="text-base font-semibold text-primary-400 mb-3">My Saved Predictions</h3>

      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="animate-pulse bg-neutral-800 rounded-xl h-28" />
          ))}
        </div>
      )}

      {!loading && bookmarks.length === 0 && (
        <p className="text-center text-neutral-400 py-8">
          No saved predictions yet. Adjust the sliders and click "Save" to bookmark your scenarios.
        </p>
      )}

      <div className="space-y-2">
        {bookmarks.map((b) => (
          <div key={b.id} className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
            <div className="flex flex-col gap-1 mb-2 md:flex-row md:items-center md:justify-between">
              <h4 className="text-sm font-semibold text-white">{b.title}</h4>
              <div className="flex items-center gap-2 flex-wrap">
                {b.params?.state_name && (
                  <span className="inline-block bg-primary-900/40 text-primary-300 text-xs px-2 py-0.5 rounded-full">
                    {b.params.state_name.replace(/_/g, ' ')}
                  </span>
                )}
                {b.is_public ? (
                  <span className="inline-block bg-success/20 text-success text-xs px-2 py-0.5 rounded-full">
                    Public
                  </span>
                ) : (
                  <span className="inline-block bg-neutral-800 text-neutral-400 text-xs px-2 py-0.5 rounded-full">
                    Private
                  </span>
                )}
                <span className="text-xs text-neutral-500">
                  {new Date(b.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
            {b.description && <p className="text-xs text-neutral-400 mb-2">{b.description}</p>}
            <div className="flex items-center gap-2 text-xs text-neutral-400 mb-2">
              {b.is_public && (
                <>
                  <span>👍 {b.like_count}</span>
                  <span>👎 {b.dislike_count}</span>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                className="bg-primary-400 text-black text-xs font-semibold px-3 py-1.5 rounded-md min-h-[44px] md:min-h-0 hover:opacity-90 transition-opacity cursor-pointer"
                onClick={() => onLoad(b.params)}
              >
                Load
              </button>
              <button
                className="bg-neutral-800 text-neutral-200 text-xs px-3 py-1.5 rounded-md min-h-[44px] md:min-h-0 border border-neutral-700 hover:bg-neutral-700 transition-colors cursor-pointer"
                onClick={() => handleTogglePublic(b)}
              >
                {b.is_public ? 'Make Private' : 'Publish'}
              </button>
              <button
                className="bg-error/20 text-error text-xs px-3 py-1.5 rounded-md min-h-[44px] md:min-h-0 hover:bg-error/30 transition-colors cursor-pointer"
                onClick={() => handleDelete(b.id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
