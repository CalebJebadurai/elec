import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';
import { partyColor } from '../constants';

export default function CommunityFeed({ onLoad }) {
  const { user } = useAuth();
  const [predictions, setPredictions] = useState([]);
  const [sort, setSort] = useState('recent');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.listPublicBookmarks(sort)
      .then(setPredictions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sort]);

  async function handleVote(id, voteType) {
    if (!user) return;
    try {
      const result = await api.voteBookmark(id, voteType);
      setPredictions((prev) =>
        prev.map((p) =>
          p.id === id
            ? { ...p, like_count: result.like_count, dislike_count: result.dislike_count, my_vote: result.my_vote }
            : p
        )
      );
    } catch (err) {
      console.error(err);
    }
  }

  // Extract summary from saved params
  function getParamsSummary(params) {
    if (!params) return '';
    const parts = [];
    if (params.antiIncumbencyPct != null) parts.push(`Anti-Inc: ${params.antiIncumbencyPct}%`);
    if (params.turnoutPct != null) parts.push(`Turnout: ${params.turnoutPct}%`);
    if (params.newPartyName) parts.push(`New: ${params.newPartyName} @ ${params.newPartyStatewideVoteShare}%`);
    return parts.join(' · ');
  }

  return (
    <div className="community-feed">
      <div className="feed-header">
        <h3>Community Predictions</h3>
        <div className="feed-sort">
          <button
            className={sort === 'recent' ? 'active' : ''}
            onClick={() => setSort('recent')}
          >
            Recent
          </button>
          <button
            className={sort === 'popular' ? 'active' : ''}
            onClick={() => setSort('popular')}
          >
            Popular
          </button>
        </div>
      </div>

      {loading && <div className="loading">Loading community predictions...</div>}

      {!loading && predictions.length === 0 && (
        <p className="feed-empty">
          No public predictions yet. Be the first to publish your analysis!
        </p>
      )}

      <div className="feed-list">
        {predictions.map((p) => (
          <div key={p.id} className="feed-card">
            <div className="feed-card-header">
              <div className="feed-author">
                {p.author_avatar ? (
                  <img src={p.author_avatar} alt="" className="feed-avatar" />
                ) : (
                  <span className="feed-avatar-placeholder">
                    {(p.author_name || 'A')[0].toUpperCase()}
                  </span>
                )}
                <span className="feed-author-name">{p.author_name}</span>
              </div>
              <span className="feed-date">
                {new Date(p.created_at).toLocaleDateString()}
              </span>
            </div>

            <h4 className="feed-title">{p.title}</h4>
            {p.description && <p className="feed-desc">{p.description}</p>}
            <p className="feed-params">{getParamsSummary(p.params)}</p>

            <div className="feed-footer">
              <div className="feed-votes">
                <button
                  className={`vote-btn ${p.my_vote === 'like' ? 'voted' : ''}`}
                  onClick={() => handleVote(p.id, 'like')}
                  disabled={!user}
                  title={user ? 'Like this prediction' : 'Sign in to vote'}
                >
                  👍 {p.like_count}
                </button>
                <button
                  className={`vote-btn ${p.my_vote === 'dislike' ? 'voted' : ''}`}
                  onClick={() => handleVote(p.id, 'dislike')}
                  disabled={!user}
                  title={user ? 'Dislike this prediction' : 'Sign in to vote'}
                >
                  👎 {p.dislike_count}
                </button>
              </div>
              <button className="btn-sm btn-primary" onClick={() => onLoad(p.params)}>
                Load This Prediction
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
