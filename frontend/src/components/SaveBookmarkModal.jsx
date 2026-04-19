import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';

export default function SaveBookmarkModal({ params, onClose, onSaved }) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!user) return null;

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const bookmark = await api.createBookmark({
        title: title.trim(),
        description: description.trim(),
        params,
        is_public: isPublic,
      });
      onSaved?.(bookmark);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose}>×</button>
        <h2>Save Prediction</h2>

        {error && <div className="modal-error">{error}</div>}

        <form onSubmit={handleSave}>
          <label className="modal-label">Title *</label>
          <input
            type="text"
            className="modal-input"
            placeholder="e.g. Ruling party sweep with 75% turnout"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            maxLength={100}
          />

          <label className="modal-label">Description (optional)</label>
          <textarea
            className="modal-input modal-textarea"
            placeholder="Describe your scenario..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
          />

          <label className="modal-checkbox-label">
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            Publish publicly (others can view and react)
          </label>

          <button type="submit" className="modal-btn" disabled={loading}>
            {loading ? 'Saving...' : 'Save Prediction'}
          </button>
        </form>
      </div>
    </div>
  );
}
