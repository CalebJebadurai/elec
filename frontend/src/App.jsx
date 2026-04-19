import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, useNavigate, useLocation, useParams, Navigate } from 'react-router-dom';
const StateOverview = lazy(() => import('./components/StateOverview'));
const ConstituencyList = lazy(() => import('./components/ConstituencyList'));
const ConstituencyDetail = lazy(() => import('./components/ConstituencyDetail'));
const PredictionPanel = lazy(() => import('./components/PredictionPanel'));
const PredictionResults = lazy(() => import('./components/PredictionResults'));
const PredictionConstituencyTable = lazy(() => import('./components/PredictionConstituencyTable'));
const CommunityFeed = lazy(() => import('./components/CommunityFeed'));
const MyBookmarks = lazy(() => import('./components/MyBookmarks'));
import LoginModal from './components/LoginModal';
import UserMenu from './components/UserMenu';
import SaveBookmarkModal from './components/SaveBookmarkModal';
import Disclaimer from './components/Disclaimer';
import ErrorBoundary from './components/ErrorBoundary';
import { useAuth } from './contexts/AuthContext';
import { api } from './api';
import { DEFAULT_PREDICTION_PARAMS, normalizeParty, buildAffinityPresets } from './constants';
import { generateBaseline, applyNewParty, aggregateResults } from './engine/predictionEngine';
import './index.css';

const Loading = () => <div className="loading">Loading…</div>;

// Wrapper for constituency detail to extract route param
function ConstituencyDetailRoute({ onBack }) {
  const { name } = useParams();
  return <ConstituencyDetail name={decodeURIComponent(name)} onBack={onBack} />;
}

