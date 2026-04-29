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
const NationalDashboard = lazy(() => import('./components/NationalDashboard'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./components/TermsOfService'));
const PricingPage = lazy(() => import('./components/PricingPage'));
const SupportPage = lazy(() => import('./components/SupportPage'));
import LoginModal from './components/LoginModal';
import UserMenu from './components/UserMenu';
import SaveBookmarkModal from './components/SaveBookmarkModal';
import ElectionTypeToggle from './components/ElectionTypeToggle';
import Disclaimer from './components/Disclaimer';
import ErrorBoundary from './components/ErrorBoundary';
import { useAuth } from './contexts/AuthContext';
import { useStateSelection } from './contexts/StateContext';
import { api } from './api';
import { DEFAULT_PREDICTION_PARAMS, normalizeParty, buildAffinityPresets } from './constants';
import { generateBaseline, applyNewParty, aggregateResults } from './engine/predictionEngine';
import type { StatsSummary, PredictionDataResponse, AppPredictionParams } from './types';
import './index.css';

const Loading = () => <div className="loading">Loading…</div>;

// Wrapper for constituency detail to extract route param
function ConstituencyDetailRoute({ onBack }: { onBack: () => void }) {
  const { name } = useParams();
  return <ConstituencyDetail name={decodeURIComponent(name!)} onBack={onBack} />;
}

// Require auth — redirect to landing if not logged in
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading">Loading…</div>;
  if (!user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user, loading } = useAuth();
  const { states, selectedState, selectState, electionType } = useStateSelection();
  const navigate = useNavigate();
  const location = useLocation();
  const [showLogin, setShowLogin] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);

  // App-level stats (drives dynamic headings)
  const [stats, setStats] = useState<StatsSummary | null>(null);

  // Prediction state
  const [predData, setPredData] = useState<(PredictionDataResponse & { _state?: string }) | null>(
    null
  );
  const [predLoading, setPredLoading] = useState(false);
  const [predParams, setPredParams] = useState<AppPredictionParams>({
    ...DEFAULT_PREDICTION_PARAMS,
  });

  // Load stats when state or election type changes
  useEffect(() => {
    if (!selectedState) return;
    setStats(null);
    api.stats(selectedState, electionType).then(setStats).catch(console.error);
  }, [selectedState, electionType]);

  // Redirect authenticated users from landing to national dashboard
  useEffect(() => {
    if (user && location.pathname === '/') {
      navigate('/national', { replace: true });
    }
  }, [user, location.pathname, navigate]);

  // Load prediction data when on prediction route (AE only)
  const onPrediction = location.pathname.includes('/predictions');
  useEffect(() => {
    if (
      onPrediction &&
      electionType === 'AE' &&
      selectedState &&
      (!predData || predData._state !== selectedState)
    ) {
      setPredLoading(true);
      api
        .predictionData(selectedState)
        .then((data) => {
          data._state = selectedState;
          setPredData(data);
        })
        .catch(console.error)
        .finally(() => setPredLoading(false));
    }
  }, [onPrediction, selectedState, predData, electionType]);

  // Derive top parties and dynamic affinity presets from prediction data
  const topParties = useMemo(() => {
    if (!predData) return [];
    const seats: Record<string, number> = {};
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
  }, [
    baseline,
    predParams.newPartyName,
    predParams.newPartyColor,
    predParams.newPartyStatewideVoteShare,
    predParams.affinityWeights,
    predParams.constituencyOverrides,
  ]);

  const summary = useMemo(() => aggregateResults(predictions), [predictions]);

  // Build actual seat counts from latest election for comparison
  const actualLatest = useMemo(() => {
    if (!predData) return [];
    const seats: Record<string, number> = {};
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
    (name: string) => {
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
  const handleLoadBookmark = useCallback(
    (params: Record<string, unknown> | null) => {
      if (params) {
        const { state_name, ...rest } = params;
        setPredParams({ ...DEFAULT_PREDICTION_PARAMS, ...rest } as AppPredictionParams);
        setShowBookmarks(false);
        const targetState = (state_name as string) || selectedState;
        if (targetState !== selectedState) {
          selectState(targetState);
          setPredData(null);
        }
        navigate(`/state/${targetState}/predictions`);
      }
    },
    [navigate, selectedState, selectState]
  );

  // Determine active nav from path
  const path = location.pathname;
  const isNational = path.startsWith('/national');
  const mode = isNational ? 'national' : 'state';

  // Sync state from URL for /state/:name/* routes
  useEffect(() => {
    const match = path.match(/^\/state\/([^/]+)/);
    if (match && match[1] !== selectedState) {
      const urlState = decodeURIComponent(match[1]);
      const valid = states.find((s) => s.state_name === urlState);
      if (valid) {
        selectState(urlState);
        setPredData(null);
        setPredParams({ ...DEFAULT_PREDICTION_PARAMS });
      }
    }
  }, [path, states]);

  return (
    <ErrorBoundary>
      <div className="app">
        <header>
          <div className="header-top">
            <div>
              <h1>
                {isNational
                  ? 'National Election Dashboard'
                  : `${stats?.state_name || 'Election'}${electionType === 'GE' ? ' Lok Sabha' : ''} Election Analysis`}
              </h1>
              <p className="subtitle">
                {isNational
                  ? 'Cross-state election analysis across India'
                  : stats
                    ? `${electionType === 'GE' ? 'Lok Sabha' : 'Assembly'} Elections ${stats.year_min}–${stats.year_max} · ${stats.total_constituencies} Constituencies · ${stats.general_years.length} General Elections`
                    : 'Loading…'}
              </p>
            </div>
            <div className="header-actions">
              {/* Mode switcher */}
              <div className="mode-switcher">
                <button
                  className={`mode-btn ${mode === 'national' ? 'active' : ''}`}
                  onClick={() => navigate('/national')}
                >
                  National
                </button>
                <button
                  className={`mode-btn ${mode === 'state' ? 'active' : ''}`}
                  onClick={() => navigate(`/state/${selectedState}/overview`)}
                >
                  State Analysis
                </button>
              </div>
              {!isNational && (
                <>
                  <div className="state-selector">
                    <select
                      value={selectedState}
                      onChange={(e) => {
                        selectState(e.target.value);
                        setPredData(null);
                        setPredParams({ ...DEFAULT_PREDICTION_PARAMS });
                        navigate(`/state/${e.target.value}/overview`);
                      }}
                    >
                      {states
                        .slice()
                        .sort((a, b) => a.display_name.localeCompare(b.display_name))
                        .map((s) => (
                          <option key={s.state_name} value={s.state_name}>
                            {s.display_name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <ElectionTypeToggle />
                </>
              )}
              {user ? (
                <UserMenu />
              ) : (
                <button className="btn-login" onClick={() => setShowLogin(true)}>
                  Sign In
                </button>
              )}
            </div>
          </div>
          {!isNational && (
            <nav>
              <button
                className={path.endsWith('/overview') ? 'active' : ''}
                onClick={() => {
                  navigate(`/state/${selectedState}/overview`);
                }}
              >
                State Overview
              </button>
              <button
                className={path.includes('/constituencies') ? 'active' : ''}
                onClick={() => {
                  navigate(`/state/${selectedState}/constituencies`);
                }}
              >
                Constituencies
              </button>
              {electionType === 'AE' && (
                <button
                  className={path.endsWith('/predictions') ? 'active' : ''}
                  onClick={() => {
                    if (!user) {
                      setShowLogin(true);
                      return;
                    }
                    navigate(`/state/${selectedState}/predictions`);
                  }}
                >
                  {stats?.next_election_year || 'Next'} Prediction
                </button>
              )}
              <button
                className={path.endsWith('/community') ? 'active' : ''}
                onClick={() => {
                  if (!user) {
                    setShowLogin(true);
                    return;
                  }
                  navigate(`/state/${selectedState}/community`);
                }}
              >
                Community
              </button>
            </nav>
          )}
        </header>
        <main>
          <Suspense fallback={<Loading />}>
            <Routes>
              {/* Landing page */}
              <Route
                path="/"
                element={
                  !loading && user ? (
                    <Navigate to="/national" replace />
                  ) : (
                    <div className="hero">
                      <div className="hero-glow" />
                      <div className="hero-content">
                        <span className="hero-badge">Free &amp; Open Source</span>
                        <h2 className="hero-title">
                          Explore {stats?.total_years || ''} Years of
                          <br />
                          <span className="hero-accent">Election Data</span>
                        </h2>
                        <p className="hero-desc">
                          Dive into {stats?.total_constituencies || '—'} constituencies, track party
                          swings, run what-if predictions, and share scenarios with the community.
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
                          <p>
                            Vote share trends, party dominance, and turnout patterns across decades.
                          </p>
                        </div>
                        <div className="hero-feature">
                          <div className="hero-feature-icon">🗺️</div>
                          <h3>National Dashboard</h3>
                          <p>
                            Interactive India map, party strength, state comparison, and election
                            timeline.
                          </p>
                        </div>
                        <div className="hero-feature">
                          <div className="hero-feature-icon">🔮</div>
                          <h3>{stats?.next_election_year || 'Next'} Predictions</h3>
                          <p>
                            Model scenarios with anti-incumbency, turnout, and hypothetical new
                            parties.
                          </p>
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
                            <span className="hero-stat-value">
                              {((stats.total_electors_latest ?? 0) / 1e6).toFixed(0)}M
                            </span>
                            <span className="hero-stat-label">Electors</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                }
              />

              {/* National dashboard routes */}
              <Route path="/national" element={<NationalDashboard initialTab="overview" />} />
              <Route
                path="/national/parties"
                element={<NationalDashboard initialTab="parties" />}
              />
              <Route
                path="/national/compare"
                element={<NationalDashboard initialTab="compare" />}
              />
              <Route
                path="/national/timeline"
                element={<NationalDashboard initialTab="timeline" />}
              />

              {/* State-scoped routes */}
              <Route path="/state/:stateName/overview" element={<StateOverview />} />
              <Route
                path="/state/:stateName/constituencies"
                element={
                  <ConstituencyList
                    onSelect={(name) =>
                      navigate(`/state/${selectedState}/constituencies/${encodeURIComponent(name)}`)
                    }
                  />
                }
              />
              <Route
                path="/state/:stateName/constituencies/:name"
                element={
                  <ConstituencyDetailRoute
                    onBack={() => navigate(`/state/${selectedState}/constituencies`)}
                  />
                }
              />
              <Route
                path="/state/:stateName/predictions"
                element={
                  <RequireAuth>
                    {electionType === 'GE' ? (
                      <Navigate to={`/state/${selectedState}/overview`} replace />
                    ) : predLoading ? (
                      <div className="loading">
                        Loading prediction data for {stats?.total_constituencies || ''}{' '}
                        constituencies...
                      </div>
                    ) : (
                      <>
                        <Disclaimer />
                        <div className="pred-toolbar">
                          <button className="btn-sm btn-primary" onClick={() => setShowSave(true)}>
                            Save Prediction
                          </button>
                          <button
                            className="btn-sm btn-secondary"
                            onClick={() => setShowBookmarks(!showBookmarks)}
                          >
                            {showBookmarks ? 'Hide' : 'My'} Bookmarks
                          </button>
                        </div>
                        {showBookmarks && <MyBookmarks onLoad={handleLoadBookmark} />}
                        <div className="pred-layout">
                          <PredictionPanel
                            params={predParams}
                            onChange={setPredParams}
                            presets={dynamicPresets}
                            topParties={topParties}
                          />
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
                }
              />
              <Route
                path="/state/:stateName/community"
                element={
                  <RequireAuth>
                    <CommunityFeed onLoad={handleLoadBookmark} />
                  </RequireAuth>
                }
              />

              {/* Legal pages */}
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/pricing" element={<PricingPage />} />
              <Route path="/support" element={<SupportPage />} />

              {/* Backward compatibility redirects */}
              <Route
                path="/overview"
                element={<Navigate to={`/state/${selectedState}/overview`} replace />}
              />
              <Route
                path="/constituencies"
                element={<Navigate to={`/state/${selectedState}/constituencies`} replace />}
              />
              <Route
                path="/constituencies/:name"
                element={<Navigate to={`/state/${selectedState}/constituencies`} replace />}
              />
              <Route
                path="/predictions"
                element={<Navigate to={`/state/${selectedState}/predictions`} replace />}
              />
              <Route
                path="/community"
                element={<Navigate to={`/state/${selectedState}/community`} replace />}
              />

              {/* Catch-all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
        <footer className="app-footer">
          <div className="footer-content">
            <p>
              Data:{' '}
              <a href="https://tcpd.ashoka.edu.in/" target="_blank" rel="noopener noreferrer">
                Trivedi Centre for Political Data (TCPD), Ashoka University
              </a>
            </p>
            <p className="footer-legal">
              This tool is for analytical exploration only. Predictions are mathematical
              simulations, not electoral forecasts. Not affiliated with the Election Commission of
              India. Thanks Afrah for motivation!!!
            </p>
            <p className="footer-links">
              <a
                href="/privacy"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/privacy');
                }}
              >
                Privacy Policy
              </a>
              {' · '}
              <a
                href="/terms"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/terms');
                }}
              >
                Terms of Service
              </a>
              {' · '}
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
            stateName={selectedState}
            onClose={() => setShowSave(false)}
            onSaved={() => setShowSave(false)}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
