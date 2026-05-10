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
const LoginModal = lazy(() => import('./components/LoginModal'));
const UserMenu = lazy(() => import('./components/UserMenu'));
const SaveBookmarkModal = lazy(() => import('./components/SaveBookmarkModal'));
import ElectionTypeToggle from './components/ElectionTypeToggle';
import Disclaimer from './components/Disclaimer';
import ErrorBoundary from './components/ErrorBoundary';
import BottomNav from './components/BottomNav';
import { useAuth } from './contexts/AuthContext';
import { useStateSelection } from './contexts/StateContext';
import { useDebounce } from './hooks/useDebounce';
import { api } from './api';
import { DEFAULT_PREDICTION_PARAMS, normalizeParty, buildAffinityPresets } from './constants';
import {
  generateBaseline,
  applyNewParty,
  applyAllianceTransfers,
  aggregateResults,
} from './engine/predictionEngine';
import { AnimatePresence, motion } from 'motion/react';
import { pageTransition } from './lib/motion';
import Skeleton from './components/Skeleton';
import type { StatsSummary, PredictionDataResponse, AppPredictionParams } from './types';

// Prefetch heavy route chunks during idle time
if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
  requestIdleCallback(() => {
    import('./components/NationalDashboard');
    import('./components/StateOverview');
    import('./components/ConstituencyList');
  });
}

const Loading = () => (
  <div className="py-8 min-h-[60vh]">
    <Skeleton variant="header" />
    <Skeleton variant="chart" />
  </div>
);

// Wrapper for constituency detail to extract route param
function ConstituencyDetailRoute({ onBack }: { onBack: () => void }) {
  const { name } = useParams();
  return <ConstituencyDetail name={decodeURIComponent(name!)} onBack={onBack} />;
}