// Require auth — redirect to landing if not logged in
function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [showLogin, setShowLogin] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);

  // App-level stats (drives dynamic headings)
  const [stats, setStats] = useState(null);

  // Prediction state
  const [predData, setPredData] = useState(null);
  const [predLoading, setPredLoading] = useState(false);
  const [predParams, setPredParams] = useState({ ...DEFAULT_PREDICTION_PARAMS });

  // Load stats on mount
  useEffect(() => {
    api.stats().then(setStats).catch(console.error);
  }, []);

  // Redirect authenticated users from landing to overview
  useEffect(() => {
    if (user && location.pathname === '/') {
      navigate('/overview', { replace: true });
    }
  }, [user, location.pathname, navigate]);

  function handleSelect(name) {
    navigate(`/constituencies/${encodeURIComponent(name)}`);
  }

  function handleBack() {
    navigate('/constituencies');
  }

  // Load prediction data when on prediction route
  const onPrediction = location.pathname === '/predictions';
  useEffect(() => {
    if (onPrediction && !predData) {
      setPredLoading(true);
      api.predictionData()
        .then((data) => setPredData(data))
        .catch(console.error)
        .finally(() => setPredLoading(false));
    }
  }, [onPrediction, predData]);

  // Derive top parties and dynamic affinity presets from prediction data
  const topParties = useMemo(() => {
    if (!predData) return [];
    const seats = {};
    predData.constituencies.forEach((c) => {
      const p = normalizeParty(c.winner_party_latest);
      if (p && p !== 'IND') seats[p] = (seats[p] || 0) + 1;
    });
    return Object.entries(seats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([p]) => p);
  }, [predData]);

  const dynamicPresets = useMemo(() => buildAffinityPresets(topParties), [topParties]);

  // Compute growth factor (use custom totalElectors if set)
  const growthFactor = useMemo(() => {
    if (!predData) return 1;
    if (predParams.totalElectors) {
      return predParams.totalElectors / predData.total_electors_latest;
    }
    return predData.total_electors_next / predData.total_electors_latest;
  }, [predData, predParams.totalElectors]);

  // Compute baseline predictions (only re-runs when core params change)
  const baseline = useMemo(() => {
    if (!predData) return [];
    return generateBaseline(predData.constituencies, {
      antiIncumbencyPct: predParams.antiIncumbencyPct,
      turnoutPct: predParams.turnoutPct,
      growthFactor,
    });
  }, [predData, predParams.antiIncumbencyPct, predParams.turnoutPct, growthFactor]);

  // Apply new party on top of baseline (only re-runs when party params change)
  const predictions = useMemo(() => {
    if (!baseline.length) return baseline;
    if (predParams.newPartyName && predParams.newPartyStatewideVoteShare > 0) {
      return applyNewParty(baseline, {
        name: predParams.newPartyName,
        color: predParams.newPartyColor,
        statewideVoteShare: predParams.newPartyStatewideVoteShare,
        affinityWeights: predParams.affinityWeights,
        constituencyOverrides: predParams.constituencyOverrides,
      });
    }
    return baseline;
  }, [baseline, predParams.newPartyName, predParams.newPartyColor,
      predParams.newPartyStatewideVoteShare, predParams.affinityWeights,
      predParams.constituencyOverrides]);

  const summary = useMemo(() => aggregateResults(predictions), [predictions]);

  // Build actual seat counts from latest election for comparison
  const actualLatest = useMemo(() => {
    if (!predData) return [];
    const seats = {};
    predData.constituencies.forEach((c) => {
      const party = normalizeParty(c.winner_party_latest);
      if (party) seats[party] = (seats[party] || 0) + 1;
    });
    return Object.entries(seats)
      .map(([party, count]) => ({ party, seats: count }))
      .sort((a, b) => b.seats - a.seats);
  }, [predData]);

  // Handle adding constituency override from table click
  const handleConstituencyOverride = useCallback(
    (name) => {
      if (!predParams.newPartyName) return;
      const current = predParams.constituencyOverrides[name];
      const val = current !== undefined ? undefined : predParams.newPartyStatewideVoteShare;
      const next = { ...predParams.constituencyOverrides };
      if (val === undefined) delete next[name];
      else next[name] = val;
      setPredParams((prev) => ({ ...prev, constituencyOverrides: next }));
    },
    [predParams]
  );

  // Load bookmark params
  const handleLoadBookmark = useCallback((params) => {
    if (params) {
      setPredParams({ ...DEFAULT_PREDICTION_PARAMS, ...params });
      setShowBookmarks(false);
      navigate('/predictions');
    }
  }, [navigate]);

  // Determine active nav from path
  const path = location.pathname;

  return (
    <ErrorBoundary>
      <div className="app">
        <header>
          <div className="header-top">
            <div>
              <h1>{stats?.state_name || 'Election'} Election Analysis</h1>
              <p className="subtitle">
                {stats
                  ? `Assembly Elections ${stats.year_min}–${stats.year_max} · ${stats.total_constituencies} Constituencies · ${stats.general_years.length} General Elections`
                  : 'Loading…'}
              </p>
            </div>
            <div className="header-actions">
              {user ? (
                <UserMenu />
              ) : (
                <button className="btn-login" onClick={() => setShowLogin(true)}>
                  Sign In
                </button>
              )}
            </div>
          </div>
          <nav>
            <button className={path === '/overview' ? 'active' : ''} onClick={() => {
              if (!user) { setShowLogin(true); return; }
              navigate('/overview');
            }}>
              State Overview
            </button>
            <button className={path.startsWith('/constituencies') ? 'active' : ''} onClick={() => {
              if (!user) { setShowLogin(true); return; }
              navigate('/constituencies');
            }}>
              Constituencies
            </button>
            <button className={path === '/predictions' ? 'active' : ''} onClick={() => {
              if (!user) { setShowLogin(true); return; }
              navigate('/predictions');
            }}>
              {stats?.next_election_year || 'Next'} Prediction
            </button>
            <button className={path === '/community' ? 'active' : ''} onClick={() => {
              if (!user) { setShowLogin(true); return; }
              navigate('/community');
            }}>
              Community
            </button>
          </nav>
        </header>
        <main>
          <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={
              (!loading && user) ? <Navigate to="/overview" replace /> : (
                <div className="hero">
                  <div className="hero-glow" />
                  <div className="hero-content">
                    <span className="hero-badge">Free &amp; Open Source</span>
                    <h2 className="hero-title">
                      Explore {stats?.total_years || ''} Years of<br />
                      <span className="hero-accent">Election Data</span>
                    </h2>
                    <p className="hero-desc">
                      Dive into {stats?.total_constituencies || '—'} constituencies, track party swings, 
                      run what-if predictions, and share scenarios with the community.
                    </p>
                    <button className="hero-cta" onClick={() => setShowLogin(true)}>
                      Get Started
                      <span className="hero-cta-arrow">→</span>
                    </button>
                  </div>
                  <div className="hero-features">
                    <div className="hero-feature">
                      <div className="hero-feature-icon">📊</div>
                      <h3>State Overview</h3>
                      <p>Vote share trends, party dominance, and turnout patterns across decades.</p>
                    </div>
                    <div className="hero-feature">
                      <div className="hero-feature-icon">🗺️</div>
                      <h3>Constituency Deep Dive</h3>
                      <p>Swing history, winning margins, and candidate performance for every seat.</p>
                    </div>
                    <div className="hero-feature">
                      <div className="hero-feature-icon">🔮</div>
                      <h3>{stats?.next_election_year || 'Next'} Predictions</h3>
                      <p>Model scenarios with anti-incumbency, turnout, and hypothetical new parties.</p>
                    </div>
                    <div className="hero-feature">
                      <div className="hero-feature-icon">👥</div>
                      <h3>Community</h3>
                      <p>Share your prediction scenarios and vote on others' analyses.</p>
                    </div>
                  </div>
                  {stats && (
                    <div className="hero-stats">
                      <div className="hero-stat">
                        <span className="hero-stat-value">{stats.general_years.length}</span>
                        <span className="hero-stat-label">Elections</span>
                      </div>
                      <div className="hero-stat">
                        <span className="hero-stat-value">{stats.total_constituencies}</span>
                        <span className="hero-stat-label">Constituencies</span>
                      </div>
                      <div className="hero-stat">
                        <span className="hero-stat-value">{stats.total_parties}</span>
                        <span className="hero-stat-label">Parties</span>
                      </div>
                      <div className="hero-stat">
                        <span className="hero-stat-value">{(stats.total_electors_latest / 1e6).toFixed(0)}M</span>
                        <span className="hero-stat-label">Electors</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            } />
            <Route path="/overview" element={
              <RequireAuth><StateOverview /></RequireAuth>
            } />
            <Route path="/constituencies" element={
              <RequireAuth><ConstituencyList onSelect={handleSelect} /></RequireAuth>
            } />
            <Route path="/constituencies/:name" element={
              <RequireAuth><ConstituencyDetailRoute onBack={handleBack} /></RequireAuth>
            } />
            <Route path="/predictions" element={
              <RequireAuth>
                {predLoading ? (
                  <div className="loading">Loading prediction data for {stats?.total_constituencies || ''} constituencies...</div>
                ) : (
                  <>
                    <Disclaimer />
                    <div className="pred-toolbar">
                      <button className="btn-sm btn-primary" onClick={() => setShowSave(true)}>
                        Save Prediction
                      </button>
                      <button className="btn-sm btn-secondary" onClick={() => setShowBookmarks(!showBookmarks)}>
                        {showBookmarks ? 'Hide' : 'My'} Bookmarks
                      </button>
                    </div>
                    {showBookmarks && <MyBookmarks onLoad={handleLoadBookmark} />}
                    <div className="pred-layout">
                      <PredictionPanel params={predParams} onChange={setPredParams} presets={dynamicPresets} topParties={topParties} />
                      <div className="pred-main">
                        <PredictionResults
                          summary={summary}
                          actualLatest={actualLatest}
                          latestYear={predData?.latest_year}
                          nextYear={stats?.next_election_year}
                          newPartyColor={predParams.newPartyColor}
                          newPartyName={predParams.newPartyName}
                        />
                        <PredictionConstituencyTable
                          predictions={predictions}
                          onOverride={handleConstituencyOverride}
                          latestYear={predData?.latest_year}
                          nextYear={stats?.next_election_year}
                        />
                      </div>
                    </div>
                  </>
                )}
              </RequireAuth>
            } />
            <Route path="/community" element={
              <RequireAuth><CommunityFeed onLoad={handleLoadBookmark} /></RequireAuth>
            } />
            {/* Catch-all: redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </main>
        <footer className="app-footer">
          <div className="footer-content">
            <p>
              Data: <a href="https://tcpd.ashoka.edu.in/" target="_blank" rel="noopener noreferrer">
                Trivedi Centre for Political Data (TCPD), Ashoka University
              </a>
            </p>
            <p className="footer-legal">
              This tool is for analytical exploration only. Predictions are mathematical simulations,
              not electoral forecasts. Not affiliated with the Election Commission of India.
              Thanks Afrah for motivation!!!
            </p>
            <p className="footer-links">
              <a href="https://github.com/cnickson/elec" target="_blank" rel="noopener noreferrer">
                Source Code
              </a>
              {' · '}
              Open Source under MIT License
            </p>
          </div>
        </footer>

        {/* Modals */}
        {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
        {showSave && (
          <SaveBookmarkModal
            params={predParams}
            onClose={() => setShowSave(false)}
            onSaved={() => setShowSave(false)}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
