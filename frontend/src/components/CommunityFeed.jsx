import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../api';

export default function CommunityFeed({ onLoad }) {
  const { user } = useAuth();
  const [predictions, setPredictions] = useState([]);
  const [sort, setSort] = useState('recent');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api
      .listPublicBookmarks(sort)
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
            ? {
                ...p,
                like_count: result.like_count,
                dislike_count: result.dislike_count,
                my_vote: result.my_vote,
              }
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
    if (params.totalElectors) parts.push(`Voters: ${(params.totalElectors / 1e6).toFixed(1)}M`);
    if (params.turnoutPct != null) parts.push(`Turnout: ${params.turnoutPct}%`);
    if (params.newPartyName)
      parts.push(`New: ${params.newPartyName} @ ${params.newPartyStatewideVoteShare}%`);
    return parts.join(' · ');
  }

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Community Predictions</h3>
        <div className="flex border border-neutral-700 rounded-lg overflow-hidden">
          <button
            className={`px-3 py-1.5 text-sm min-h-[44px] md:min-h-0 transition-colors cursor-pointer ${sort === 'recent' ? 'bg-primary-400 text-black font-semibold' : 'bg-transparent text-neutral-400 hover:bg-neutral-800'}`}
            onClick={() => setSort('recent')}
          >
            Recent
          </button>
          <button
            className={`px-3 py-1.5 text-sm min-h-[44px] md:min-h-0 transition-colors cursor-pointer ${sort === 'popular' ? 'bg-primary-400 text-black font-semibold' : 'bg-transparent text-neutral-400 hover:bg-neutral-800'}`}
            onClick={() => setSort('popular')}
          >
            Popular
          </button>
        </div>
      </div>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="animate-pulse bg-neutral-800 rounded-2xl h-32" />
          ))}
        </div>
      )}

      {!loading && predictions.length === 0 && (
        <p className="text-center text-neutral-400 py-12">
          No public predictions yet. Be the first to publish your analysis!
        </p>
      )}

      <div className="space-y-3">
        {predictions.map((p) => (
          <div
            key={p.id}
            className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 shadow-md"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {p.author_avatar ? (
                  <img src={p.author_avatar} alt="" className="w-7 h-7 rounded-full" />
                ) : (
                  <span className="w-7 h-7 rounded-full bg-primary-900 text-primary-300 flex items-center justify-center text-xs font-semibold">
                    {(p.author_name || 'A')[0].toUpperCase()}
                  </span>
                )}
                <span className="text-sm text-neutral-200">{p.author_name}</span>
              </div>
              <span className="text-xs text-neutral-500">
                {new Date(p.created_at).toLocaleDateString()}
              </span>
            </div>

            <h4 className="text-sm font-semibold text-white mb-1">{p.title}</h4>
            {p.params?.state_name && (
              <span className="inline-block bg-primary-900/40 text-primary-300 text-xs px-2 py-0.5 rounded-full mb-1">
                {p.params.state_name.replace(/_/g, ' ')}
              </span>
            )}
            {p.description && <p className="text-xs text-neutral-400 mb-1">{p.description}</p>}
            <p className="text-xs text-neutral-500 font-mono">{getParamsSummary(p.params)}</p>

            <div className="flex items-center justify-between mt-3 pt-2 border-t border-neutral-800">
              <div className="flex gap-2">
                <button
                  className={`flex items-center gap-1 min-w-[44px] min-h-[44px] justify-center rounded-lg text-sm transition-colors cursor-pointer ${p.my_vote === 'like' ? 'bg-success/20 text-success' : 'text-neutral-400 hover:bg-neutral-800'}`}
                  onClick={() => handleVote(p.id, 'like')}
                  disabled={!user}
                  title={user ? 'Like this prediction' : 'Sign in to vote'}
                >
                  👍 {p.like_count}
                </button>
                <button
                  className={`flex items-center gap-1 min-w-[44px] min-h-[44px] justify-center rounded-lg text-sm transition-colors cursor-pointer ${p.my_vote === 'dislike' ? 'bg-error/20 text-error' : 'text-neutral-400 hover:bg-neutral-800'}`}
                  onClick={() => handleVote(p.id, 'dislike')}
                  disabled={!user}
                  title={user ? 'Dislike this prediction' : 'Sign in to vote'}
                >
                  👎 {p.dislike_count}
                </button>
              </div>
              <button
                className="bg-primary-400 text-black text-xs font-semibold px-3 py-1.5 rounded-md min-h-[44px] md:min-h-0 hover:opacity-90 transition-opacity cursor-pointer"
                onClick={() => onLoad(p.params)}
              >
                Load This Prediction
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