// Require auth — redirect to landing if not logged in
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading)
    return (
      <div className="py-8">
        <Skeleton variant="header" />
        <Skeleton variant="card" count={2} />
      </div>
    );
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
  const debouncedPredParams = useDebounce(predParams, 200);

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
    if (debouncedPredParams.totalElectors) {
      return debouncedPredParams.totalElectors / predData.total_electors_latest;
    }
    return predData.total_electors_next / predData.total_electors_latest;
  }, [predData, debouncedPredParams.totalElectors]);

  // Compute baseline predictions (only re-runs when core params change)
  const baseline = useMemo(() => {
    if (!predData) return [];
    return generateBaseline(
      predData.constituencies,
      {
        antiIncumbencyPct: debouncedPredParams.antiIncumbencyPct,
        turnoutPct: debouncedPredParams.turnoutPct,
        growthFactor,
      },
      {
        turnoutChange: debouncedPredParams.turnoutChange,
        incumbencyFatigue: debouncedPredParams.incumbencyFatigue,
        turncoatPenalty: debouncedPredParams.turncoatPenalty,
        recontestBonus: debouncedPredParams.recontestBonus,
        sameConstituencyBonus: debouncedPredParams.sameConstituencyBonus,
        previousMarginFactor: debouncedPredParams.previousMarginFactor,
        enopFactor: debouncedPredParams.enopFactor,
        nCandFactor: debouncedPredParams.nCandFactor,
        constituencyTypeFactor: debouncedPredParams.constituencyTypeFactor,
        genderFactor: debouncedPredParams.genderFactor,
        partyStrengthFactor: debouncedPredParams.partyStrengthFactor,
        partyVoteShareFactor: debouncedPredParams.partyVoteShareFactor,
      },
      predData._state || null
    );
  }, [
    predData,
    debouncedPredParams.antiIncumbencyPct,
    debouncedPredParams.turnoutPct,
    debouncedPredParams.turnoutChange,
    debouncedPredParams.incumbencyFatigue,
    debouncedPredParams.turncoatPenalty,
    debouncedPredParams.recontestBonus,
    debouncedPredParams.sameConstituencyBonus,
    debouncedPredParams.previousMarginFactor,
    debouncedPredParams.enopFactor,
    debouncedPredParams.nCandFactor,
    debouncedPredParams.constituencyTypeFactor,
    debouncedPredParams.genderFactor,
    debouncedPredParams.partyStrengthFactor,
    debouncedPredParams.partyVoteShareFactor,
    growthFactor,
  ]);

  // Apply new party on top of baseline, then alliance transfers
  const predictions = useMemo(() => {
    if (!baseline.length) return baseline;
    let result = baseline;
    if (debouncedPredParams.newPartyName && debouncedPredParams.newPartyStatewideVoteShare > 0) {
      result = applyNewParty(result, {
        name: debouncedPredParams.newPartyName,
        color: debouncedPredParams.newPartyColor,
        statewideVoteShare: debouncedPredParams.newPartyStatewideVoteShare,
        affinityWeights: debouncedPredParams.affinityWeights,
        constituencyOverrides: debouncedPredParams.constituencyOverrides,
      });
    }
    if (debouncedPredParams.allianceConfig.length > 0) {
      result = applyAllianceTransfers(result, debouncedPredParams.allianceConfig);
    }
    return result;
  }, [
    baseline,
    debouncedPredParams.newPartyName,
    debouncedPredParams.newPartyColor,
    debouncedPredParams.newPartyStatewideVoteShare,
    debouncedPredParams.affinityWeights,
    debouncedPredParams.constituencyOverrides,
    debouncedPredParams.allianceConfig,
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
      <div className="app min-h-screen bg-neutral-950 text-neutral-200 px-4 pb-16 md:px-8 md:pb-0">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-neutral-900 focus:text-primary-400 focus:px-4 focus:py-2 focus:rounded"
        >
          Skip to main content
        </a>
        <header
          role="banner"
          className="border-b border-neutral-800 px-2 py-4 mb-4 md:px-0 md:py-6 md:mb-5"
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold tracking-tight text-white md:text-2xl lg:text-3xl">
                {isNational
                  ? 'National Election Dashboard'
                  : `${stats?.state_name || 'Election'}${electionType === 'GE' ? ' Lok Sabha' : ''} Election Analysis`}
              </h1>
              <p className="text-xs text-neutral-400 mt-1 md:text-sm">
                {isNational
                  ? 'Cross-state election analysis across India'
                  : stats
                    ? `${electionType === 'GE' ? 'Lok Sabha' : 'Assembly'} Elections ${stats.year_min}–${stats.year_max} · ${stats.total_constituencies} Constituencies · ${stats.general_years.length} General Elections`
                    : 'Loading…'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:gap-3">
              {/* Mode switcher */}
              <div className="flex border border-neutral-700 rounded-lg overflow-hidden">
                <button
                  className={`px-3 py-2 text-sm min-h-[44px] md:min-h-0 md:py-1.5 transition-colors ${mode === 'national' ? 'bg-saffron text-black font-semibold' : 'bg-transparent text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}
                  onClick={() => navigate('/national')}
                >
                  National
                </button>
                <button
                  className={`px-3 py-2 text-sm min-h-[44px] md:min-h-0 md:py-1.5 transition-colors ${mode === 'state' ? 'bg-saffron text-black font-semibold' : 'bg-transparent text-neutral-400 hover:bg-neutral-800 hover:text-white'}`}
                  onClick={() => navigate(`/state/${selectedState}/overview`)}
                >
                  State Analysis
                </button>
              </div>
              {!isNational && (
                <>
                  <select
                    value={selectedState}
                    aria-label="Select state"
                    className="bg-surface border border-neutral-800 text-neutral-200 rounded-md px-3 py-2 text-sm max-w-[180px] min-h-[44px] md:min-h-0 md:py-1.5 cursor-pointer"
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
                  <ElectionTypeToggle />
                </>
              )}
              {user ? (
                <Suspense fallback={null}>
                  <UserMenu />
                </Suspense>
              ) : (
                <button
                  className="bg-primary-400 text-black font-semibold px-5 py-2 rounded-md text-sm min-h-[44px] md:min-h-0 md:py-2 hover:opacity-90 transition-opacity cursor-pointer"
                  onClick={() => setShowLogin(true)}
                >
                  Sign In
                </button>
              )}
            </div>
          </div>
          {!isNational && (
            <nav
              role="navigation"
              aria-label="State navigation"
              className="hidden md:flex justify-center gap-2 mt-3"
            >
              <button
                className={`px-5 py-2 rounded-md text-sm transition-all cursor-pointer border ${path.endsWith('/overview') ? 'bg-primary-400 text-black border-primary-400 font-semibold' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-primary-400 hover:text-neutral-200'}`}
                onClick={() => {
                  navigate(`/state/${selectedState}/overview`);
                }}
              >
                State Overview
              </button>
              <button
                className={`px-5 py-2 rounded-md text-sm transition-all cursor-pointer border ${path.includes('/constituencies') ? 'bg-primary-400 text-black border-primary-400 font-semibold' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-primary-400 hover:text-neutral-200'}`}
                onClick={() => {
                  navigate(`/state/${selectedState}/constituencies`);
                }}
              >
                Constituencies
              </button>
              {electionType === 'AE' && (
                <button
                  className={`px-5 py-2 rounded-md text-sm transition-all cursor-pointer border ${path.endsWith('/predictions') ? 'bg-primary-400 text-black border-primary-400 font-semibold' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-primary-400 hover:text-neutral-200'}`}
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
                className={`px-5 py-2 rounded-md text-sm transition-all cursor-pointer border ${path.endsWith('/community') ? 'bg-primary-400 text-black border-primary-400 font-semibold' : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-primary-400 hover:text-neutral-200'}`}
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
        <main id="main-content" role="main">
          <Suspense fallback={<Loading />}>
            <AnimatePresence mode="wait">
              <motion.div key={path} {...pageTransition}>
                <Routes>
                  {/* Landing page */}
                  <Route
                    path="/"
                    element={
                      !loading && user ? (
                        <Navigate to="/national" replace />
                      ) : (
                        <div className="relative text-center py-12 px-4 md:py-20">
                          <div className="absolute inset-0 bg-gradient-to-b from-primary-900/20 to-transparent rounded-2xl pointer-events-none" />
                          <div className="relative max-w-2xl mx-auto">
                            <span className="inline-block bg-primary-900/40 text-primary-300 text-xs font-medium px-3 py-1 rounded-full mb-4">
                              Free &amp; Open Source
                            </span>
                            <h2 className="text-2xl font-bold text-white mb-3 md:text-4xl lg:text-5xl">
                              Explore {stats?.total_years || ''} Years of
                              <br />
                              <span className="text-primary-300">Election Data</span>
                            </h2>
                            <p className="text-neutral-400 text-sm mb-6 max-w-lg mx-auto md:text-base">
                              Dive into {stats?.total_constituencies || '—'} constituencies, track
                              party swings, run what-if predictions, and share scenarios with the
                              community.
                            </p>
                            <button
                              className="bg-primary-400 text-black font-semibold px-8 py-3 rounded-lg text-base min-h-[44px] hover:opacity-90 transition-opacity cursor-pointer"
                              onClick={() => setShowLogin(true)}
                            >
                              Get Started
                              <span className="ml-2">→</span>
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-3 mt-10 md:grid-cols-4 md:gap-4">
                            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center">
                              <div className="text-2xl mb-2">📊</div>
                              <h3 className="text-sm font-semibold text-white mb-1">
                                State Overview
                              </h3>
                              <p className="text-xs text-neutral-400">
                                Vote share trends, party dominance, and turnout patterns across
                                decades.
                              </p>
                            </div>
                            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center">
                              <div className="text-2xl mb-2">🗺️</div>
                              <h3 className="text-sm font-semibold text-white mb-1">
                                National Dashboard
                              </h3>
                              <p className="text-xs text-neutral-400">
                                Interactive India map, party strength, state comparison, and
                                election timeline.
                              </p>
                            </div>
                            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center">
                              <div className="text-2xl mb-2">🔮</div>
                              <h3 className="text-sm font-semibold text-white mb-1">
                                {stats?.next_election_year || 'Next'} Predictions
                              </h3>
                              <p className="text-xs text-neutral-400">
                                Model scenarios with anti-incumbency, turnout, and hypothetical new
                                parties.
                              </p>
                            </div>
                            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-center">
                              <div className="text-2xl mb-2">👥</div>
                              <h3 className="text-sm font-semibold text-white mb-1">Community</h3>
                              <p className="text-xs text-neutral-400">
                                Share your prediction scenarios and vote on others' analyses.
                              </p>
                            </div>
                          </div>
                          {stats && (
                            <div className="grid grid-cols-2 gap-3 mt-6 md:grid-cols-4">
                              <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3 text-center">
                                <span className="block text-xl font-bold text-primary-300">
                                  {stats.general_years.length}
                                </span>
                                <span className="text-xs text-neutral-400">Elections</span>
                              </div>
                              <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3 text-center">
                                <span className="block text-xl font-bold text-primary-300">
                                  {stats.total_constituencies}
                                </span>
                                <span className="text-xs text-neutral-400">Constituencies</span>
                              </div>
                              <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3 text-center">
                                <span className="block text-xl font-bold text-primary-300">
                                  {stats.total_parties}
                                </span>
                                <span className="text-xs text-neutral-400">Parties</span>
                              </div>
                              <div className="bg-neutral-900/60 border border-neutral-800 rounded-lg p-3 text-center">
                                <span className="block text-xl font-bold text-primary-300">
                                  {((stats.total_electors_latest ?? 0) / 1e6).toFixed(0)}M
                                </span>
                                <span className="text-xs text-neutral-400">Electors</span>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    }
                  />

                  {/* National dashboard routes */}
                  <Route path="/national" element={<NationalDashboard initialTab="map" />} />
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
                          navigate(
                            `/state/${selectedState}/constituencies/${encodeURIComponent(name)}`
                          )
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
                          <div className="text-center py-16 text-neutral-400">
                            Loading prediction data for {stats?.total_constituencies || ''}{' '}
                            constituencies...
                          </div>
                        ) : (
                          <>
                            <Disclaimer />
                            <div className="flex flex-wrap gap-2 mb-4">
                              <button
                                className="bg-primary-400 text-black font-semibold text-sm px-4 py-2 rounded-md min-h-[44px] md:min-h-0 hover:opacity-90 transition-opacity cursor-pointer"
                                onClick={() => setShowSave(true)}
                              >
                                Save Prediction
                              </button>
                              <button
                                className="bg-neutral-800 text-neutral-200 text-sm px-4 py-2 rounded-md min-h-[44px] md:min-h-0 border border-neutral-700 hover:bg-neutral-700 transition-colors cursor-pointer"
                                onClick={() => setShowBookmarks(!showBookmarks)}
                              >
                                {showBookmarks ? 'Hide' : 'My'} Bookmarks
                              </button>
                            </div>
                            {showBookmarks && <MyBookmarks onLoad={handleLoadBookmark} />}
                            <div className="flex flex-col lg:flex-row gap-4">
                              <PredictionPanel
                                params={predParams}
                                onChange={setPredParams}
                                presets={dynamicPresets}
                                topParties={topParties}
                                stateName={selectedState}
                              />
                              <div className="flex-1 min-w-0">
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
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </main>
        <footer className="border-t border-neutral-800 mt-8 py-6 text-center text-xs text-neutral-400">
          <div className="max-w-3xl mx-auto px-4 space-y-2">
            <p>
              Data:{' '}
              <a
                href="https://tcpd.ashoka.edu.in/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-400 hover:underline"
              >
                Trivedi Centre for Political Data (TCPD), Ashoka University
              </a>
            </p>
            <p>
              This tool is for analytical exploration only. Predictions are mathematical
              simulations, not electoral forecasts. Not affiliated with the Election Commission of
              India. Thanks Afrah for motivation!!!
            </p>
            <p className="space-x-1">
              <a
                href="/privacy"
                className="text-primary-400 hover:underline"
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
                className="text-primary-400 hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  navigate('/terms');
                }}
              >
                Terms of Service
              </a>
              {' · '}
              <a
                href="https://github.com/cnickson/elec"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-400 hover:underline"
              >
                Source Code
              </a>
              {' · '}
              Open Source under MIT License
            </p>
          </div>
        </footer>

        {/* Modals */}
        <Suspense fallback={null}>
          <LoginModal open={showLogin} onOpenChange={setShowLogin} />
        </Suspense>
        <Suspense fallback={null}>
          {showSave && (
            <SaveBookmarkModal
              params={predParams}
              stateName={selectedState}
              open={showSave}
              onOpenChange={setShowSave}
              onSaved={() => setShowSave(false)}
            />
          )}
        </Suspense>

        {/* Mobile bottom navigation */}
        <BottomNav selectedState={selectedState} />
      </div>
    </ErrorBoundary>
  );
}
